import crypto from "crypto";
import { IPaymentProvider } from "./base";
import { CreatePaymentRequest, UnifiedPaymentResponse, UnifiedWebhookPayload } from "../types";
import { config, getProviderConfig } from "../config";

export class LomoPayProvider implements IPaymentProvider {
  readonly name = "lomopay" as const;

  async createPayment(request: CreatePaymentRequest): Promise<UnifiedPaymentResponse> {
    const { publicKey, secretKey } = await getProviderConfig(this.name);
    const apiUrl = config.lomopay.apiUrl;

    if (!publicKey || !secretKey) {
      throw new Error("LOMOPAY_PUBLIC_KEY ou LOMOPAY_SECRET_KEY non configurés (DB ou ENV).");
    }

    // On encode l'appId et l'orderId dans l'external_reference pour le routage au retour
    const externalRef = `${request.appId}:::${request.orderId}`;
    const webhookUrl = `${config.baseUrl}/webhooks/lomopay`;

    const payload = {
      amount: request.amount,
      currency: request.currency || "XOF",
      description: request.description || `Paiement ${request.appId} #${request.orderId}`,
      external_reference: externalRef,
      return_url: request.returnUrl,
      webhook_url: webhookUrl,
      customer_email: request.customer?.email,
      email: request.customer?.email,
      customer_name: request.customer?.name,
      name: request.customer?.name,
    };

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Public-Key": publicKey,
        "X-Secret-Key": secretKey,
      },
      body: JSON.stringify(payload),
    });

    const data: any = await response.json();

    if (!data || !data.success || !data.data?.checkout_url) {
      return {
        success: false,
        error: data?.message || data?.error || "Erreur lors de l'initialisation LomoPay",
        rawProviderData: data,
      };
    }

    let checkoutUrl = data.data.checkout_url;
    if (request.customer?.email) {
      try {
        const urlObj = new URL(checkoutUrl);
        urlObj.searchParams.set("email", request.customer.email);
        urlObj.searchParams.set("customer_email", request.customer.email);
        if (request.customer.name) {
          urlObj.searchParams.set("name", request.customer.name);
          urlObj.searchParams.set("customer_name", request.customer.name);
        }
        checkoutUrl = urlObj.toString();
      } catch (e) {
        // En cas d'erreur de parsing URL, on conserve l'original
      }
    }

    return {
      success: true,
      paymentId: data.data.id || externalRef,
      orderId: request.orderId,
      checkoutUrl,
      provider: this.name,
      status: "pending",
      rawProviderData: data.data,
    };
  }

  async verifyWebhookSignature(rawBody: string, headers: Record<string, string | string[] | undefined>): Promise<boolean> {
    const { secretKey } = await getProviderConfig(this.name);
    const signatureHeader = (headers["x-lomopay-signature"] || headers["X-Lomopay-Signature"]) as string;

    if (!secretKey || !signatureHeader) {
      return false;
    }

    try {
      const hmac = crypto.createHmac("sha256", secretKey).update(rawBody).digest("hex");
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
    const eventType = payload.type;
    const paymentData = payload.data || {};
    const externalReference = paymentData.external_reference || "";
    const lomoTransactionId = paymentData.transaction_id || paymentData.id;
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
    if (eventType === "payment.succeeded" || status === "completed" || status === "success") {
      unifiedEvent = "payment.succeeded";
    } else if (status === "canceled" || status === "cancelled") {
      unifiedEvent = "payment.canceled";
    }

    return {
      event: unifiedEvent,
      appId,
      paymentId: lomoTransactionId || externalReference,
      orderId,
      provider: this.name,
      amount: Number(paymentData.amount || 0),
      currency: paymentData.currency || "XOF",
      customer: {
        email: paymentData.customer_email || paymentData.email,
        name: paymentData.customer_name || paymentData.name,
      },
      providerTransactionId: lomoTransactionId,
      metadata: {
        raw: paymentData,
      },
      timestamp: Date.now(),
    };
  }
}
