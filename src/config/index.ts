import dotenv from "dotenv";
import { ClientAppConfig } from "../types";

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || "4000", 10),
  nodeEnv: process.env.NODE_ENV || "development",
  baseUrl: (process.env.HUB_BASE_URL || "http://localhost:4000").replace(/\/$/, ""),

  // Lomopay config
  lomopay: {
    publicKey: process.env.LOMOPAY_PUBLIC_KEY || "",
    secretKey: process.env.LOMOPAY_SECRET_KEY || "",
    apiUrl: process.env.LOMOPAY_API_URL || "https://lomopay.net/api/v1/payments.php",
  },

  // Whop config
  whop: {
    apiKey: process.env.WHOP_API_KEY || "",
    companyId: process.env.WHOP_COMPANY_ID || "",
    isSandbox: process.env.WHOP_SANDBOX === "true",
  },

  // Stripe config
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY || "",
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || "",
  },

  // Chariow config
  chariow: {
    secretKey: process.env.CHARIOW_SECRET_KEY || "",
    publicKey: process.env.CHARIOW_PUBLIC_KEY || "",
  },
};

export async function getClientAppById(appId: string): Promise<ClientAppConfig | undefined> {
  const { dbGet } = require("../database/db");
  return await dbGet("SELECT * FROM client_apps WHERE id = ?", [appId]);
}

export async function getClientAppByApiKey(apiKey: string): Promise<ClientAppConfig | undefined> {
  const { dbGet } = require("../database/db");
  return await dbGet("SELECT * FROM client_apps WHERE apiKey = ?", [apiKey]);
}

export async function getAppProviderConfig(appId: string, providerId: string): Promise<{ publicKey: string; secretKey: string; isActive: boolean; extraConfig?: any }> {
  try {
    const { dbGet } = require("../database/db");
    const row = await dbGet("SELECT * FROM providers_config WHERE appId = ? AND providerId = ?", [appId, providerId]);
    if (row) {
      let extra = {};
      if (row.extraConfig) {
        try { extra = JSON.parse(row.extraConfig); } catch (e) {}
      }
      return {
        isActive: row.isActive === 1,
        publicKey: row.publicKey || "",
        secretKey: row.secretKey || "",
        extraConfig: extra
      };
    }
  } catch (error) {
    console.error(`Erreur lecture config DB pour app ${appId} / provider ${providerId}:`, error);
  }

  // Fallback to global config or env only if not set in DB
  const envConfig = (config as any)[providerId];
  if (envConfig && (envConfig.publicKey || envConfig.apiKey || envConfig.secretKey)) {
    return {
      isActive: false,
      publicKey: envConfig.publicKey || envConfig.apiKey || "",
      secretKey: envConfig.secretKey || envConfig.webhookSecret || "",
    };
  }

  return { isActive: false, publicKey: "", secretKey: "" };
}

export async function getAppActiveProviders(appId: string): Promise<Array<{ providerId: string; publicKey: string; secretKey: string; extraConfig?: any }>> {
  try {
    const { dbQuery } = require("../database/db");
    const rows = await dbQuery("SELECT * FROM providers_config WHERE appId = ? AND isActive = 1", [appId]);
    return rows.map((row: any) => {
      let extra = {};
      if (row.extraConfig) {
        try { extra = JSON.parse(row.extraConfig); } catch (e) {}
      }
      return {
        providerId: row.providerId,
        publicKey: row.publicKey || "",
        secretKey: row.secretKey || "",
        extraConfig: extra
      };
    });
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


