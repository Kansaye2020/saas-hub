require("dotenv").config();
const { fixProvidersConfigPrimaryKey, initDB } = require("../dist/database/db");

async function run() {
  console.log("🚀 Lancement de la synchronisation et migration de la base de données...");
  try {
    await initDB();
    await fixProvidersConfigPrimaryKey();
    console.log("✅ Migration et synchronisation de la clé primaire terminées avec succès !");
    process.exit(0);
  } catch (err) {
    console.error("❌ Erreur pendant la migration :", err);
    process.exit(1);
  }
}

run();
