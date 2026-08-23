import { IPaymentProvider } from "./base";
import { CreatePaymentRequest, UnifiedPaymentResponse, UnifiedWebhookPayload } from "../types";
import { config, getAppProviderConfig } from "../config";

export interface IKeepayH2HPayinRequest {
  amount: number;
  currency?: string;
  country: string;
  phoneNumber: string;
  operator: string;
  external_reference?: string;
  customer_email?: string;
  otp?: string;
}

export interface IKeepayH2HPayoutRequest {
  amount: number;
  currency?: string;
  country: string;
  phoneNumber: string;
  operator: string;
  external_reference?: string;
}

export interface IKeepayCardCreationPayload {
  firstName: string;
  lastName: string;
  email: string;
  dob: string;
  phone: string;
  line1: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  idType: string;
  idNumber: string;
  initialAmountCents: number;
  creationFee?: number;
  idImage: string;
  brand?: "MasterCard" | "Visa";
}

export class iKeepayProvider implements IPaymentProvider {
  readonly name = "ikeepay" as const;

  readonly CHECKOUT_INLINE_BASE = "https://ikeepay.com/checkout/v1/inline";
  readonly API_BASE_URL = "https://api.ikeepay.com";
  readonly CARD_LIVE_URL = "https://api.ikeepay.com/ikeecard";
  readonly CARD_SANDBOX_URL = "https://api.ikeepay.com/ikeecard-sandbox";

