const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const db = require("./db");

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

const chartsDir = path.join(__dirname, "charts");
if (!fs.existsSync(chartsDir)) {
    fs.mkdirSync(chartsDir);
}

// Helper: map chart id to file path
function chartPath(id) {
    const safeId = id.replace(/[^a-zA-Z0-9_\-|\.\=]/g, "_");
    return path.join(chartsDir, `${safeId}.json`);
}

// GET /api/charts/:id
app.get("/api/charts/:id", (req, res) => {
    const file = chartPath(req.params.id);
    if (!fs.existsSync(file)) {
        return res.status(404).json({ error: "Not found" });
    }
    const json = fs.readFileSync(file, "utf8");
    res.json(JSON.parse(json));
});

// PUT /api/charts/:id
app.put("/api/charts/:id", (req, res) => {
    const file = chartPath(req.params.id);
    fs.writeFileSync(file, JSON.stringify(req.body, null, 2), "utf8");
    res.json({ ok: true });
});

// Monthly / Weekly / Daily OHLC data

const MARKETDATA_QUERIES = {
    D: `
        SELECT
            PriceDate  AS t,
            OpenPrice  AS "open",
            HighPrice  AS "high",
            LowPrice   AS "low",
            ClosePrice AS "close",
            Volume     AS "volume"
        FROM PriceHistory
        WHERE TickerSymbol = ?
        ORDER BY PriceDate
    `,
    W: `
        SELECT
            t,
            "Open"  AS "open",
            "High"  AS "high",
            "Low"   AS "low",
            "Close" AS "close"
        FROM WeeklyPriceHistory
        WHERE TickerSymbol = ?
        ORDER BY t
    `,
    M: `
        SELECT
            t,
            "Open"  AS "open",
            "High"  AS "high",
            "Low"   AS "low",
            "Close" AS "close"
        FROM MonthlyPriceHistory
        WHERE TickerSymbol = ?
        ORDER BY t
    `,
};

app.get("/api/marketdata", (req, res) => {
    try {
        const symbol = String(req.query.symbol || "").toUpperCase().trim();
        const tf = String(req.query.tf || "D").toUpperCase().trim();

        if (!symbol) {
            return res.status(400).json({ error: "symbol is required" });
        }

        const query = MARKETDATA_QUERIES[tf];
        if (!query) {
            return res.status(400).json({ error: "tf must be D, W, or M" });
        }

        console.log("marketdata request:", { symbol, tf });

        const rows = db.prepare(query).all(symbol);

        console.log("marketdata rows:", rows.length);

        res.json(rows);
    } catch (err) {
        console.error("marketdata error:", err);
        res.status(500).json({ error: err.message });
    }
});

// Shared helper: load all annotations from disk
function loadAllAnnotations() {
    const file = path.join(chartsDir, "annotations.json");
    if (!fs.existsSync(file)) return [];
    try {
        return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
        return [];
    }
}

// Shared helper: persist all annotations to disk
function saveAllAnnotations(annotations) {
    const file = path.join(chartsDir, "annotations.json");
    fs.writeFileSync(file, JSON.stringify(annotations, null, 2), "utf8");
}

