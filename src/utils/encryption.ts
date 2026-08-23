import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit IV pour AES-GCM
const PREFIX = "enc:v1:";

/**
 * Récupère la clé de chiffrement maîtresse (SHA-256 pour 32 bytes)
 */
function getMasterKey(): Buffer {
  const secret =
    process.env.ENCRYPTION_KEY ||
    process.env.ADMIN_JWT_SECRET ||
    process.env.ADMIN_PASSWORD ||
    "hub_master_secure_encryption_key_2026_default";
  return crypto.createHash("sha256").update(secret).digest();
}

/**
 * Chiffre une chaîne sensible (Clé API, Secret Key, Secret Webhook) en AES-256-GCM
 */
export function encryptSecret(plainText: string): string {
  if (!plainText || typeof plainText !== "string") {
    return plainText;
  }
  const trimmed = plainText.trim();
  if (!trimmed || trimmed.startsWith(PREFIX)) {
    return trimmed; // Déjà chiffré
  }

  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, getMasterKey(), iv);
    
    let encrypted = cipher.update(trimmed, "utf8", "hex");
    encrypted += cipher.final("hex");
    const authTag = cipher.getAuthTag().toString("hex");

    return `${PREFIX}${iv.toString("hex")}:${authTag}:${encrypted}`;
  } catch (err) {
    console.error("❌ Erreur lors du chiffrement du secret:", err);
    return trimmed;
  }
}

/**
 * Déchiffre un secret chiffré en AES-256-GCM
 */
export function decryptSecret(cipherText: string): string {
  if (!cipherText || typeof cipherText !== "string") {
    return cipherText;
  }
  const trimmed = cipherText.trim();
  if (!trimmed.startsWith(PREFIX)) {
    return trimmed; // Non chiffré (legacy)
  }

  try {
    const parts = trimmed.split(":");
    // format: enc : v1 : iv_hex : authTag_hex : encrypted_hex
    if (parts.length !== 5) {
      return trimmed;
    }

    const iv = Buffer.from(parts[2], "hex");
    const authTag = Buffer.from(parts[3], "hex");
    const encrypted = parts[4];

    const decipher = crypto.createDecipheriv(ALGORITHM, getMasterKey(), iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (err) {
    console.error("❌ Erreur lors du déchiffrement du secret:", err);
    return trimmed;
  }
}

/**
 * Masque un secret pour affichage sécurisé dans l'UI (ex: sk_live_••••••••••••3a8f)
 */
export function maskSecret(secret: string): string {
  if (!secret) return "";
  const plain = decryptSecret(secret);
  if (!plain) return "";
  if (plain.length <= 8) return "••••••••";
  
  const prefix = plain.substring(0, 4);
  const suffix = plain.substring(plain.length - 4);
  return `${prefix}${"•".repeat(Math.min(16, Math.max(6, plain.length - 8)))}${suffix}`;
}
