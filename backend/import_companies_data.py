"""
One-time import of real Companies row data exported from the live MSSQL
database (SSMS Generate Scripts, data-only, UTF-16). Parses the generated
INSERT [dbo].[Companies] (...) VALUES (...) statements and loads them into
the SQLite Companies table.

Note: free-text columns (e.g. InvestmentThesis) can contain literal
parentheses, commas, and newlines, so this parses the whole file as one
string with paren-depth + string-literal tracking rather than line-by-line.

Usage:
    python import_companies_data.py <path-to-companies_data.sql>
"""
import re
import sys

import db

PREFIX = "INSERT [dbo].[Companies] ("


def find_matching_paren(text: str, start: int) -> int:
    """start points at the character right after an opening '('. Returns
    the index of the matching ')', skipping over N'...' string literals
    (with '' escapes) so parens/commas inside text values don't confuse
    depth tracking."""
    depth = 1
    i = start
    n = len(text)
    while i < n:
        ch = text[i]
        if ch == "'":
            i += 1
            while i < n:
                if text[i] == "'":
                    if i + 1 < n and text[i + 1] == "'":
                        i += 2
                        continue
                    i += 1
                    break
                i += 1
            continue
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
            if depth == 0:
                return i
        i += 1
    raise ValueError("Unbalanced parentheses")


def tokenize_values(values_str: str):
    tokens = []
    i = 0
    n = len(values_str)

    while i < n:
        ch = values_str[i]

        if ch in " \t\n\r":
            i += 1
            continue

        if ch == ",":
            i += 1
            continue

        if values_str.startswith("NULL", i) and (i + 4 == n or values_str[i + 4] in ", )"):
            tokens.append(None)
            i += 4
            continue

        if values_str.startswith("N'", i):
            j = i + 2
            buf = []
            while j < n:
                if values_str[j] == "'":
                    if j + 1 < n and values_str[j + 1] == "'":
                        buf.append("'")
                        j += 2
                        continue
                    j += 1
                    break
                buf.append(values_str[j])
                j += 1
            tokens.append(("STR", "".join(buf)))
            i = j
            continue

        if values_str.startswith("CAST(", i):
            close = find_matching_paren(values_str, i + 5)
            inner = values_str[i + 5:close]
            m = re.match(r"N'(.*)' AS (\w+)", inner, re.DOTALL)
            if m:
                raw = m.group(1).replace("''", "'")
                tokens.append(("CAST", raw, m.group(2)))
            else:
                tokens.append(("RAW", inner))
            i = close + 1
            continue

        m = re.match(r"-?\d+\.?\d*", values_str[i:])
        if m and m.group(0):
            tokens.append(("NUM", m.group(0)))
            i += len(m.group(0))
            continue

        raise ValueError(f"Unrecognized token at position {i}: {values_str[i:i+50]!r}")

    return tokens


def convert_token(tok):
    if tok is None:
        return None
    kind = tok[0]
    if kind == "STR":
        return tok[1]
    if kind == "NUM":
        s = tok[1]
        return float(s) if "." in s else int(s)
    if kind == "CAST":
        raw, sql_type = tok[1], tok[2]
        if sql_type == "DateTime2":
            return raw.replace("T", " ").split(".")[0]
        return raw
    if kind == "RAW":
        return tok[1]
    raise ValueError(f"Unknown token kind: {kind}")


def parse_all_rows(content: str):
    rows = []
    errors = []
    pos = 0

    while True:
        idx = content.find(PREFIX, pos)
        if idx == -1:
            break

        col_start = idx + len(PREFIX)
        try:
            col_end = find_matching_paren(content, col_start)
            columns = [c.strip().strip("[]") for c in content[col_start:col_end].split(",")]

            values_marker = " VALUES ("
            vstart = content.index(values_marker, col_end) + len(values_marker)
            vend = find_matching_paren(content, vstart)
            values_str = content[vstart:vend]

            tokens = tokenize_values(values_str)
            values = [convert_token(t) for t in tokens]

            if len(values) != len(columns):
                raise ValueError(f"Column/value count mismatch: {len(columns)} cols vs {len(values)} values")

            rows.append(dict(zip(columns, values)))
            pos = vend + 1
        except Exception as e:
            errors.append((idx, str(e)))
            pos = idx + len(PREFIX)

    return rows, errors


def main():
    if len(sys.argv) < 2:
        print("Usage: python import_companies_data.py <path-to-companies_data.sql>")
        sys.exit(1)

    source_path = sys.argv[1]
    dry_run = "--dry-run" in sys.argv

    with open(source_path, "r", encoding="utf-16") as f:
        content = f.read()

    rows, errors = parse_all_rows(content)

    print(f"Parsed {len(rows)} rows ({len(errors)} errors)")
    for idx, err in errors[:10]:
        print(f"  offset {idx}: {err}")

    if not rows:
        return

    if dry_run:
        for r in rows[:3]:
            print(r)
        return

    columns = list(rows[0].keys())
    placeholders = ", ".join("?" for _ in columns)
    col_list = ", ".join(f'"{c}"' for c in columns)
    sql = f'INSERT OR REPLACE INTO Companies ({col_list}) VALUES ({placeholders})'

    conn = db.get_connection()
    try:
        cur = conn.cursor()
        cur.executemany(sql, [tuple(r[c] for c in columns) for r in rows])
        conn.commit()
        print(f"Inserted {len(rows)} rows into Companies")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
