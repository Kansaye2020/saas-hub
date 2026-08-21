import { Pool } from "pg";

const dbUrl = process.env.DATABASE_URL;

if (!dbUrl) {
  console.error("ERREUR FATALE: La variable DATABASE_URL n'est pas définie dans .env !");
  process.exit(1);
}

const pool = new Pool({
  connectionString: dbUrl,
  ssl: {
    rejectUnauthorized: false // Requis par Neon.tech et Render
  }
});

// Helper pour convertir les `?` de SQLite vers les `$1`, `$2` de PostgreSQL
function convertToPgSql(sql: string): string {
  let i = 1;
  return sql.replace(/\?/g, () => `$${i++}`);
}

export const dbQuery = async (sql: string, params: any[] = []): Promise<any[]> => {
  const pgSql = convertToPgSql(sql);
  const result = await pool.query(pgSql, params);
  return result.rows;
};

export const dbRun = async (sql: string, params: any[] = []): Promise<void> => {
  const pgSql = convertToPgSql(sql);
  await pool.query(pgSql, params);
};

export const dbGet = async (sql: string, params: any[] = []): Promise<any> => {
  const pgSql = convertToPgSql(sql);
  const result = await pool.query(pgSql, params);
  return result.rows[0]; // Retourne la première ligne ou undefined
};

// Initialisation des tables PostgreSQL
export const initDB = async () => {
  try {
    await dbRun(`
      CREATE TABLE IF NOT EXISTS transactions (
        id VARCHAR(255) PRIMARY KEY,
        appId VARCHAR(255) NOT NULL,
        provider VARCHAR(50) NOT NULL,
        amount NUMERIC NOT NULL,
        currency VARCHAR(10) NOT NULL,
        status VARCHAR(50) NOT NULL,
        orderId VARCHAR(255) NOT NULL,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await dbRun(`
      CREATE TABLE IF NOT EXISTS checkout_sessions (
        token VARCHAR(255) PRIMARY KEY,
        appId VARCHAR(255) NOT NULL,
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

    await dbRun(`
      CREATE TABLE IF NOT EXISTS providers_config (
        providerId VARCHAR(50) PRIMARY KEY,
        isActive INTEGER DEFAULT 1,
        publicKey TEXT,
        secretKey TEXT,
        extraConfig TEXT
      )
    `);
    
    await dbRun(`
      CREATE TABLE IF NOT EXISTS client_apps (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        apiKey VARCHAR(255) NOT NULL UNIQUE,
        webhookUrl TEXT,
        webhookSecret VARCHAR(255) NOT NULL,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Insert a default test app if the table is empty
    const { count } = await dbGet("SELECT COUNT(*) as count FROM client_apps");
    if (Number(count) === 0) {
      await dbRun(`
        INSERT INTO client_apps (id, name, apiKey, webhookUrl, webhookSecret) 
        VALUES ('verifsms', 'Boutique de Test', 'default_verifsms_secret_key_change_me', 'http://localhost:4000/public/test-redirect.html', 'secret_test_123')
      `);
    }
    
    console.log("✅ Base de données PostgreSQL initialisée avec succès !");
  } catch (err) {
    console.error("❌ Erreur lors de l'initialisation de PostgreSQL:", err);
  }
};

// Auto-init
initDB();

export default pool;
