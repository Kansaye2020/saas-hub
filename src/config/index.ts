import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { ClientAppConfig } from "../types";

dotenv.config();

export interface PaymentGatewayConfig {
  lomopay: {
    publicKey: string;
    secretKey: string;
    apiUrl: string;
  };
  whop: {
    apiKey: string;
    companyId: string;
    isSandbox: boolean;
  };
  stripe: {
    secretKey: string;
    webhookSecret: string;
  };
  chariow: {
    secretKey: string;
    publicKey: string;
  };
}

export interface HubFullConfig {
  port: number;
  nodeEnv: string;
  baseUrl: string;
  adminPassword: string;
  clientApps: ClientAppConfig[];
  lomopay: {
    publicKey: string;
    secretKey: string;
    apiUrl: string;
  };
  whop: {
    apiKey: string;
    companyId: string;
    isSandbox: boolean;
  };
  stripe: {
    secretKey: string;
    webhookSecret: string;
  };
  chariow: {
    secretKey: string;
    publicKey: string;
  };
}

const DATA_DIR = path.join(process.cwd(), "data");
const CONFIG_FILE = path.join(DATA_DIR, "hub-config.json");

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    } catch (e) {
      console.warn("Could not create data directory:", e);
    }
  }
}

function parseInitialClientApps(): ClientAppConfig[] {
  const raw = process.env.CLIENT_APPS;
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    } catch (error) {
      console.error("❌ Erreur lors du parsing de CLIENT_APPS JSON depuis process.env:", error);
    }
  }

  // Fallback initial par défaut
  return [
    {
      id: "verifsms",
      name: "VerifSMS",
      apiKey: process.env.VERIFSMS_API_KEY || "vfs_live_sec_7a8b9c1d2e3f4g5h6j",
      webhookUrl: process.env.VERIFSMS_WEBHOOK_URL || "https://verifsms.relyx.xyz/api/webhooks/hub-payment",
      webhookSecret: process.env.VERIFSMS_WEBHOOK_SECRET || "whsec_vfs_998877665544332211",
    },
  ];
}

function loadSavedFileConfig(): Partial<HubFullConfig> | null {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const raw = fs.readFileSync(CONFIG_FILE, "utf-8");
      return JSON.parse(raw);
    }
  } catch (err) {
    console.warn("⚠️ Impossible de lire le fichier de config persisté:", err);
  }
  return null;
}

const savedConfig = loadSavedFileConfig();

export const config: HubFullConfig = {
  port: parseInt(process.env.PORT || "4000", 10),
  nodeEnv: process.env.NODE_ENV || "production",
  baseUrl: (savedConfig?.baseUrl || process.env.HUB_BASE_URL || "http://localhost:4000").replace(/\/$/, ""),
  adminPassword: savedConfig?.adminPassword || process.env.ADMIN_PASSWORD || "",
  clientApps: savedConfig?.clientApps || parseInitialClientApps(),

  lomopay: {
    publicKey: savedConfig?.lomopay?.publicKey || process.env.LOMOPAY_PUBLIC_KEY || "",
    secretKey: savedConfig?.lomopay?.secretKey || process.env.LOMOPAY_SECRET_KEY || "",
    apiUrl: savedConfig?.lomopay?.apiUrl || process.env.LOMOPAY_API_URL || "https://lomopay.net/api/v1/payments.php",
  },

  whop: {
    apiKey: savedConfig?.whop?.apiKey || process.env.WHOP_API_KEY || "",
    companyId: savedConfig?.whop?.companyId || process.env.WHOP_COMPANY_ID || "",
    isSandbox: savedConfig?.whop?.isSandbox ?? (process.env.WHOP_SANDBOX === "true"),
  },

  stripe: {
    secretKey: savedConfig?.stripe?.secretKey || process.env.STRIPE_SECRET_KEY || "",
    webhookSecret: savedConfig?.stripe?.webhookSecret || process.env.STRIPE_WEBHOOK_SECRET || "",
  },

  chariow: {
    secretKey: savedConfig?.chariow?.secretKey || process.env.CHARIOW_SECRET_KEY || "",
    publicKey: savedConfig?.chariow?.publicKey || process.env.CHARIOW_PUBLIC_KEY || "",
  },
};

export function saveConfigToFile(): boolean {
  try {
    ensureDataDir();
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), "utf-8");
    return true;
  } catch (err) {
    console.error("❌ Erreur lors de la sauvegarde du fichier de config:", err);
    return false;
  }
}

export function updateFullConfig(updates: Partial<HubFullConfig>): void {
  if (updates.baseUrl !== undefined) config.baseUrl = updates.baseUrl.replace(/\/$/, "");
  if (updates.adminPassword !== undefined) config.adminPassword = updates.adminPassword;
  if (updates.clientApps !== undefined) config.clientApps = updates.clientApps;

  if (updates.lomopay) {
    config.lomopay = { ...config.lomopay, ...updates.lomopay };
  }
  if (updates.whop) {
    config.whop = { ...config.whop, ...updates.whop };
  }
  if (updates.stripe) {
    config.stripe = { ...config.stripe, ...updates.stripe };
  }
  if (updates.chariow) {
    config.chariow = { ...config.chariow, ...updates.chariow };
  }

  saveConfigToFile();
}

export function upsertClientApp(app: ClientAppConfig): void {
  const index = config.clientApps.findIndex((a) => a.id === app.id);
  if (index >= 0) {
    config.clientApps[index] = app;
  } else {
    config.clientApps.push(app);
  }
  saveConfigToFile();
}

export function deleteClientApp(appId: string): boolean {
  const initialLen = config.clientApps.length;
  config.clientApps = config.clientApps.filter((a) => a.id !== appId);
  if (config.clientApps.length !== initialLen) {
    saveConfigToFile();
    return true;
  }
  return false;
}

export function getClientAppById(appId: string): ClientAppConfig | undefined {
  return config.clientApps.find((app) => app.id === appId);
}

export function getClientAppByApiKey(apiKey: string): ClientAppConfig | undefined {
  return config.clientApps.find((app) => app.apiKey === apiKey);
}

export function exportEnvFormat(): string {
  return `# Configuration SaaS Payment Hub pour Render.com
PORT=${config.port}
NODE_ENV=production
HUB_BASE_URL=${config.baseUrl || "https://votre-app.onrender.com"}
${config.adminPassword ? `ADMIN_PASSWORD=${config.adminPassword}\n` : ""}
# SaaS Connectés (JSON)
CLIENT_APPS='${JSON.stringify(config.clientApps, null, 2)}'

# LomoPay
LOMOPAY_PUBLIC_KEY=${config.lomopay.publicKey}
LOMOPAY_SECRET_KEY=${config.lomopay.secretKey}
LOMOPAY_API_URL=${config.lomopay.apiUrl}

# Whop
WHOP_API_KEY=${config.whop.apiKey}
WHOP_COMPANY_ID=${config.whop.companyId}
WHOP_SANDBOX=${config.whop.isSandbox}

# Stripe
STRIPE_SECRET_KEY=${config.stripe.secretKey}
STRIPE_WEBHOOK_SECRET=${config.stripe.webhookSecret}

# Chariow
CHARIOW_SECRET_KEY=${config.chariow.secretKey}
CHARIOW_PUBLIC_KEY=${config.chariow.publicKey}
`;
}
