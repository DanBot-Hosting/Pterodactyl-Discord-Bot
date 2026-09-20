/**
 * backup_db.js
 * Backs up all tables still in quick.db KV format (ID, json columns) to ../backups/.
 * Captures ALL rows including dot-notation fragment rows (e.g. "123456.used").
 *
 * Run with: node migration/backup_db.js
 *
 * Output: ./backups/<tableName>_<ISO_timestamp>.json
 */

const mysql = require("mysql2/promise");
const fs = require("fs");
const path = require("path");
const Config = require("../config.json");

const BACKUP_DIR = path.join(__dirname, "../backups");

const TARGET_TABLES = ["userData", "userPrem", "redeemCodes", "nodeStatus", "nodeServers"];

function isKVFormat(columns) {
    const names = new Set(columns.map((c) => c.Field));
    return names.size === 2 && names.has("ID") && names.has("json");
}

async function main() {
    if (!fs.existsSync(BACKUP_DIR)) {
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }

    const connection = await mysql.createConnection({
        host: Config.database.host,
        port: Config.database.port,
        user: Config.database.user,
        password: Config.database.pass,
        database: Config.database.db,
    });

    console.log(`\nConnected to MySQL: ${Config.database.host}:${Config.database.port} / ${Config.database.db}`);
    console.log(`Backup directory: ${BACKUP_DIR}\n`);

    const [tables] = await connection.query("SHOW TABLES");
    const tableKey = Object.keys(tables[0])[0];
    const existingTables = tables.map((r) => r[tableKey]);

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const results = [];

    for (const tableName of TARGET_TABLES) {
        if (!existingTables.includes(tableName)) {
            console.log(`SKIP: ${tableName} — table does not exist`);
            results.push({ table: tableName, status: "skipped", reason: "does not exist" });
            continue;
        }

        const safeTableName = connection.escapeId(tableName);
        const [columns] = await connection.query("DESCRIBE " + safeTableName);

        if (!isKVFormat(columns)) {
            console.log(`SKIP: ${tableName} — already in relational format, no backup needed`);
            results.push({ table: tableName, status: "skipped", reason: "already relational" });
            continue;
        }

        console.log(`Backing up: ${tableName} (KV format)...`);

        const [rows] = await connection.query("SELECT ID, `json` FROM " + safeTableName);

        const parsed = rows.map((row) => {
            let value;
            try {
                value = JSON.parse(row.json);
            } catch {
                value = row.json;
            }
            return { ID: row.ID, json: row.json, parsed: value };
        });

        const outputFile = path.join(BACKUP_DIR, `${tableName}_${timestamp}.json`);
        fs.writeFileSync(outputFile, JSON.stringify(parsed, null, 2), "utf8");

        console.log(`  ✅ ${rows.length} rows → ${outputFile}`);
        results.push({ table: tableName, status: "backed up", rows: rows.length, file: outputFile });
    }

    console.log("\n" + "=".repeat(60));
    console.log("BACKUP SUMMARY");
    console.log("=".repeat(60));
    for (const r of results) {
        if (r.status === "backed up") {
            console.log(`  ✅ ${r.table}: ${r.rows} rows → ${path.basename(r.file)}`);
        } else {
            console.log(`  ⏭️  ${r.table}: ${r.reason}`);
        }
    }
    console.log();

    await connection.end();
    console.log("Connection closed. Backups complete.");
}

main().catch((err) => {
    console.error("Error:", err.message);
    process.exit(1);
});
