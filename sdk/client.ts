import crypto from "crypto";

export interface CreatePaymentOptions {
  provider?: "lomopay" | "whop" | "stripe" | "chariow" | "ikeepay" | "saspay" | "depipay" | "auto";
  amount: number;
  currency?: string;
  orderId: string;
  description?: string;
  returnUrl: string;
  cancelUrl?: string;
  customer?: {
    email?: string;
    name?: string;
    phone?: string;
  };
  metadata?: Record<string, any>;
}

export interface PaymentClientConfig {
  hubBaseUrl: string;
  apiKey: string;
  webhookSecret: string;
}

export interface UnifiedWebhookEvent {
  event: "payment.succeeded" | "payment.failed" | "payment.canceled";
  appId: string;
  paymentId: string;
  orderId: string;
  provider: string;
  amount: number;
  currency: string;
  customer?: {
    email?: string;
    name?: string;
    phone?: string;
  };
  metadata?: Record<string, any>;
  providerTransactionId?: string;
  timestamp: number;
}

export class SaasPaymentClient {
  private hubBaseUrl: string;
  private apiKey: string;
  private webhookSecret: string;

  constructor(config: PaymentClientConfig) {
    this.hubBaseUrl = config.hubBaseUrl.replace(/\/$/, "");
    this.apiKey = config.apiKey;
    this.webhookSecret = config.webhookSecret;
  }

  /**
   * Crée une session de paiement hébergée (Checkout Portal / Widget)
   */
  async createSession(options: {
    amount: number;
    currency?: string;
    orderId: string;
    description?: string;
    customerEmail?: string;
    customerName?: string;
    returnUrl?: string;
    cancelUrl?: string;
  }) {
    const url = `${this.hubBaseUrl}/checkout/session`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Hub-Api-Key": this.apiKey,
      },
      body: JSON.stringify(options),
    });
    return (await response.json()) as {
      success: boolean;
      token?: string;
      checkoutUrl?: string;
      error?: string;
    };
  }

  /**
   * Crée un paiement direct auprès d'un processeur
   */
  async createPayment(options: CreatePaymentOptions) {
    const url = `${this.hubBaseUrl}/api/v1/payments/create`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Hub-Api-Key": this.apiKey,
      },
      body: JSON.stringify({
        provider: options.provider || "auto",
        amount: options.amount,
        currency: options.currency || "XOF",
        orderId: options.orderId,
        description: options.description,
        returnUrl: options.returnUrl,
        cancelUrl: options.cancelUrl,
        customer: options.customer,
        metadata: options.metadata,
      }),
    });

    const data = await response.json();
    return data as {
      success: boolean;
      paymentId?: string;
      orderId?: string;
      checkoutUrl?: string;
      provider?: string;
      error?: string;
    };
  }

  /**
   * Retrait H2H Direct iKeePay (Payout)
   */
  async ikeepayPayout(options: {
    amount: number;
    currency?: string;
    country: string;
    phoneNumber: string;
    operator: string;
    orderId?: string;
  }) {
    const url = `${this.hubBaseUrl}/api/v1/payments/ikeepay/payout`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Hub-Api-Key": this.apiKey,
      },
      body: JSON.stringify(options),
    });
    return await response.json();
  }

  /**
   * Gestion Cartes Virtuelles iKeeCard (create-card, get-details, fund-withdraw, delete-card)
   */
  async ikeepayCardAction(
    action: "create-card" | "get-details" | "fund-withdraw" | "delete-card",
    payload: any,
    isSandbox?: boolean
  ) {
    const url = `${this.hubBaseUrl}/api/v1/payments/ikeepay/card`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Hub-Api-Key": this.apiKey,
      },
      body: JSON.stringify({ action, payload, isSandbox }),
    });
    return await response.json();
  }

  /**
   * Déclenche la scrutation manuelle des événements de paiement DepiPay
   */
  async depipayPoll() {
    const url = `${this.hubBaseUrl}/api/v1/payments/depipay/poll`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Hub-Api-Key": this.apiKey,
      },
    });
    return await response.json();
  }

  /**
   * Effectue un retrait Mobile Money direct via SasPay (Payout)
   */
  async saspayPayout(options: {
    amount: number;
    currency: string;
    country: string;
    method: string;
    phoneNumber: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    description?: string;
  }) {
    const url = `${this.hubBaseUrl}/api/v1/payments/saspay/payout`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Hub-Api-Key": this.apiKey,
      },
      body: JSON.stringify(options),
    });
    return await response.json();
  }

  /**
   * Récupère les soldes du Wallet SasPay
   */
  async saspayBalances() {
    const url = `${this.hubBaseUrl}/api/v1/payments/saspay/balances`;
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "X-Hub-Api-Key": this.apiKey,
      },
    });
    return await response.json();
  }

  /**
   * Liste les passerelles de paiement disponibles et actives
   */
  async listProviders() {
    const url = `${this.hubBaseUrl}/api/v1/payments/providers`;
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "X-Hub-Api-Key": this.apiKey,
      },
    });
    return (await response.json()) as { success: boolean; providers: string[] };
  }

  /**
   * Vérifie le statut en direct d'une session de paiement
   */
  async getSessionStatus(token: string) {
    const url = `${this.hubBaseUrl}/checkout/status/${encodeURIComponent(token)}`;
    const response = await fetch(url, {
      method: "GET",
    });
    return (await response.json()) as {
      status: "pending" | "processing" | "succeeded" | "failed" | "canceled";
      orderId: string;
      provider?: string;
      amount?: number;
      currency?: string;
      error?: string;
    };
  }

  /**
   * Vérifie la signature du webhook transmis par le Payment Hub à votre SaaS
   */
  verifyWebhook(rawBody: string, signatureHeader: string | null): boolean {
    if (!signatureHeader || !this.webhookSecret) return false;

    try {
      const hmac = crypto.createHmac("sha256", this.webhookSecret).update(rawBody).digest("hex");
      const expectedWithPrefix = `sha256=${hmac}`;
      const received = signatureHeader.trim();

      const bufReceived = Buffer.from(received.startsWith("sha256=") ? received : `sha256=${received}`);
      const bufExpected = Buffer.from(expectedWithPrefix);

      if (bufReceived.length !== bufExpected.length) return false;
      return crypto.timingSafeEqual(bufReceived, bufExpected);
    } catch {
      return false;
    }
  }
}
