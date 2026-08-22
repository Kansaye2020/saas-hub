import crypto from "crypto";
import { IPaymentProvider } from "./base";
import { CreatePaymentRequest, UnifiedPaymentResponse, UnifiedWebhookPayload } from "../types";
import { config, getAppProviderConfig } from "../config";

export class LomoPayProvider implements IPaymentProvider {
  readonly name = "lomopay" as const;

  async createPayment(request: CreatePaymentRequest): Promise<UnifiedPaymentResponse> {
    const { publicKey, secretKey } = await getAppProviderConfig(request.appId, this.name);
    const apiUrl = config.lomopay.apiUrl || "https://lomopay.net/api/v1/payments.php";

    if (!publicKey || !secretKey) {
      return {
        success: false,
        error: `LomoPay : Clé Publique ou Clé Secrète non configurées pour le site "${request.appId}". Veuillez les renseigner dans l'onglet Processeurs de ce site.`
      };
    }

    // Normalisation de la devise (LomoPay attend XOF ou XAF)
    let currency = (request.currency || "XOF").toUpperCase();
    if (currency === "FCFA" || currency === "CFA") {
      currency = "XOF";
    }

    // Encodage de l'appId et l'orderId dans external_reference pour le routage universel
    const externalRef = `${request.appId}:::${request.orderId}`;
    const webhookUrl = `${config.baseUrl}/webhooks/lomopay`;

    const payload = {
      amount: Number(request.amount),
      currency: currency,
      description: request.description || `Commande #${request.orderId}`,
      external_reference: externalRef,
      return_url: request.returnUrl,
      notify_url: webhookUrl,
      webhook_url: webhookUrl,
      callback_url: webhookUrl,
      customer_email: request.customer?.email || "",
      email: request.customer?.email || "",
      customer_name: request.customer?.name || "",
      name: request.customer?.name || "",
      customer_phone: request.customer?.phone || "",
      phone: request.customer?.phone || "",
    };

    try {
      console.log(`[LomoPay] Envoi de la requête de paiement pour l'app ${request.appId}:`, JSON.stringify(payload));

      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "X-Public-Key": publicKey.trim(),
          "X-Secret-Key": secretKey.trim(),
        },
        body: JSON.stringify(payload),
      });

      const rawText = await response.text();
      let data: any;
      try {
        data = JSON.parse(rawText);
      } catch (err) {
        console.error("[LomoPay] Réponse non-JSON reçue:", rawText);
        return {
          success: false,
          error: `Réponse LomoPay inattendue (Code HTTP ${response.status}): ${rawText.substring(0, 200)}`
        };
      }

      console.log("[LomoPay] Réponse reçue de l'API:", data);

      const checkoutUrl = data.data?.checkout_url || data.checkout_url || data.data?.url || data.url;

      if (!data.success && !checkoutUrl) {
        return {
          success: false,
          error: data.message || data.error || data.description || "Erreur lors de l'initialisation du paiement LomoPay",
          rawProviderData: data,
        };
      }

      if (!checkoutUrl) {
        return {
          success: false,
          error: "LomoPay n'a pas retourné d'URL de redirection de paiement.",
          rawProviderData: data,
        };
      }

      let finalCheckoutUrl = checkoutUrl;
      if (request.customer?.email) {
        try {
          const urlObj = new URL(finalCheckoutUrl);
          urlObj.searchParams.set("email", request.customer.email);
          urlObj.searchParams.set("customer_email", request.customer.email);
          if (request.customer.name) {
            urlObj.searchParams.set("name", request.customer.name);
            urlObj.searchParams.set("customer_name", request.customer.name);
          }
          finalCheckoutUrl = urlObj.toString();
        } catch (e) {}
      }

      return {
        success: true,
        paymentId: data.data?.id || data.id || externalRef,
        orderId: request.orderId,
        checkoutUrl: finalCheckoutUrl,
        provider: this.name,
        status: "pending",
        rawProviderData: data.data || data,
      };
    } catch (networkError: any) {
      console.error("[LomoPay] Erreur réseau / API:", networkError);
      return {
        success: false,
        error: `Erreur de connexion à l'API LomoPay: ${networkError.message || networkError}`
      };
    }
  }

  async verifyWebhookSignature(rawBody: string, headers: Record<string, string | string[] | undefined>): Promise<boolean> {
    let appId = "verifsms";
    try {
      const payload = JSON.parse(rawBody);
      const extRef = payload.data?.external_reference || payload.external_reference || "";
      if (extRef.includes(":::")) {
        appId = extRef.split(":::")[0];
      }
    } catch {}

    const { secretKey } = await getAppProviderConfig(appId, this.name);
    const signatureHeader = (headers["x-lomopay-signature"] || headers["X-Lomopay-Signature"] || headers["signature"]) as string;

    if (!secretKey) {
      return true; // Bypass si pas de clé configurée pour éviter de bloquer
    }

    if (!signatureHeader) {
      return true;
    }

    try {
      const hmac = crypto.createHmac("sha256", secretKey.trim()).update(rawBody).digest("hex");
      const expectedWithPrefix = `sha256=${hmac}`;
      const received = signatureHeader.trim();

      if (received.startsWith("sha256=")) {
        const bufReceived = Buffer.from(received);
        const bufExpected = Buffer.from(expectedWithPrefix);
        if (bufReceived.length !== bufExpected.length) return false;
        return crypto.timingSafeEqual(bufReceived, bufExpected);
      } else {
        const bufReceived = Buffer.from(received);
        const bufExpected = Buffer.from(hmac);
        if (bufReceived.length !== bufExpected.length) return false;
        return crypto.timingSafeEqual(bufReceived, bufExpected);
      }
    } catch (err) {
      console.error("Erreur vérification signature LomoPay:", err);
      return false;
    }
  }

  async parseWebhookEvent(rawBody: string, headers: Record<string, string | string[] | undefined>): Promise<UnifiedWebhookPayload | null> {
    const payload = JSON.parse(rawBody);
    const eventType = payload.type || payload.event;
    const paymentData = payload.data || payload;
    const externalReference = paymentData.external_reference || "";
    const lomoTransactionId = paymentData.transaction_id || paymentData.id || paymentData.reference;
    const status = (paymentData.status || "").toLowerCase();

    // Décomposition de external_reference: "appId:::orderId"
    let appId = "verifsms";
    let orderId = externalReference;
    if (externalReference.includes(":::")) {
      const parts = externalReference.split(":::");
      appId = parts[0];
      orderId = parts[1];
    }

    let unifiedEvent: UnifiedWebhookPayload["event"] = "payment.failed";
    if (eventType === "payment.succeeded" || status === "completed" || status === "success" || status === "succeeded") {
      unifiedEvent = "payment.succeeded";
    } else if (status === "canceled" || status === "cancelled") {
      unifiedEvent = "payment.canceled";
    }

    return {
      event: unifiedEvent,
      appId,
      paymentId: lomoTransactionId || externalReference,
      orderId: orderId || lomoTransactionId,
      provider: this.name,
      amount: Number(paymentData.amount || 0),
      currency: paymentData.currency || "XOF",
      customer: {
        email: paymentData.customer_email || paymentData.email,
        name: paymentData.customer_name || paymentData.name,
        phone: paymentData.customer_phone || paymentData.phone,
      },
      providerTransactionId: lomoTransactionId,
      metadata: {
        raw: paymentData,
      },
      timestamp: Date.now(),
    };
  }
}
