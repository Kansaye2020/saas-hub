import { Pool } from "pg";
import sqlite3 from "sqlite3";
import path from "path";
import fs from "fs";

const dbUrl = process.env.DATABASE_URL;

let isPg = false;
let pgPool: Pool | null = null;
let sqliteDb: sqlite3.Database | null = null;

if (dbUrl) {
  isPg = true;
  pgPool = new Pool({
    connectionString: dbUrl,
    ssl: {
      rejectUnauthorized: false // Requis par Neon.tech et Render
    }
  });
  console.log("📦 Connexion à la base de données PostgreSQL (Neon / Render)");
} else {
  isPg = false;
  const dbPath = process.env.DB_PATH || path.join(__dirname, "../../data/database.sqlite");
  const dataDir = path.dirname(dbPath);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  sqliteDb = new sqlite3.Database(dbPath);
  console.log(`📦 Connexion à la base de données SQLite locale (${dbPath})`);
}

// Helper pour convertir les `?` de SQLite vers les `$1`, `$2` de PostgreSQL
function convertToPgSql(sql: string): string {
  let i = 1;
  return sql.replace(/\?/g, () => `$${i++}`);
}

// Helper pour normaliser les colonnes PostgreSQL (qui sont en minuscules par défaut)
function normalizeRow(row: any): any {
  if (!row || typeof row !== "object") return row;
  const normalized: any = { ...row };
  
  if (row.providerid !== undefined && row.providerId === undefined) normalized.providerId = row.providerid;
  if (row.appid !== undefined && row.appId === undefined) normalized.appId = row.appid;
  if (row.isactive !== undefined && row.isActive === undefined) normalized.isActive = row.isactive;
  if (row.publickey !== undefined && row.publicKey === undefined) normalized.publicKey = row.publickey;
  if (row.secretkey !== undefined && row.secretKey === undefined) normalized.secretKey = row.secretkey;
  if (row.extraconfig !== undefined && row.extraConfig === undefined) normalized.extraConfig = row.extraconfig;
  if (row.apikey !== undefined && row.apiKey === undefined) normalized.apiKey = row.apikey;
  if (row.webhookurl !== undefined && row.webhookUrl === undefined) normalized.webhookUrl = row.webhookurl;
  if (row.webhooksecret !== undefined && row.webhookSecret === undefined) normalized.webhookSecret = row.webhooksecret;
  if (row.returnurl !== undefined && row.returnUrl === undefined) normalized.returnUrl = row.returnurl;
  if (row.cancelurl !== undefined && row.cancelUrl === undefined) normalized.cancelUrl = row.cancelurl;
  if (row.orderid !== undefined && row.orderId === undefined) normalized.orderId = row.orderid;
  if (row.createdat !== undefined && row.createdAt === undefined) normalized.createdAt = row.createdat;
  if (row.customeremail !== undefined && row.customerEmail === undefined) normalized.customerEmail = row.customeremail;
  if (row.customername !== undefined && row.customerName === undefined) normalized.customerName = row.customername;

  return normalized;
}

export const dbQuery = async (sql: string, params: any[] = []): Promise<any[]> => {
  if (isPg && pgPool) {
    const pgSql = convertToPgSql(sql);
    const result = await pgPool.query(pgSql, params);
    return (result.rows || []).map(normalizeRow);
  } else if (sqliteDb) {
    return new Promise((resolve, reject) => {
      sqliteDb!.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve((rows || []).map(normalizeRow));
      });
    });
  }
  return [];
};

export const dbRun = async (sql: string, params: any[] = []): Promise<void> => {
  if (isPg && pgPool) {
    const pgSql = convertToPgSql(sql);
    await pgPool.query(pgSql, params);
  } else if (sqliteDb) {
    return new Promise((resolve, reject) => {
      sqliteDb!.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve();
      });
    });
  }
};

export const dbGet = async (sql: string, params: any[] = []): Promise<any> => {
  if (isPg && pgPool) {
    const pgSql = convertToPgSql(sql);
    const result = await pgPool.query(pgSql, params);
    return normalizeRow(result.rows[0]);
  } else if (sqliteDb) {
    return new Promise((resolve, reject) => {
      sqliteDb!.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(normalizeRow(row));
      });
    });
  }
  return undefined;
};

