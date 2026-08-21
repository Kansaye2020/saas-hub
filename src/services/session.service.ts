import fs from "fs";
import path from "path";
import crypto from "crypto";
import { CustomerInfo, PaymentProviderType, PaymentStatus } from "../types";

export interface CheckoutSession {
  id: string; // e.g. chk_1724238000_abc123
  appId: string;
  appName?: string;
  orderId: string;
  amount: number;
  currency: string;
  description: string;
  customer?: CustomerInfo;
  returnUrl: string;
  cancelUrl?: string;
  metadata?: Record<string, any>;
  preferredProvider?: PaymentProviderType | "auto";
  status: PaymentStatus;
  provider?: PaymentProviderType;
  providerPaymentId?: string;
  providerTransactionId?: string;
  providerRedirectUrl?: string;
  createdAt: string;
  updatedAt: string;
}

const DATA_DIR = path.join(process.cwd(), "data");
const SESSIONS_FILE = path.join(DATA_DIR, "sessions.json");

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    } catch (e) {}
  }
}

export class SessionService {
  private static sessions: Map<string, CheckoutSession> = new Map();
  private static isLoaded = false;

  private static loadSessions() {
    if (this.isLoaded) return;
    try {
      if (fs.existsSync(SESSIONS_FILE)) {
        const raw = fs.readFileSync(SESSIONS_FILE, "utf-8");
        const list: CheckoutSession[] = JSON.parse(raw);
        if (Array.isArray(list)) {
          list.forEach((s) => this.sessions.set(s.id, s));
        }
      }
    } catch (e) {
      console.warn("Could not load sessions from file:", e);
    }
    this.isLoaded = true;
  }

  private static saveSessions() {
    try {
      ensureDataDir();
      const list = Array.from(this.sessions.values()).slice(-500); // Keep last 500
      fs.writeFileSync(SESSIONS_FILE, JSON.stringify(list, null, 2), "utf-8");
    } catch (e) {
      console.error("Could not save sessions to file:", e);
    }
  }

  static createSession(params: {
    appId: string;
    appName?: string;
    orderId: string;
    amount: number;
    currency?: string;
    description?: string;
    customer?: CustomerInfo;
    returnUrl: string;
    cancelUrl?: string;
    metadata?: Record<string, any>;
    provider?: PaymentProviderType | "auto";
  }): CheckoutSession {
    this.loadSessions();

    const id = `chk_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
    const now = new Date().toISOString();

    const session: CheckoutSession = {
      id,
      appId: params.appId,
      appName: params.appName || params.appId,
      orderId: params.orderId,
      amount: params.amount,
      currency: (params.currency || "XOF").toUpperCase(),
      description: params.description || `Commande #${params.orderId}`,
      customer: params.customer,
      returnUrl: params.returnUrl,
      cancelUrl: params.cancelUrl || params.returnUrl,
      metadata: params.metadata || {},
      preferredProvider: params.provider || "auto",
      status: "pending",
      createdAt: now,
      updatedAt: now,
    };

    this.sessions.set(id, session);
    this.saveSessions();

    return session;
  }

  static getSession(id: string): CheckoutSession | undefined {
    this.loadSessions();
    return this.sessions.get(id);
  }

  static findSessionByOrderId(orderId: string, appId?: string): CheckoutSession | undefined {
    this.loadSessions();
    for (const session of this.sessions.values()) {
      if (session.orderId === orderId && (!appId || session.appId === appId)) {
        return session;
      }
    }
    return undefined;
  }

  static updateSession(id: string, updates: Partial<CheckoutSession>): CheckoutSession | undefined {
    this.loadSessions();
    const session = this.sessions.get(id);
    if (!session) return undefined;

    const updated = {
      ...session,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    this.sessions.set(id, updated);
    this.saveSessions();
    return updated;
  }

  static listSessions(limit = 50): CheckoutSession[] {
    this.loadSessions();
    return Array.from(this.sessions.values())
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);
  }
}
