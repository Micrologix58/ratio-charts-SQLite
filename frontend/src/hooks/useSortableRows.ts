import { useMemo, useState } from "react";

export type SortDirection = "asc" | "desc";
export type GetSortValue<T, K extends string> = (row: T, key: K) => string | number | null | undefined;

/**
 * Nulls/undefined always sort last regardless of direction — most of these tables show
 * financial fields that are legitimately unset (no basis price yet, etc.), and burying
 * them at the bottom reads better than interleaving them by column semantics.
 */
export function buildComparator<T, K extends string>(
    getValue: GetSortValue<T, K>,
    sortKey: K | null,
    direction: SortDirection
): (a: T, b: T) => number {
    if (!sortKey) return () => 0;

    return (a, b) => {
        const av = getValue(a, sortKey);
        const bv = getValue(b, sortKey);

        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;

        const cmp =
            typeof av === "string" || typeof bv === "string"
                ? String(av).localeCompare(String(bv))
                : av - bv;

        return direction === "asc" ? cmp : -cmp;
    };
}

/** Generic click-header-to-sort behavior for plain <table> rows. */
export function useSortableRows<T, K extends string>(
    rows: T[],
    getValue: GetSortValue<T, K>,
    initial?: { key: K; direction: SortDirection }
) {
    const [sortKey, setSortKey] = useState<K | null>(initial?.key ?? null);
    const [direction, setDirection] = useState<SortDirection>(initial?.direction ?? "asc");

    function requestSort(key: K) {
        if (key === sortKey) {
            setDirection((d) => (d === "asc" ? "desc" : "asc"));
        } else {
            setSortKey(key);
            setDirection("asc");
        }
    }

    const sortedRows = useMemo(() => {
        if (!sortKey) return rows;
        return [...rows].sort(buildComparator(getValue, sortKey, direction));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rows, sortKey, direction]);

    function sortIndicator(key: K): string {
        if (key !== sortKey) return "";
        return direction === "asc" ? " ▲" : " ▼";
    }

    return { sortedRows, sortKey, direction, requestSort, sortIndicator };
}