  /**
   * Initialise un paiement avec iKeePay (Supporte le Checkout Inline officiel et le Payin H2H direct)
   */
  async createPayment(request: CreatePaymentRequest): Promise<UnifiedPaymentResponse> {
    const providerConfig = await getAppProviderConfig(request.appId, this.name);
    const publicKey = providerConfig.publicKey || config.ikeepay.publicKey;
    const secretKey = providerConfig.secretKey || config.ikeepay.secretKey;
    const extraConfig = providerConfig.extraConfig || {};

    if (!publicKey && !secretKey) {
      return {
        success: false,
        error: `iKeePay : Clé Publique (pk) ou Clé Secrète (x-api-key) non configurées pour le site "${request.appId}". Renseignez-les dans l'onglet Processeurs de ce site.`
      };
    }

    // Normalisation de la devise (XOF, USD, EUR, etc.)
    let currency = (request.currency || "XOF").toUpperCase();
    if (currency === "FCFA" || currency === "CFA") currency = "XOF";

    // Format universel pour identifier le SaaS et la commande dans les webhooks: "appId:::orderId"
    const externalRef = `${request.appId}:::${request.orderId}`;

    const isH2HMode = 
      request.metadata?.mode === "h2h" || 
      extraConfig.mode === "h2h" || 
      Boolean(request.metadata?.h2h) || 
      (Boolean(request.metadata?.operator) && (Boolean(request.metadata?.phoneNumber) || Boolean(request.customer?.phone)));

    // 1. MODE DIRECT H2H PAYIN
    if (isH2HMode && secretKey) {
      const h2hUrl = extraConfig.apiUrl ? `${extraConfig.apiUrl.replace(/\/$/, '')}/h2h-payin` : `${this.API_BASE_URL}/h2h-payin`;
      const phoneNumber = request.metadata?.phoneNumber || request.customer?.phone || "";
      const operator = (request.metadata?.operator || extraConfig.defaultOperator || "ORANGE").toUpperCase();
      const country = (request.metadata?.country || extraConfig.defaultCountry || "CI").toUpperCase();
      const otp = request.metadata?.otp || undefined;

      const payload: any = {
        amount: Number(request.amount),
        currency: currency,
        country: country,
        phoneNumber: phoneNumber,
        operator: operator,
        external_reference: externalRef,
        customer_email: request.customer?.email || "",
      };

      if (otp) {
        payload.otp = otp;
      }

      console.log(`[iKeePay H2H Payin] Envoi requête pour ${request.appId}:`, JSON.stringify(payload));

      try {
        const response = await fetch(h2hUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "x-api-key": secretKey.trim(),
          },
          body: JSON.stringify(payload),
        });

        const rawText = await response.text();
        let data: any;
        try {
          data = JSON.parse(rawText);
        } catch {
          console.error("[iKeePay H2H] Réponse non-JSON reçue:", rawText);
          return {
            success: false,
            error: `Réponse iKeePay H2H inattendue (${response.status}): ${rawText.substring(0, 200)}`,
          };
        }

        console.log("[iKeePay H2H] Réponse reçue:", data);

        const paymentLink = data.payment_link || data.checkout_url || data.url || data.data?.payment_link || data.data?.url;
        const transactionRef = data.ikeepay_ref || data.provider_reference || data.id || data.reference || externalRef;

        return {
          success: response.ok || data.status === "pending" || data.status === "completed" || Boolean(paymentLink),
          paymentId: transactionRef,
          orderId: request.orderId,
          checkoutUrl: paymentLink || undefined,
          provider: this.name,
          status: data.status === "completed" ? "completed" : "pending",
          rawProviderData: data,
          error: !response.ok && !paymentLink ? (data.message || data.error || "Erreur Payin iKeePay H2H") : undefined,
        };
      } catch (h2hErr: any) {
        console.error("[iKeePay H2H] Erreur réseau:", h2hErr);
        return {
          success: false,
          error: `Erreur de connexion à l'API iKeePay H2H: ${h2hErr.message || h2hErr}`,
        };
      }
    }

    // 2. MODE CHECKOUT INLINE OFFICIEL (Par défaut)
    try {
      const effectivePk = (publicKey || secretKey).trim();
      const params = new URLSearchParams({
        pk: effectivePk,
        amount: request.amount.toString(),
        currency: currency,
        order_id: externalRef,
      });

      if (request.returnUrl) {
        params.append("redirect_url", request.returnUrl);
      }

      const checkoutUrl = `${config.ikeepay.checkoutUrl || this.CHECKOUT_INLINE_BASE}?${params.toString()}`;

      console.log(`[iKeePay Inline Checkout] Généré pour ${request.appId}:`, checkoutUrl);

      return {
        success: true,
        paymentId: externalRef,
        orderId: request.orderId,
        checkoutUrl: checkoutUrl,
        provider: this.name,
        status: "pending",
      };
    } catch (err: any) {
      console.error("[iKeePay] Erreur création checkout:", err);
      return {
        success: false,
        error: `Erreur iKeePay: ${err.message || err}`,
      };
    }
  }

  /**
   * Retrait H2H Direct (Payout)
   */
  async createPayout(appId: string, params: IKeepayH2HPayoutRequest): Promise<any> {
    const providerConfig = await getAppProviderConfig(appId, this.name);
    const secretKey = providerConfig.secretKey || config.ikeepay.secretKey;
    const extraConfig = providerConfig.extraConfig || {};

    if (!secretKey) {
      throw new Error(`iKeePay Secret Key non configurée pour ${appId}`);
    }

    const payoutUrl = extraConfig.apiUrl ? `${extraConfig.apiUrl.replace(/\/$/, '')}/h2h-payout` : `${this.API_BASE_URL}/h2h-payout`;
    const externalRef = params.external_reference || `${appId}:::PAYOUT_${Date.now()}`;

    const payload = {
      amount: Number(params.amount),
      currency: (params.currency || "XOF").toUpperCase(),
      country: (params.country || "CI").toUpperCase(),
      phoneNumber: params.phoneNumber,
      operator: params.operator.toUpperCase(),
      external_reference: externalRef,
    };

    console.log(`[iKeePay H2H Payout] Envoi requête pour ${appId}:`, payload);

    const response = await fetch(payoutUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "x-api-key": secretKey.trim(),
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    return data;
  }

  /**
   * Gestion des Cartes Virtuelles Visa/Mastercard (iKeeCard)
   */
  async cardAction(appId: string, action: "create-card" | "get-details" | "fund-withdraw" | "delete-card", payload: any, isSandbox?: boolean): Promise<any> {
    const providerConfig = await getAppProviderConfig(appId, this.name);
    const secretKey = providerConfig.secretKey || config.ikeepay.secretKey;
    const extraConfig = providerConfig.extraConfig || {};

    if (!secretKey) {
      throw new Error(`iKeePay Secret Key non configurée pour ${appId}`);
    }

    const useSandbox = isSandbox ?? extraConfig.isSandbox ?? false;
    const endpoint = useSandbox ? this.CARD_SANDBOX_URL : this.CARD_LIVE_URL;

    const requestBody = {
      action,
      payload,
    };

    console.log(`[iKeeCard] Action [${action}] pour ${appId}:`, JSON.stringify(requestBody));

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "x-ikeepay-api-key": secretKey.trim(),
      },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();
    return data;
  }

  /**
   * Vérification de sécurité des requêtes Webhooks
   */
  async verifyWebhookSignature(rawBody: string, headers: Record<string, string | string[] | undefined>): Promise<boolean> {
    let appId = "verifsms";
    try {
      const parsed = JSON.parse(rawBody);
      const extRef = parsed.data?.external_reference || parsed.external_reference || parsed.order_id || "";
      if (extRef.includes(":::")) {
        appId = extRef.split(":::")[0];
      }
    } catch {}

    const providerConfig = await getAppProviderConfig(appId, this.name);
    const secretKey = (providerConfig.secretKey || config.ikeepay.secretKey || "").trim();

    // Si une clé secrète est fournie dans l'en-tête, on la vérifie
    const incomingApiKey = (headers["x-api-key"] || headers["x-ikeepay-api-key"] || headers["X-Api-Key"]) as string;
    if (incomingApiKey && secretKey) {
      return incomingApiKey.trim() === secretKey;
    }

    return true;
  }

  /**
   * Transformation des différents webhooks iKeePay en format standard unifié
   */
  async parseWebhookEvent(rawBody: string, _headers: Record<string, string | string[] | undefined>): Promise<UnifiedWebhookPayload | null> {
    let body: any;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return null;
    }

    const event = body.event || body.type;
    const data = body.data || body;

    // 1. WEBHOOK CHECKOUT INLINE ("payment.success")
    if (event === "payment.success") {
      const rawOrderId = body.order_id || body.ikeepay_ref || "";
      let appId = "verifsms";
      let orderId = rawOrderId;

      if (rawOrderId.includes(":::")) {
        const parts = rawOrderId.split(":::");
        appId = parts[0];
        orderId = parts[1];
      }

      const status = (body.status || "completed").toLowerCase();
      const isSuccess = status === "completed" || status === "success";

      return {
        event: isSuccess ? "payment.succeeded" : "payment.failed",
        appId,
        paymentId: body.ikeepay_ref || rawOrderId,
        orderId: orderId,
        provider: this.name,
        amount: Number(body.amount || 0),
        currency: body.currency || "XOF",
        providerTransactionId: body.ikeepay_ref,
        metadata: body,
        timestamp: Date.now(),
      };
    }

    // 2. WEBHOOK H2H ("transaction.updated" ou "transaction.created")
    if (event === "transaction.updated" || event === "transaction.created") {
      const extRef = data.external_reference || "";
      let appId = "verifsms";
      let orderId = extRef;

      if (extRef.includes(":::")) {
        const parts = extRef.split(":::");
        appId = parts[0];
        orderId = parts[1];
      }

      const status = (data.status || "").toLowerCase();
      let unifiedEvent: UnifiedWebhookPayload["event"] = "payment.failed";

      if (status === "completed" || status === "success") {
        unifiedEvent = "payment.succeeded";
      } else if (status === "failed") {
        unifiedEvent = "payment.failed";
      } else if (status === "canceled" || status === "cancelled") {
        unifiedEvent = "payment.canceled";
      } else {
        // En cas de statut 'pending', on ne déclenche pas d'échec
        return null;
      }

      return {
        event: unifiedEvent,
        appId,
        paymentId: data.provider_reference || data.id || extRef,
        orderId: orderId,
        provider: this.name,
        amount: Number(data.amount || 0),
        currency: data.currency || "XOF",
        customer: {
          phone: data.phone_number,
        },
        providerTransactionId: data.provider_reference || data.id,
        metadata: {
          type: data.type,
          operator: data.operator,
          country: data.country,
          site: data.site,
          raw: data,
        },
        timestamp: Date.now(),
      };
    }

    // 3. WEBHOOKS CARTES VIRTUELLES (iKeeCard)
    if (event === "card.created" || event === "card.updated" || event === "card.frozen") {
      const cardId = data.ikeepay_card_id || data.id;
      return {
        event: "payment.succeeded",
        appId: "verifsms",
        paymentId: cardId,
        orderId: cardId,
        provider: this.name,
        amount: Number(data.balance || 0),
        currency: "USD",
        customer: {
          email: data.customer_email,
          name: data.card_holder_name,
        },
        providerTransactionId: cardId,
        metadata: {
          cardEvent: event,
          brand: data.brand,
          status: data.status,
          raw: data,
        },
        timestamp: Date.now(),
      };
    }

    return null;
  }
}
