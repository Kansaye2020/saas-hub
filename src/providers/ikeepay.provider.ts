import { IPaymentProvider } from "./base";
import { CreatePaymentRequest, UnifiedPaymentResponse, UnifiedWebhookPayload } from "../types";
import { getAppProviderConfig } from "../config";

export class iKeepayProvider implements IPaymentProvider {
  readonly name = "ikeepay" as const;

  async createPayment(request: CreatePaymentRequest): Promise<UnifiedPaymentResponse> {
    const config = await getAppProviderConfig(request.appId, this.name);
    
    if (!config.publicKey || !config.secretKey) {
      throw new Error(`iKeepay clés non configurées pour le site ${request.appId}.`);
    }

    // TODO: Implémenter l'appel réel à l'API iKeepay
    // En attente de la documentation technique officielle.
    // Voici une structure d'exemple
    
    /*
    const response = await fetch("https://api.ikeepay.com/v1/payments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${config.secretKey}`
      },
      body: JSON.stringify({
        amount: request.amount,
        currency: request.currency || "XAF",
        order_id: request.orderId,
        return_url: request.returnUrl,
        customer_email: request.customer?.email,
      })
    });
    const data = await response.json();
    */

    // Simulation de réponse pour le moment
    const fakePaymentId = `ikp_${Date.now()}`;
    const checkoutUrl = `https://checkout.ikeepay.com/pay/${fakePaymentId}?appId=${request.appId}`;

    return {
      success: true,
      paymentId: fakePaymentId,
      orderId: request.orderId,
      checkoutUrl,
      provider: this.name,
      status: "pending",
    };
  }

  async verifyWebhookSignature(rawBody: string, headers: Record<string, string | string[] | undefined>): Promise<boolean> {
    // TODO: Implémenter la vérification de signature iKeepay
    // Ex: const config = await getProviderConfig(this.name);
    // crypto.createHmac...
    return true;
  }

  async parseWebhookEvent(rawBody: string, _headers: Record<string, string | string[] | undefined>): Promise<UnifiedWebhookPayload | null> {
    const body = JSON.parse(rawBody);

    // TODO: Adapter selon le format réel du Webhook de iKeepay
    const isSuccess = body.status === "SUCCESS" || body.status === "completed";
    const transactionId = body.transaction_id || body.id;

    return {
      event: isSuccess ? "payment.succeeded" : "payment.failed",
      appId: body.app_id || "verifsms",
      paymentId: transactionId,
      orderId: body.order_id || transactionId,
      provider: this.name,
      amount: Number(body.amount || 0),
      currency: body.currency || "XAF",
      customer: {
        email: body.customer_email,
        name: body.customer_name,
      },
      providerTransactionId: transactionId,
      metadata: body,
      timestamp: Date.now(),
    };
  }
}
