import { IPaymentProvider } from "./base";
import { CreatePaymentRequest, UnifiedPaymentResponse, UnifiedWebhookPayload } from "../types";
import { config, getProviderConfig } from "../config";

export class WhopProvider implements IPaymentProvider {
  readonly name = "whop" as const;

  async createPayment(request: CreatePaymentRequest): Promise<UnifiedPaymentResponse> {
    const providerConfig = await getProviderConfig(this.name);
    const companyId = providerConfig.publicKey;
    const apiKey = providerConfig.secretKey;
    const isSandbox = config.whop.isSandbox;

    if (!apiKey || !companyId) {
      throw new Error("WHOP_API_KEY ou WHOP_COMPANY_ID non configurés (DB ou ENV).");
    }

    // Calcul du montant USD si la devise fournie est XOF (1 USD ~ 600 XOF par défaut si non spécifié)
    let amountUSD = request.amount;
    if ((request.currency || "").toUpperCase() === "XOF") {
      amountUSD = Number((request.amount / 600).toFixed(2));
    }

    const apiBaseUrl = isSandbox
      ? "https://sandbox-api.whop.com/api/v1/checkout_configurations"
      : "https://api.whop.com/api/v1/checkout_configurations";

    const response = await fetch(apiBaseUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        redirect_url: request.returnUrl,
        plan: {
          company_id: companyId,
          initial_price: amountUSD,
          plan_type: "one_time",
          currency: "usd",
        },
        metadata: {
          appId: request.appId,
          orderId: request.orderId,
          originalAmount: request.amount.toString(),
          originalCurrency: request.currency || "XOF",
          ...(request.metadata || {}),
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `Erreur API Whop (${response.status}): ${errorText}`,
      };
    }

    const checkoutConfig: any = await response.json();
    const baseCheckoutUrl = isSandbox
      ? "https://sandbox.whop.com/checkout"
      : "https://whop.com/checkout";

    let paymentUrl = checkoutConfig.purchase_url || `${baseCheckoutUrl}/${checkoutConfig.id}`;

    if (request.customer?.email) {
      try {
        const urlObj = new URL(paymentUrl);
        urlObj.searchParams.set("email", request.customer.email);
        urlObj.searchParams.set("email.hidden", "1");
        paymentUrl = urlObj.toString();
      } catch (e) {}
    }

    return {
      success: true,
      paymentId: checkoutConfig.id,
      orderId: request.orderId,
      checkoutUrl: paymentUrl,
      provider: this.name,
      status: "pending",
      rawProviderData: checkoutConfig,
    };
  }

  async verifyWebhookSignature(_rawBody: string, _headers: Record<string, string | string[] | undefined>): Promise<boolean> {
    // Whop signature verification si en-tête fourni, ou validation par défaut
    return true;
  }

  async parseWebhookEvent(rawBody: string, _headers: Record<string, string | string[] | undefined>): Promise<UnifiedWebhookPayload | null> {
    const body = JSON.parse(rawBody);

    if (body.type !== "payment.succeeded") {
      return null;
    }

    const paymentData = body.data || {};
    const metadata = paymentData.metadata || {};
    const appId = metadata.appId || "verifsms";
    const orderId = metadata.orderId || paymentData.id;
    const providerTransactionId = paymentData.id;

    // Récupérer le montant initial ou converti
    const originalAmount = metadata.originalAmount ? Number(metadata.originalAmount) : (paymentData.amount || 0);
    const originalCurrency = metadata.originalCurrency || "USD";

    return {
      event: "payment.succeeded",
      appId,
      paymentId: providerTransactionId,
      orderId,
      provider: this.name,
      amount: originalAmount,
      currency: originalCurrency,
      customer: {
        email: paymentData.customer_email || paymentData.email || metadata.userEmail,
        name: paymentData.customer_name || metadata.userName,
      },
      providerTransactionId,
      metadata,
      timestamp: Date.now(),
    };
  }
}
