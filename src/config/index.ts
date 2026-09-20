import dotenv from "dotenv";
import { ClientAppConfig } from "../types";

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || "4000", 10),
  nodeEnv: process.env.NODE_ENV || "development",
  baseUrl: (process.env.HUB_BASE_URL || "http://localhost:4000").replace(/\/$/, ""),
};

import { decryptSecret } from "../utils/encryption";

export async function getClientAppById(appId: string) {
  const { dbGet } = require("../database/db");
  const cleanAppId = (appId || "").trim().toLowerCase();
  const row = await dbGet("SELECT * FROM client_apps WHERE LOWER(id) = ?", [cleanAppId]);
  if (row) {
    const rawSecret = row.webhookSecret !== undefined ? row.webhookSecret : row.webhooksecret;
    row.webhookSecret = decryptSecret(rawSecret || "");
    if (!row.logoUrl && row.logourl) row.logoUrl = row.logourl;
  }
  return row;
}

export async function getClientAppByApiKey(apiKey: string) {
  const { dbGet } = require("../database/db");
  const row = await dbGet("SELECT * FROM client_apps WHERE apiKey = ?", [apiKey]);
  if (row) {
    const rawSecret = row.webhookSecret !== undefined ? row.webhookSecret : row.webhooksecret;
    row.webhookSecret = decryptSecret(rawSecret || "");
    if (!row.logoUrl && row.logourl) row.logoUrl = row.logourl;
  }
  return row;
}

export async function getAppProviderConfig(appId: string, providerId: string): Promise<{ publicKey: string; secretKey: string; isActive: boolean; extraConfig?: any }> {
  try {
    const { dbGet } = require("../database/db");
    const cleanAppId = (appId || "").trim().toLowerCase();
    const cleanProviderId = (providerId || "").trim().toLowerCase();
    const row = await dbGet(
      "SELECT * FROM providers_config WHERE LOWER(appId) = ? AND LOWER(providerId) = ?",
      [cleanAppId, cleanProviderId]
    );
    if (row) {
      const rawExtra = row.extraConfig !== undefined ? row.extraConfig : row.extraconfig;
      let extra = {};
      if (rawExtra) {
        if (typeof rawExtra === "object") {
          extra = rawExtra;
        } else {
          try { extra = JSON.parse(rawExtra); } catch (e) {}
        }
      }
      const rawActive = row.isActive !== undefined ? row.isActive : row.isactive;
      const isActiveBool = (rawActive === 1 || rawActive === "1" || rawActive === true || rawActive === "t");
      const rawPublic = row.publicKey !== undefined ? row.publicKey : row.publickey;
      const rawSecret = row.secretKey !== undefined ? row.secretKey : row.secretkey;

      return {
        isActive: isActiveBool,
        publicKey: rawPublic || "",
        secretKey: decryptSecret(rawSecret || ""),
        extraConfig: extra
      };
    }
  } catch (error) {
    console.error(`Erreur lecture config DB pour app ${appId} / provider ${providerId}:`, error);
  }

  return { isActive: false, publicKey: "", secretKey: "", extraConfig: {} };
}

export async function getAppActiveProviders(appId: string): Promise<Array<{ providerId: string; publicKey: string; secretKey: string; extraConfig?: any }>> {
  try {
    const { dbQuery } = require("../database/db");
    const cleanAppId = (appId || "").trim().toLowerCase();
    const rows = await dbQuery(
      "SELECT * FROM providers_config WHERE LOWER(appId) = ?",
      [cleanAppId]
    );
    const result: Array<{ providerId: string; publicKey: string; secretKey: string; extraConfig?: any }> = [];

    for (const row of rows) {
      const rawActive = row.isActive !== undefined ? row.isActive : row.isactive;
      const isActiveBool = (rawActive === 1 || rawActive === "1" || rawActive === true || rawActive === "t");
      if (!isActiveBool) continue;

      const rawExtra = row.extraConfig !== undefined ? row.extraConfig : row.extraconfig;
      let extra = {};
      if (rawExtra) {
        if (typeof rawExtra === "object") {
          extra = rawExtra;
        } else {
          try { extra = JSON.parse(rawExtra); } catch (e) {}
        }
      }
      const rawPublic = row.publicKey !== undefined ? row.publicKey : row.publickey;
      const rawSecret = row.secretKey !== undefined ? row.secretKey : row.secretkey;
      const rawProviderId = row.providerId !== undefined ? row.providerId : row.providerid;

      result.push({
        providerId: (rawProviderId || "").trim().toLowerCase(),
        publicKey: rawPublic || "",
        secretKey: decryptSecret(rawSecret || ""),
        extraConfig: extra
      });
    }

    return result;
  } catch (error) {
    console.error(`Erreur lecture active providers pour app ${appId}:`, error);
    return [];
  }
}

export async function getAppActiveProvider(appId: string): Promise<{ providerId: string; publicKey: string; secretKey: string; extraConfig?: any } | null> {
  const activeProviders = await getAppActiveProviders(appId);
  return activeProviders.length > 0 ? activeProviders[0] : null;
}

// Backward compatibility helpers
export async function getActiveProvider(appId: string = "verifsms"): Promise<{ providerId: string; publicKey: string; secretKey: string; extraConfig?: any } | null> {
  return await getAppActiveProvider(appId);
}

export async function getProviderConfig(providerId: string, appId: string = "verifsms"): Promise<{ publicKey: string; secretKey: string; isActive: boolean; extraConfig?: any }> {
  return await getAppProviderConfig(appId, providerId);
}

/**
 * Génère l'URL de base du Checkout en sous-domaine (ex: checkout.localhost:4000 ou checkout.votredomaine.com)
 */
export function getCheckoutBaseUrl(req?: any): string {
  if (process.env.CHECKOUT_BASE_URL) {
    return process.env.CHECKOUT_BASE_URL.replace(/\/$/, "");
  }

  if (req) {
    const host = req.get("host") || `localhost:${config.port}`;
    const protocol = req.protocol || (config.nodeEnv === "production" ? "https" : "http");

    if (host.startsWith("checkout.")) {
      return `${protocol}://${host}`;
    }

    // Si on est sur localhost (ex: localhost:4000)
    if (host.includes("localhost")) {
      return `${protocol}://checkout.${host}`;
    }

    // Si on est sur une IP ou un domaine personnalisé
    return `${protocol}://checkout.${host}`;
  }

  // Fallback avec HUB_BASE_URL
  const hubUrl = new URL(config.baseUrl);
  if (hubUrl.hostname === "localhost") {
    return `${hubUrl.protocol}//checkout.localhost:${hubUrl.port || config.port}`;
  }
  return `${hubUrl.protocol}//checkout.${hubUrl.host}`;
}

export function getCheckoutUrl(token: string, req?: any): string {
  const baseUrl = getCheckoutBaseUrl(req);
  return `${baseUrl}/checkout/${token}`;
}