// GET /api/annotations?mode=S&timeframe=D&symbol=CNQ
// GET /api/annotations?mode=R&timeframe=W&expression=GLD/SPY
app.get("/api/annotations", (req, res) => {
    try {
        const all = loadAllAnnotations();

        const mode      = String(req.query.mode      || "").toUpperCase();
        const timeframe = String(req.query.timeframe || "").toUpperCase();
        const symbol    = String(req.query.symbol    || "").toUpperCase();
        const expression = String(req.query.expression || "").toUpperCase();

        // If no filter params supplied, return everything (used by frontend
        // which does its own client-side filtering via chartKey)
        if (!mode && !timeframe && !symbol && !expression) {
            return res.json({ success: true, data: all });
        }

        const data = all.filter((ann) => {
            const key = ann.chartKey;
            if (mode      && (key.mode      || "").toUpperCase() !== mode)      return false;
            if (timeframe && (key.timeframe || "").toUpperCase() !== timeframe) return false;
            if (expression) return (key.expression || "").toUpperCase() === expression;
            if (symbol)     return (key.symbol     || "").toUpperCase() === symbol;
            return true;
        });

        console.log(`GET /api/annotations — returning ${data.length} of ${all.length}`);
        res.json({ success: true, data });
    } catch (err) {
        console.error("GET /api/annotations error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST /api/annotations  — body: Annotation object
app.post("/api/annotations", (req, res) => {
    try {
        const annotation = req.body;

        if (!annotation || !annotation.id || !annotation.type || !annotation.chartKey) {
            return res.status(400).json({ success: false, error: "Invalid annotation body" });
        }

        const all = loadAllAnnotations();

        // Upsert: replace if id already exists, otherwise append
        const idx = all.findIndex((a) => a.id === annotation.id);
        if (idx >= 0) {
            all[idx] = annotation;
        } else {
            all.push(annotation);
        }

        saveAllAnnotations(all);
        console.log(`POST /api/annotations — saved id=${annotation.id}, total=${all.length}`);
        res.json({ success: true, data: annotation });
    } catch (err) {
        console.error("POST /api/annotations error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// DELETE /api/annotations/:id
app.delete("/api/annotations/:id", (req, res) => {
    try {
        const id = req.params.id;
        const all = loadAllAnnotations();
        const filtered = all.filter((a) => a.id !== id);

        if (filtered.length === all.length) {
            return res.status(404).json({ success: false, error: `Annotation ${id} not found` });
        }

        saveAllAnnotations(filtered);
        console.log(`DELETE /api/annotations/${id} — ${all.length - filtered.length} removed, total=${filtered.length}`);
        res.json({ success: true });
    } catch (err) {
        console.error("DELETE /api/annotations error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ─── Watchlists ─────────────────────────────────────────────────────────────

const watchlistsFile = path.join(chartsDir, "watchlists.json");

function loadWatchlists() {
    if (!fs.existsSync(watchlistsFile)) return [];
    try {
        const data = JSON.parse(fs.readFileSync(watchlistsFile, "utf8"));
        // Migrate legacy string[] tickers to Entry[] format
        return data.map(wl => {
            const { tickers, entries, ...rest } = wl;
            return {
                ...rest,
                entries: (entries ?? tickers ?? []).map(e =>
                    typeof e === "string"
                        ? { type: "S", symbol: e }
                        : e
                ),
            };
        });
    } catch { return []; }
}

function saveWatchlists(data) {
    fs.writeFileSync(watchlistsFile, JSON.stringify(data, null, 2), "utf8");
}

// GET /api/watchlists
app.get("/api/watchlists", (req, res) => {
    res.json({ success: true, data: loadWatchlists() });
});

// POST /api/watchlists  body: { name }
app.post("/api/watchlists", (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: "name required" });
    const all = loadWatchlists();
    const wl = { id: `wl-${Date.now()}`, name, entries: [] };
    all.push(wl);
    saveWatchlists(all);
    res.json({ success: true, data: wl });
});

// PATCH /api/watchlists/:id  body: { name }
app.patch("/api/watchlists/:id", (req, res) => {
    const all = loadWatchlists();
    const wl = all.find(w => w.id === req.params.id);
    if (!wl) return res.status(404).json({ error: "not found" });
    if (req.body.name) wl.name = req.body.name;
    saveWatchlists(all);
    res.json({ success: true, data: wl });
});

// DELETE /api/watchlists/:id
app.delete("/api/watchlists/:id", (req, res) => {
    const all = loadWatchlists();
    const filtered = all.filter(w => w.id !== req.params.id);
    saveWatchlists(filtered);
    res.json({ success: true });
});

// POST /api/watchlists/:id/entries
// body: { type: "S", symbol } or { type: "R", expression }
app.post("/api/watchlists/:id/entries", (req, res) => {
    const all = loadWatchlists();
    const wl = all.find(w => w.id === req.params.id);
    if (!wl) return res.status(404).json({ error: "watchlist not found" });

    const { type, symbol, expression } = req.body;
    if (type === "S") {
        const sym = String(symbol || "").toUpperCase().trim();
        if (!sym) return res.status(400).json({ error: "symbol required" });
        const key = sym;
        if (!wl.entries.find(e => e.type === "S" && e.symbol === key)) {
            wl.entries.push({ type: "S", symbol: key });
        }
    } else if (type === "R") {
        const expr = String(expression || "").toUpperCase().trim();
        if (!expr || !expr.includes("/")) return res.status(400).json({ error: "expression required (e.g. GLD/SPY)" });
        if (!wl.entries.find(e => e.type === "R" && e.expression === expr)) {
            wl.entries.push({ type: "R", expression: expr });
        }
    } else {
        return res.status(400).json({ error: "type must be S or R" });
    }

    saveWatchlists(all);
    res.json({ success: true, data: wl });
});

// DELETE /api/watchlists/:id/entries/:key  (key = symbol or URL-encoded expression)
app.delete("/api/watchlists/:id/entries/:key", (req, res) => {
    const all = loadWatchlists();
    const wl = all.find(w => w.id === req.params.id);
    if (!wl) return res.status(404).json({ error: "watchlist not found" });
    const key = decodeURIComponent(req.params.key).toUpperCase();
    wl.entries = wl.entries.filter(e =>
        !(e.type === "S" && e.symbol === key) &&
        !(e.type === "R" && e.expression === key)
    );
    saveWatchlists(all);
    res.json({ success: true, data: wl });
});

// GET /api/tickers  — all ticker symbols + company names from DB
app.get("/api/tickers", (req, res) => {
    try {
        const rows = db.prepare(
            `SELECT TickerSymbol, CompanyName FROM Companies ORDER BY TickerSymbol`
        ).all();
        res.json({ success: true, data: rows });
    } catch (err) {
        console.error("GET /api/tickers error:", err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/company/:symbol  — returns { symbol, companyName } from Companies table
app.get("/api/company/:symbol", (req, res) => {
    try {
        const symbol = String(req.params.symbol || "").toUpperCase().trim();
        if (!symbol) return res.status(400).json({ error: "symbol is required" });

        const row = db.prepare(
            `SELECT TickerSymbol, CompanyName FROM Companies WHERE TickerSymbol = ? LIMIT 1`
        ).get(symbol);

        if (!row) {
            return res.status(404).json({ error: `Company not found: ${symbol}` });
        }

        console.log(`GET /api/company/${symbol} — ${row.CompanyName}`);
        res.json({ symbol: row.TickerSymbol, companyName: row.CompanyName });
    } catch (err) {
        console.error("company lookup error:", err);
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`Backend listening on http://localhost:${PORT}`);
});
