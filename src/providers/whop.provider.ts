import { IPaymentProvider } from "./base";
import { CreatePaymentRequest, UnifiedPaymentResponse, UnifiedWebhookPayload } from "../types";
import { config, getAppProviderConfig } from "../config";

export class WhopProvider implements IPaymentProvider {
  readonly name = "whop" as const;

  async createPayment(request: CreatePaymentRequest): Promise<UnifiedPaymentResponse> {
    const providerConfig = await getAppProviderConfig(request.appId, this.name);
    const companyId = providerConfig.publicKey;
    const apiKey = providerConfig.secretKey;
    const isSandbox = config.whop.isSandbox;

    if (!apiKey || !companyId) {
      return {
        success: false,
        error: `Whop : Company ID ou API Key non configurés pour le site "${request.appId}". Veuillez les renseigner dans l'onglet Processeurs de ce site.`
      };
    }

    // Normalisation de la devise et conversion USD si nécessaire
    let currency = (request.currency || "XOF").toUpperCase();
    if (currency === "FCFA" || currency === "CFA") currency = "XOF";

    let amountUSD = Number(request.amount);
    if (currency === "XOF" || currency === "XAF") {
      amountUSD = Math.max(1, Number((request.amount / 600).toFixed(2)));
    } else if (currency === "EUR") {
      amountUSD = Number((request.amount * 1.08).toFixed(2));
    }

    const apiBaseUrl = isSandbox
      ? "https://sandbox-api.whop.com/api/v1/checkout_configurations"
      : "https://api.whop.com/api/v1/checkout_configurations";

    const customerEmail = request.customer?.email || (request as any).customerEmail || (request as any).email;
    const customerName = request.customer?.name || (request as any).customerName || (request as any).name;

    try {
      console.log(`[Whop] Envoi de la requête pour ${request.appId}: ${amountUSD} USD (Client: ${customerEmail || 'anonyme'})`);

      const whopPayload: any = {
        redirect_url: request.returnUrl,
        plan: {
          company_id: companyId.trim(),
          initial_price: amountUSD,
          plan_type: "one_time",
          currency: "usd",
        },
        metadata: {
          appId: request.appId,
          orderId: request.orderId,
          customerEmail: customerEmail || "",
          customerName: customerName || "",
          email: customerEmail || "",
          name: customerName || "",
          originalAmount: request.amount.toString(),
          originalCurrency: request.currency || "XOF",
          ...(request.metadata || {}),
        },
      };

      if (customerEmail) {
        whopPayload.email = customerEmail;
        whopPayload.customer_email = customerEmail;
        whopPayload.customer = {
          email: customerEmail,
          name: customerName || undefined,
        };
      }

      const response = await fetch(apiBaseUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey.trim()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(whopPayload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("[Whop] Erreur API:", response.status, errorText);
        return {
          success: false,
          error: `Erreur API Whop (${response.status}): ${errorText.substring(0, 200)}`,
        };
      }

      const checkoutConfig: any = await response.json();
      const baseCheckoutUrl = isSandbox
        ? "https://sandbox.whop.com/checkout"
        : "https://whop.com/checkout";

      let paymentUrl = checkoutConfig.purchase_url || checkoutConfig.url || `${baseCheckoutUrl}/${checkoutConfig.id}`;

      // Pré-remplissage de l'email et du nom dans l'URL de checkout Whop
      if (customerEmail) {
        const separator = paymentUrl.includes("?") ? "&" : "?";
        paymentUrl += `${separator}email=${encodeURIComponent(customerEmail)}`;
        if (customerName) {
          paymentUrl += `&name=${encodeURIComponent(customerName)}`;
        }
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
    } catch (networkError: any) {
      console.error("[Whop] Erreur réseau / API:", networkError);
      return {
        success: false,
        error: `Erreur de connexion à l'API Whop: ${networkError.message || networkError}`
      };
    }
  }

  async verifyWebhookSignature(_rawBody: string, _headers: Record<string, string | string[] | undefined>): Promise<boolean> {
    return true;
  }

  async parseWebhookEvent(rawBody: string, _headers: Record<string, string | string[] | undefined>): Promise<UnifiedWebhookPayload | null> {
    const body = JSON.parse(rawBody);

    if (body.type !== "payment.succeeded" && body.action !== "payment.succeeded") {
      return null;
    }

    const paymentData = body.data || body;
    const metadata = paymentData.metadata || {};
    const appId = metadata.appId || "verifsms";
    const orderId = metadata.orderId || paymentData.id;
    const providerTransactionId = paymentData.id;

    const originalAmount = metadata.originalAmount ? Number(metadata.originalAmount) : (paymentData.amount || 0);
    const originalCurrency = metadata.originalCurrency || "USD";

    const user = paymentData.user || paymentData.customer || {};
    const member = paymentData.member || {};

    const customerEmail = 
      paymentData.customer_email ||
      paymentData.email ||
      user.email ||
      member.email ||
      metadata.customerEmail ||
      metadata.email ||
      metadata.userEmail ||
      undefined;

    const customerName =
      paymentData.customer_name ||
      paymentData.name ||
      user.name ||
      user.username ||
      member.name ||
      metadata.customerName ||
      metadata.name ||
      metadata.userName ||
      undefined;

    return {
      event: "payment.succeeded",
      appId,
      paymentId: providerTransactionId,
      orderId,
      provider: this.name,
      amount: originalAmount,
      currency: originalCurrency,
      customer: {
        email: customerEmail,
        name: customerName,
      },
      providerTransactionId,
      metadata,
      timestamp: Date.now(),
    };
  }
}
