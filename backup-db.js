const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");

const SRC = path.join(__dirname, "data", "CommoditiesStockAnalysis.db");
const WATCHLISTS_SRC = path.join(__dirname, "charts", "watchlists.json");
const BACKUP_DIR = path.join(__dirname, "..", "ratio-charts-SQLite-backups");
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const dest = path.join(BACKUP_DIR, `CommoditiesStockAnalysis_${timestamp}.db`);
const watchlistsDest = path.join(BACKUP_DIR, `watchlists_${timestamp}.json`);

fs.mkdirSync(BACKUP_DIR, { recursive: true });

const LOG_FILE = path.join(BACKUP_DIR, "backup.log");
function log(line) {
  fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${line}\n`);
}

const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

function cleanupOldBackups() {
  const cutoff = Date.now() - MAX_AGE_MS;
  for (const file of fs.readdirSync(BACKUP_DIR)) {
    if (!file.endsWith(".db") && !file.endsWith(".json")) continue;
    const filePath = path.join(BACKUP_DIR, file);
    if (fs.statSync(filePath).mtimeMs < cutoff) {
      fs.unlinkSync(filePath);
      log(`Deleted old backup ${file}`);
    }
  }
}

function backupWatchlists() {
  if (!fs.existsSync(WATCHLISTS_SRC)) {
    log(`Skipped watchlists backup: ${WATCHLISTS_SRC} not found`);
    return;
  }
  fs.copyFileSync(WATCHLISTS_SRC, watchlistsDest);
  log(`Backed up to ${watchlistsDest}`);
}

const db = new Database(SRC, { readonly: true });
db.backup(dest)
  .then(() => {
    log(`Backed up to ${dest}`);
    db.close();
    backupWatchlists();
    cleanupOldBackups();
  })
  .catch((err) => {
    log(`Backup failed: ${err}`);
    db.close();
    process.exit(1);
  });
