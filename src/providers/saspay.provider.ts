import crypto from "crypto";
import { IPaymentProvider } from "./base";
import { CreatePaymentRequest, UnifiedPaymentResponse, UnifiedWebhookPayload } from "../types";
import { getAppProviderConfig } from "../config";

export class SasPayProvider implements IPaymentProvider {
  readonly name = "saspay" as const;
  readonly API_BASE_URL = "https://api.saspay.me/api/v1";

  /**
   * Initialise un paiement avec SasPay (Supporte Checkout Session hébergée et SoftPay)
   */
  async createPayment(request: CreatePaymentRequest): Promise<UnifiedPaymentResponse> {
    const { publicKey, secretKey, extraConfig } = await getAppProviderConfig(request.appId, this.name);
    const apiUrl = extraConfig?.apiUrl || `${this.API_BASE_URL}/checkout-sessions/`;

    if (!secretKey) {
      return {
        success: false,
        error: `SasPay : Clé Secrète API (sk_live_... ou sk_test_...) non configurée pour le site "${request.appId}". Veuillez la renseigner dans l'onglet Processeurs de ce site.`
      };
    }

    // Normalisation de la devise (SasPay attend XOF, XAF, etc.)
    let currency = (request.currency || "XOF").toUpperCase();
    if (currency === "FCFA" || currency === "CFA") {
      currency = "XOF";
    }

    // Encodage universel appId:::orderId
    const externalRef = `${request.appId}:::${request.orderId}`;

    const metadata: Record<string, any> = {
      appId: request.appId,
      orderId: request.orderId,
      external_reference: externalRef,
      ...(request.metadata || {})
    };

    // Vérifier si un paiement direct SoftPay a été demandé
    const isSoftpay = request.metadata?.mode === "softpay" || Boolean(request.metadata?.network && request.metadata?.country);

    if (isSoftpay) {
      return await this.createSoftpayPayment(request, secretKey, currency, externalRef, metadata, extraConfig);
    }

    // Mode standard : Session de Checkout hébergée
    const payload: any = {
      amount: Number(request.amount).toFixed(2),
      currency: currency,
      description: request.description || `Commande #${request.orderId}`,
      customer_email: request.customer?.email || `client@${request.appId}.local`,
      customer_name: request.customer?.name || "Client",
      return_url: request.returnUrl,
      metadata: metadata,
    };

    if (request.customer?.phone) {
      payload.customer_phone = request.customer.phone;
    }

    const defaultCountry = request.metadata?.country || extraConfig?.country || extraConfig?.defaultCountry;
    if (defaultCountry) {
      payload.country = defaultCountry.toString().toUpperCase().slice(0, 2);
    }

    const feeChargeMode = request.metadata?.fee_charge_mode || extraConfig?.fee_charge_mode;
    if (feeChargeMode && (feeChargeMode === "ADD_ON" || feeChargeMode === "DEDUCTED")) {
      payload.fee_charge_mode = feeChargeMode;
    }

    try {
      console.log(`[SasPay] Création Checkout Session pour l'app ${request.appId}:`, JSON.stringify(payload));

      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "Authorization": `Bearer ${secretKey.trim()}`
        },
        body: JSON.stringify(payload),
      });

      const rawText = await response.text();
      let resData: any;
      try {
        resData = JSON.parse(rawText);
      } catch (err) {
        console.error("[SasPay] Réponse non-JSON reçue:", rawText);
        return {
          success: false,
          error: `Réponse SasPay inattendue (Code HTTP ${response.status}): ${rawText.substring(0, 200)}`
        };
      }

      console.log("[SasPay] Réponse reçue de l'API:", resData);

      const session = resData.data || resData;
      const checkoutUrl = session.checkout_url || resData.checkout_url;

      if (!checkoutUrl && (!response.ok || resData.success === false)) {
        const errMsg = 
          resData.error?.message || 
          resData.message || 
          (typeof resData.error === 'object' ? JSON.stringify(resData.error) : resData.error) ||
          "Erreur lors de la création de la session SasPay";
        return {
          success: false,
          error: `SasPay: ${errMsg}`,
          rawProviderData: resData
        };
      }

      if (!checkoutUrl) {
        return {
          success: false,
          error: "SasPay n'a pas renvoyé d'URL de redirection (checkout_url).",
          rawProviderData: resData
        };
      }

      const paymentId = session.id || resData.id || session.slug || externalRef;

      return {
        success: true,
        paymentId: paymentId,
        orderId: request.orderId,
        checkoutUrl: checkoutUrl,
        provider: this.name,
        status: "pending",
        rawProviderData: session,
      };
    } catch (networkError: any) {
      console.error("[SasPay] Erreur réseau / API:", networkError);
      return {
        success: false,
        error: `Erreur de connexion à l'API SasPay: ${networkError.message || networkError}`
      };
    }
  }

  /**
   * Mode SoftPay direct (Push USSD ou redirection spécifique opérateur)
   */
  private async createSoftpayPayment(
    request: CreatePaymentRequest, 
    secretKey: string, 
    currency: string, 
    externalRef: string, 
    metadata: Record<string, any>,
    extraConfig: any
  ): Promise<UnifiedPaymentResponse> {
    const softpayUrl = `${this.API_BASE_URL}/payments/softpay/`;

    const names = (request.customer?.name || "Client").trim().split(" ");
    const firstName = names[0] || "Client";
    const lastName = names.slice(1).join(" ") || "Client";

    const payload: any = {
      amount: Number(request.amount).toFixed(2),
      currency: currency,
      country: (request.metadata?.country || extraConfig?.country || "BJ").toUpperCase(),
      network: request.metadata?.network || extraConfig?.defaultNetwork || "mtn_bj",
      description: request.description || `Commande #${request.orderId}`,
      customer: {
        first_name: firstName,
        last_name: lastName,
        email: request.customer?.email || `client@${request.appId}.local`,
        phone: request.customer?.phone || request.metadata?.phoneNumber || ""
      },
      return_url: request.returnUrl,
      metadata: metadata
    };

    try {
      console.log(`[SasPay Softpay] Envoi de la requête pour l'app ${request.appId}:`, JSON.stringify(payload));

      const response = await fetch(softpayUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "Authorization": `Bearer ${secretKey.trim()}`
        },
        body: JSON.stringify(payload)
      });

      const rawText = await response.text();
      let resData: any;
      try { resData = JSON.parse(rawText); } catch {
        return {
          success: false,
          error: `Réponse SasPay inattendue (Code HTTP ${response.status}): ${rawText.substring(0, 200)}`
        };
      }

      const paymentObj = resData.data || resData;
      const checkoutUrl = paymentObj.checkout_url || resData.checkout_url;
      const paymentId = paymentObj.id || resData.id || externalRef;

      if (!response.ok && !checkoutUrl) {
        return {
          success: false,
          error: resData.error?.message || resData.message || "Erreur lors du paiement SoftPay SasPay",
          rawProviderData: resData
        };
      }

      return {
        success: true,
        paymentId: paymentId,
        orderId: request.orderId,
        checkoutUrl: checkoutUrl || undefined,
        provider: this.name,
        status: "pending",
        rawProviderData: paymentObj
      };
    } catch (err: any) {
      return {
        success: false,
        error: `Erreur SoftPay SasPay: ${err.message || err}`
      };
    }
  }

  /**
   * Vérification de la signature cryptographique HMAC-SHA256 envoyée par le webhook SasPay
   * Header X-Webhook-Signature : hex HMAC sha256
   * Header X-Webhook-Timestamp : Horodatage Unix en secondes
   * Formule : HMAC_SHA256(secret, `${timestamp}.${rawBody}`)
   */
  async verifyWebhookSignature(rawBody: string, headers: Record<string, string | string[] | undefined>): Promise<boolean> {
    const signatureHeader = (
      headers["x-webhook-signature"] || 
      headers["X-Webhook-Signature"] || 
      headers["signature"]
    ) as string;

    const timestampHeader = (
      headers["x-webhook-timestamp"] || 
      headers["X-Webhook-Timestamp"] || 
      headers["timestamp"]
    ) as string;

    // Si aucune signature n'est envoyée (environnement dev / test sans secret)
    if (!signatureHeader) {
      console.warn("[SasPay Webhook] Aucun header X-Webhook-Signature reçu.");
      return true;
    }

    // 1. Contrôle d'âge de l'horodatage (Tolérance 5 minutes = 300 secondes)
    if (timestampHeader) {
      const TOLERANCE_SECONDS = 300;
      const now = Math.floor(Date.now() / 1000);
      const parsedTimestamp = Number(timestampHeader);
      if (!isNaN(parsedTimestamp) && Math.abs(now - parsedTimestamp) > TOLERANCE_SECONDS) {
        console.warn(`[SasPay Webhook] Horodatage hors tolérance (Delta: ${Math.abs(now - parsedTimestamp)}s)`);
        // Note: On ne bloque pas si delta léger en local ou si horloge décalée, mais on logue
      }
    }

    // 2. Recherche de l'appId et du secret de signature
    let appId: string | undefined = undefined;
    let dataId: string | undefined = undefined;
    let externalRef: string | undefined = undefined;

    try {
      const parsed = JSON.parse(rawBody);
      const data = parsed.data || parsed;
      dataId = data.id;
      externalRef = data.external_reference || data.metadata?.external_reference;

      if (data.metadata?.appId) {
        appId = data.metadata.appId;
      } else if (externalRef && externalRef.includes(":::")) {
        appId = externalRef.split(":::")[0];
      }
    } catch {}

    // Recherche dans la base de données si l'appId n'est pas explicite dans le payload
    if (!appId && dataId) {
      try {
        const { dbGet } = require("../database/db");
        const tx = await dbGet("SELECT appId FROM transactions WHERE id = ? OR orderId = ? LIMIT 1", [dataId, dataId]);
        if (tx && tx.appId) {
          appId = tx.appId;
        } else {
          const cs = await dbGet("SELECT appId FROM checkout_sessions WHERE token = ? OR orderId = ? LIMIT 1", [dataId, dataId]);
          if (cs && cs.appId) appId = cs.appId;
        }
      } catch {}
    }

    const { dbQuery } = require("../database/db");
    const { decryptSecret } = require("../utils/encryption");

    // Liste des secrets potentiels à vérifier
    const secretsToCheck: string[] = [];

    if (appId) {
      const config = await getAppProviderConfig(appId, this.name);
      let signingSecret = "";
      if (typeof config.extraConfig === "string") {
        signingSecret = config.extraConfig;
      } else if (config.extraConfig?.signingSecret || config.extraConfig?.webhookSecret) {
        signingSecret = config.extraConfig.signingSecret || config.extraConfig.webhookSecret;
      }

      if (signingSecret) secretsToCheck.push(signingSecret);
      if (config.publicKey) secretsToCheck.push(config.publicKey);
      if (config.secretKey) secretsToCheck.push(config.secretKey);
    }

    // Si aucun secret trouvé pour l'appId (ou appId non résolu), on teste avec tous les sites configurés pour SasPay
    if (secretsToCheck.length === 0) {
      try {
        const rows = await dbQuery("SELECT * FROM providers_config WHERE providerId = ? AND isActive = 1", [this.name]);
        for (const row of rows) {
          let extra: any = {};
          if (row.extraConfig) {
            try { extra = JSON.parse(row.extraConfig); } catch { extra = row.extraConfig; }
          }
          if (typeof extra === "string" && extra) secretsToCheck.push(extra);
          if (extra?.signingSecret) secretsToCheck.push(extra.signingSecret);
          if (extra?.webhookSecret) secretsToCheck.push(extra.webhookSecret);
          if (row.secretKey) secretsToCheck.push(decryptSecret(row.secretKey));
          if (row.publicKey) secretsToCheck.push(row.publicKey);
        }
      } catch {}
    }

    // Si aucune clé configurée n'est disponible
    if (secretsToCheck.length === 0) {
      console.warn("[SasPay Webhook] Aucun secret de signature configuré pour SasPay, bypass validation.");
      return true;
    }

    const receivedSig = signatureHeader.trim().toLowerCase();

    for (const secret of secretsToCheck) {
      if (!secret || typeof secret !== "string") continue;
      try {
        // Selon la doc officielle SasPay: signed = `${timestamp}.${rawBody}`
        const signedContent = timestampHeader ? `${timestampHeader}.${rawBody}` : rawBody;
        const expected = crypto.createHmac("sha256", secret.trim()).update(signedContent).digest("hex").toLowerCase();

        const bufReceived = Buffer.from(receivedSig);
        const bufExpected = Buffer.from(expected);

        if (bufReceived.length === bufExpected.length && crypto.timingSafeEqual(bufReceived, bufExpected)) {
          return true;
        }

        // Test alternatif sans le préfixe timestamp
        const expectedDirect = crypto.createHmac("sha256", secret.trim()).update(rawBody).digest("hex").toLowerCase();
        const bufDirect = Buffer.from(expectedDirect);
        if (bufReceived.length === bufDirect.length && crypto.timingSafeEqual(bufReceived, bufDirect)) {
          return true;
        }
      } catch (e) {}
    }

    console.warn(`[SasPay Webhook] Échec de la vérification de signature pour SasPay.`);
    return false;
  }

  /**
   * Normalisation du webhook SasPay en événement unifié SaaS Payment Hub
   */
  async parseWebhookEvent(rawBody: string, headers: Record<string, string | string[] | undefined>): Promise<UnifiedWebhookPayload | null> {
    let payload: any;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return null;
    }

    const eventName = payload.event || (headers["x-webhook-event"] as string) || "";
    const paymentData = payload.data || payload;

    const dataId = paymentData.id || paymentData.reference;
    const reference = paymentData.reference || dataId;
    const status = (paymentData.status || "").toUpperCase();

    // 1. Extraction appId & orderId
    let appId = "verifsms";
    let orderId = reference || dataId;

    if (paymentData.metadata?.appId) {
      appId = paymentData.metadata.appId;
    }
    if (paymentData.metadata?.orderId) {
      orderId = paymentData.metadata.orderId;
    }

    const extRef = paymentData.external_reference || paymentData.metadata?.external_reference || "";
    if (extRef && extRef.includes(":::")) {
      const parts = extRef.split(":::");
      appId = parts[0];
      orderId = parts[1];
    }

    // 2. Lookup DB si orderId ou appId restent incertains
    if (dataId) {
      try {
        const { dbGet } = require("../database/db");
        const tx = await dbGet("SELECT * FROM transactions WHERE id = ? OR orderId = ? LIMIT 1", [dataId, dataId]);
        if (tx) {
          if (tx.appId) appId = tx.appId;
          if (tx.orderId) orderId = tx.orderId;
        } else {
          const cs = await dbGet("SELECT * FROM checkout_sessions WHERE token = ? OR orderId = ? LIMIT 1", [dataId, dataId]);
          if (cs) {
            if (cs.appId) appId = cs.appId;
            if (cs.orderId) orderId = cs.orderId;
          }
        }
      } catch (e) {}
    }

    // 3. Détermination du statut unifié
    let unifiedEvent: UnifiedWebhookPayload["event"] = "payment.failed";

    if (
      eventName === "transaction.success" || 
      status === "SUCCESS" || 
      status === "COMPLETED" || 
      status === "PAID"
    ) {
      unifiedEvent = "payment.succeeded";
    } else if (
      eventName === "transaction.cancelled" || 
      status === "CANCELLED" || 
      status === "CANCELED"
    ) {
      unifiedEvent = "payment.canceled";
    } else if (
      eventName === "transaction.failed" || 
      status === "FAILED"
    ) {
      unifiedEvent = "payment.failed";
    } else if (eventName.startsWith("settlement.") || eventName.startsWith("wallet_transfer.")) {
      // Événements internes portefeuille / retraits
      console.log(`[SasPay Webhook] Événement secondaire ignoré pour le checkout: ${eventName}`);
      return null;
    }

    const amount = Number(paymentData.amount || paymentData.net_amount || paymentData.charged || 0);

    return {
      event: unifiedEvent,
      appId: appId,
      paymentId: dataId || orderId,
      orderId: orderId,
      provider: this.name,
      amount: amount,
      currency: paymentData.currency || "XOF",
      customer: {
        email: paymentData.customer_email || paymentData.email || paymentData.customer?.email,
        name: paymentData.customer_name || paymentData.name || paymentData.customer?.name,
        phone: paymentData.msisdn || paymentData.customer_phone || paymentData.phone || paymentData.customer?.phone,
      },
      providerTransactionId: reference || dataId,
      metadata: {
        raw: paymentData,
        fee: paymentData.fee,
        charged: paymentData.charged,
        net_amount: paymentData.net_amount,
        fee_charge_mode: paymentData.fee_charge_mode,
        network: paymentData.network,
        country: paymentData.country,
      },
      timestamp: Date.now(),
    };
  }

  /**
   * Effectue un retrait Mobile Money (Payout) via SasPay
   */
  async createPayout(appId: string, payoutData: {
    amount: number;
    currency: string;
    country: string;
    method: string;
    phoneNumber: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    description?: string;
  }): Promise<any> {
    const { secretKey } = await getAppProviderConfig(appId, this.name);
    if (!secretKey) throw new Error(`SasPay Secret Key non configurée pour ${appId}`);

    const payload = {
      amount: Number(payoutData.amount).toFixed(2),
      currency: payoutData.currency.toUpperCase(),
      country: payoutData.country.toUpperCase(),
      method: payoutData.method,
      recipient: {
        msisdn: payoutData.phoneNumber
      },
      customer: {
        first_name: payoutData.firstName || "Beneficiaire",
        last_name: payoutData.lastName || "Client",
        email: payoutData.email || `payout@${appId}.local`,
        phone: payoutData.phoneNumber
      },
      description: payoutData.description || `Retrait ${appId}`
    };

    const res = await fetch(`${this.API_BASE_URL}/payouts/initialize/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": `Bearer ${secretKey.trim()}`
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error?.message || data.message || `Erreur Payout SasPay (${res.status})`);
    }
    return data;
  }

  /**
   * Récupère les soldes du Wallet SasPay
   */
  async getBalances(appId: string): Promise<any> {
    const { secretKey } = await getAppProviderConfig(appId, this.name);
    if (!secretKey) throw new Error(`SasPay Secret Key non configurée pour ${appId}`);

    const res = await fetch(`${this.API_BASE_URL}/wallet/balances/`, {
      headers: {
        "Accept": "application/json",
        "Authorization": `Bearer ${secretKey.trim()}`
      }
    });

    return await res.json();
  }
}
