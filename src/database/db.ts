import sqlite3 from "sqlite3";
import path from "path";
import fs from "fs";

// Determine DB path (can be overridden by Render Persistent Disk via env variable)
const dbPath = process.env.DB_PATH || path.join(__dirname, "../../data/database.sqlite");
const dataDir = path.dirname(dbPath);

// Ensure data directory exists
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new sqlite3.Database(dbPath);

// Initialize tables
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      appId TEXT NOT NULL,
      provider TEXT NOT NULL,
      amount REAL NOT NULL,
      currency TEXT NOT NULL,
      status TEXT NOT NULL,
      orderId TEXT NOT NULL,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS checkout_sessions (
      token TEXT PRIMARY KEY,
      appId TEXT NOT NULL,
      amount REAL NOT NULL,
      currency TEXT NOT NULL,
      returnUrl TEXT,
      cancelUrl TEXT,
      provider TEXT,
      status TEXT NOT NULL,
      orderId TEXT NOT NULL,
      description TEXT,
      customerEmail TEXT,
      customerName TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS providers_config (
      providerId TEXT PRIMARY KEY,
      isActive INTEGER DEFAULT 1,
      publicKey TEXT,
      secretKey TEXT,
      extraConfig TEXT
    )
  `);
});

// Helper functions for easy querying (Promises)
export const dbQuery = (sql: string, params: any[] = []): Promise<any[]> => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

export const dbRun = (sql: string, params: any[] = []): Promise<void> => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve();
    });
  });
};

export const dbGet = (sql: string, params: any[] = []): Promise<any> => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

export default db;
