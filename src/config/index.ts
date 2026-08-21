import dotenv from "dotenv";
import { ClientAppConfig } from "../types";

dotenv.config();

function parseClientApps(): ClientAppConfig[] {
  const raw = process.env.CLIENT_APPS;
  if (!raw) {
    return [
      {
        id: "verifsms",
        name: "VerifSMS",
        apiKey: process.env.VERIFSMS_API_KEY || "default_verifsms_secret_key_change_me",
        webhookUrl: process.env.VERIFSMS_WEBHOOK_URL || "https://verifsms.relyx.xyz/api/webhooks/lomopay",
        webhookSecret: process.env.VERIFSMS_WEBHOOK_SECRET || "default_verifsms_webhook_secret",
      },
    ];
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    console.error("❌ Erreur lors du parsing de CLIENT_APPS JSON:", error);
    return [];
  }
}

export const config = {
  port: parseInt(process.env.PORT || "4000", 10),
  nodeEnv: process.env.NODE_ENV || "development",
  baseUrl: (process.env.HUB_BASE_URL || "http://localhost:4000").replace(/\/$/, ""),
  clientApps: parseClientApps(),

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

export function getClientAppById(appId: string): ClientAppConfig | undefined {
  return config.clientApps.find((app) => app.id === appId);
}

export function getClientAppByApiKey(apiKey: string): ClientAppConfig | undefined {
  return config.clientApps.find((app) => app.apiKey === apiKey);
}

export async function getProviderConfig(providerId: string): Promise<{ publicKey: string; secretKey: string; isActive: boolean; extraConfig?: any }> {
  try {
    const { dbGet } = require("../database/db");
    const row = await dbGet("SELECT * FROM providers_config WHERE providerId = ?", [providerId]);
    if (row && row.isActive === 1) {
      let extra = {};
      if (row.extraConfig) {
        try { extra = JSON.parse(row.extraConfig); } catch (e) {}
      }
      return {
        isActive: true,
        publicKey: row.publicKey || "",
        secretKey: row.secretKey || "",
        extraConfig: extra
      };
    }
  } catch (error) {
    console.error("Erreur lecture config DB", error);
  }

  // Fallback to config (env)
  const envConfig = (config as any)[providerId];
  if (envConfig) {
    return {
      isActive: true,
      publicKey: envConfig.publicKey || envConfig.apiKey || "",
      secretKey: envConfig.secretKey || envConfig.webhookSecret || "",
    };
  }

  return { isActive: false, publicKey: "", secretKey: "" };
}