// Initialisation et migration automatique des tables
export const initDB = async () => {
  try {
    if (isPg) {
      // 1. Transactions
      await dbRun(`
        CREATE TABLE IF NOT EXISTS transactions (
          id VARCHAR(255) PRIMARY KEY,
          appId VARCHAR(255) NOT NULL DEFAULT 'verifsms',
          provider VARCHAR(50) NOT NULL,
          amount NUMERIC NOT NULL,
          currency VARCHAR(10) NOT NULL,
          status VARCHAR(50) NOT NULL,
          orderId VARCHAR(255) NOT NULL,
          createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      try {
        await dbRun(`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS appId VARCHAR(255) NOT NULL DEFAULT 'verifsms'`);
      } catch (e) {}

      // 2. Checkout Sessions
      await dbRun(`
        CREATE TABLE IF NOT EXISTS checkout_sessions (
          token VARCHAR(255) PRIMARY KEY,
          appId VARCHAR(255) NOT NULL DEFAULT 'verifsms',
          amount NUMERIC NOT NULL,
          currency VARCHAR(10) NOT NULL,
          returnUrl TEXT,
          cancelUrl TEXT,
          provider VARCHAR(50),
          status VARCHAR(50) NOT NULL,
          orderId VARCHAR(255) NOT NULL,
          description TEXT,
          customerEmail VARCHAR(255),
          customerName VARCHAR(255),
          createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      try {
        await dbRun(`ALTER TABLE checkout_sessions ADD COLUMN IF NOT EXISTS appId VARCHAR(255) NOT NULL DEFAULT 'verifsms'`);
        await dbRun(`ALTER TABLE checkout_sessions ADD COLUMN IF NOT EXISTS returnUrl TEXT`);
        await dbRun(`ALTER TABLE checkout_sessions ADD COLUMN IF NOT EXISTS cancelUrl TEXT`);
        await dbRun(`ALTER TABLE checkout_sessions ADD COLUMN IF NOT EXISTS description TEXT`);
        await dbRun(`ALTER TABLE checkout_sessions ADD COLUMN IF NOT EXISTS customerEmail VARCHAR(255)`);
        await dbRun(`ALTER TABLE checkout_sessions ADD COLUMN IF NOT EXISTS customerName VARCHAR(255)`);
      } catch (e) {}

      // 3. Providers Config
      await dbRun(`
        CREATE TABLE IF NOT EXISTS providers_config (
          appId VARCHAR(50) NOT NULL DEFAULT 'verifsms',
          providerId VARCHAR(50) NOT NULL,
          isActive INTEGER DEFAULT 1,
          publicKey TEXT,
          secretKey TEXT,
          extraConfig TEXT,
          PRIMARY KEY (appId, providerId)
        )
      `);
      try {
        await dbRun(`ALTER TABLE providers_config ADD COLUMN IF NOT EXISTS appId VARCHAR(50) NOT NULL DEFAULT 'verifsms'`);
        await dbRun(`ALTER TABLE providers_config ADD COLUMN IF NOT EXISTS extraConfig TEXT`);
        await dbRun(`CREATE UNIQUE INDEX IF NOT EXISTS idx_providers_app_provider ON providers_config(appId, providerId)`);
      } catch (e) {}
      
      // 4. Client Apps
      await dbRun(`
        CREATE TABLE IF NOT EXISTS client_apps (
          id VARCHAR(50) PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          apiKey VARCHAR(255) NOT NULL UNIQUE,
          webhookUrl TEXT,
          webhookSecret VARCHAR(255) NOT NULL,
          returnUrl TEXT,
          cancelUrl TEXT,
          createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      try {
        await dbRun(`ALTER TABLE client_apps ADD COLUMN IF NOT EXISTS returnUrl TEXT`);
        await dbRun(`ALTER TABLE client_apps ADD COLUMN IF NOT EXISTS cancelUrl TEXT`);
        await dbRun(`ALTER TABLE client_apps ADD COLUMN IF NOT EXISTS webhookUrl TEXT`);
      } catch (e) {}

    } else {
      // SQLite
      await dbRun(`
        CREATE TABLE IF NOT EXISTS transactions (
          id TEXT PRIMARY KEY,
          appId TEXT NOT NULL DEFAULT 'verifsms',
          provider TEXT NOT NULL,
          amount REAL NOT NULL,
          currency TEXT NOT NULL,
          status TEXT NOT NULL,
          orderId TEXT NOT NULL,
          createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
      try {
        const txCols = await dbQuery("PRAGMA table_info(transactions)");
        if (!txCols.some((c: any) => c.name === 'appId')) {
          await dbRun(`ALTER TABLE transactions ADD COLUMN appId TEXT NOT NULL DEFAULT 'verifsms'`);
        }
      } catch (e) {}

      await dbRun(`
        CREATE TABLE IF NOT EXISTS checkout_sessions (
          token TEXT PRIMARY KEY,
          appId TEXT NOT NULL DEFAULT 'verifsms',
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
      try {
        const csCols = await dbQuery("PRAGMA table_info(checkout_sessions)");
        if (!csCols.some((c: any) => c.name === 'appId')) {
          await dbRun(`ALTER TABLE checkout_sessions ADD COLUMN appId TEXT NOT NULL DEFAULT 'verifsms'`);
        }
        if (!csCols.some((c: any) => c.name === 'returnUrl')) {
          await dbRun(`ALTER TABLE checkout_sessions ADD COLUMN returnUrl TEXT`);
        }
        if (!csCols.some((c: any) => c.name === 'cancelUrl')) {
          await dbRun(`ALTER TABLE checkout_sessions ADD COLUMN cancelUrl TEXT`);
        }
      } catch (e) {}

      // SQLite check and migrate providers_config table
      const hasTable = await dbGet("SELECT name FROM sqlite_master WHERE type='table' AND name='providers_config'");
      if (hasTable) {
        const columns = await dbQuery("PRAGMA table_info(providers_config)");
        const hasAppId = columns.some((c: any) => c.name === 'appId');
        if (!hasAppId) {
          try {
            await dbRun("ALTER TABLE providers_config RENAME TO providers_config_old");
            await dbRun(`
              CREATE TABLE providers_config (
                appId TEXT NOT NULL DEFAULT 'verifsms',
                providerId TEXT NOT NULL,
                isActive INTEGER DEFAULT 1,
                publicKey TEXT,
                secretKey TEXT,
                extraConfig TEXT,
                PRIMARY KEY (appId, providerId)
              )
            `);
            await dbRun(`
              INSERT INTO providers_config (appId, providerId, isActive, publicKey, secretKey, extraConfig)
              SELECT 'verifsms', providerId, isActive, publicKey, secretKey, extraConfig FROM providers_config_old
            `);
            await dbRun("DROP TABLE providers_config_old");
          } catch (e) {
            console.error("SQLite migration error:", e);
          }
        }
      } else {
        await dbRun(`
          CREATE TABLE IF NOT EXISTS providers_config (
            appId TEXT NOT NULL DEFAULT 'verifsms',
            providerId TEXT NOT NULL,
            isActive INTEGER DEFAULT 1,
            publicKey TEXT,
            secretKey TEXT,
            extraConfig TEXT,
            PRIMARY KEY (appId, providerId)
          )
        `);
      }
      
      await dbRun(`
        CREATE TABLE IF NOT EXISTS client_apps (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          apiKey TEXT NOT NULL UNIQUE,
          webhookUrl TEXT,
          webhookSecret TEXT NOT NULL,
          returnUrl TEXT,
          cancelUrl TEXT,
          createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
      try {
        const caCols = await dbQuery("PRAGMA table_info(client_apps)");
        if (!caCols.some((c: any) => c.name === 'returnUrl')) {
          await dbRun(`ALTER TABLE client_apps ADD COLUMN returnUrl TEXT`);
        }
        if (!caCols.some((c: any) => c.name === 'cancelUrl')) {
          await dbRun(`ALTER TABLE client_apps ADD COLUMN cancelUrl TEXT`);
        }
      } catch (e) {}
    }

    // Insert a default test app if the table is empty
    const countRow = await dbGet("SELECT COUNT(*) as count FROM client_apps");
    if (!countRow || Number(countRow.count) === 0) {
      if (isPg) {
        await dbRun(`
          INSERT INTO client_apps (id, name, apiKey, webhookUrl, webhookSecret, returnUrl, cancelUrl) 
          VALUES ('verifsms', 'Boutique de Test', 'default_verifsms_secret_key_change_me', 'http://localhost:4000/public/test-redirect.html', 'secret_test_123', 'http://localhost:4000/public/test-redirect.html?status=success', 'http://localhost:4000/public/test-redirect.html?status=cancel')
          ON CONFLICT (id) DO NOTHING
        `);
      } else {
        await dbRun(`
          INSERT OR IGNORE INTO client_apps (id, name, apiKey, webhookUrl, webhookSecret, returnUrl, cancelUrl) 
          VALUES ('verifsms', 'Boutique de Test', 'default_verifsms_secret_key_change_me', 'http://localhost:4000/public/test-redirect.html', 'secret_test_123', 'http://localhost:4000/public/test-redirect.html?status=success', 'http://localhost:4000/public/test-redirect.html?status=cancel')
        `);
      }
    }
    
    // 6. Migration automatique : Chiffrement des secrets existants en base avec AES-256-GCM
    try {
      const { encryptSecret } = require("../utils/encryption");
      
      const providerList = await dbQuery("SELECT * FROM providers_config");
      for (const p of providerList) {
        const sec = p.secretKey || p.secretkey;
        if (sec && typeof sec === "string" && !sec.startsWith("enc:v1:")) {
          const encSec = encryptSecret(sec);
          await dbRun(
            "UPDATE providers_config SET secretKey = ? WHERE appId = ? AND providerId = ?",
            [encSec, p.appId || p.appid, p.providerId || p.providerid]
          );
        }
      }

      const appList = await dbQuery("SELECT * FROM client_apps");
      for (const app of appList) {
        const sec = app.webhookSecret || app.webhooksecret;
        if (sec && typeof sec === "string" && !sec.startsWith("enc:v1:")) {
          const encSec = encryptSecret(sec);
          await dbRun("UPDATE client_apps SET webhookSecret = ? WHERE id = ?", [encSec, app.id]);
        }
      }
    } catch (migErr) {
      console.warn("Notice: Auto-encryption migration:", migErr);
    }

    console.log("✅ Base de données initialisée, synchronisée et sécurisée (AES-256) avec succès !");
  } catch (err) {
    console.error("❌ Erreur lors de l'initialisation de la base de données:", err);
  }
};

// Auto-init
initDB();

export default isPg ? pgPool : sqliteDb;
