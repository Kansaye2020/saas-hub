import Stripe from "stripe";
import { IPaymentProvider } from "./base";
import { CreatePaymentRequest, UnifiedPaymentResponse, UnifiedWebhookPayload } from "../types";
import { config, getAppProviderConfig } from "../config";

export class StripeProvider implements IPaymentProvider {
  readonly name = "stripe" as const;

  private async getStripeClient(appId: string): Promise<{ client: Stripe; webhookSecret?: string }> {
    const providerConfig = await getAppProviderConfig(appId, this.name);
    const secretKey = providerConfig.secretKey || config.stripe.secretKey;
    let webhookSecret = config.stripe.webhookSecret;

    if (providerConfig.extraConfig) {
      if (typeof providerConfig.extraConfig === "string") {
        webhookSecret = providerConfig.extraConfig;
      } else if (providerConfig.extraConfig.webhookSecret) {
        webhookSecret = providerConfig.extraConfig.webhookSecret;
      }
    }

    if (!secretKey) {
      throw new Error(`Stripe : Secret Key non configurée pour le site "${appId}". Veuillez la renseigner dans l'onglet Processeurs de ce site.`);
    }

    const client = new Stripe(secretKey.trim(), {
      apiVersion: "2024-06-20",
    });

    return { client, webhookSecret };
  }

  async createPayment(request: CreatePaymentRequest): Promise<UnifiedPaymentResponse> {
    try {
      const { client } = await this.getStripeClient(request.appId);

      let currency = (request.currency || "EUR").toLowerCase();
      let unitAmount = Math.round(Number(request.amount) * 100);

      // Conversion FCFA / XOF vers EUR pour Stripe si nécessaire
      if (currency === "fcfa" || currency === "cfa" || currency === "xof" || currency === "xaf") {
        currency = "eur";
        unitAmount = Math.max(50, Math.round((Number(request.amount) / 655.957) * 100)); // Min 50 centimes EUR
      }

      console.log(`[Stripe] Création checkout session pour ${request.appId}: ${unitAmount / 100} ${currency}`);

      const session = await client.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency,
              product_data: {
                name: request.description || `Commande #${request.orderId}`,
              },
              unit_amount: unitAmount,
            },
            quantity: 1,
          },
        ],
        mode: "payment",
        success_url: request.returnUrl,
        cancel_url: request.cancelUrl || request.returnUrl,
        customer_email: request.customer?.email || undefined,
        metadata: {
          appId: request.appId,
          orderId: request.orderId,
          originalAmount: request.amount.toString(),
          originalCurrency: request.currency || "XOF",
          ...(request.metadata || {}),
        },
      });

      return {
        success: true,
        paymentId: session.id,
        orderId: request.orderId,
        checkoutUrl: session.url || undefined,
        provider: this.name,
        status: "pending",
        rawProviderData: session,
      };
    } catch (error: any) {
      console.error("[Stripe] Erreur initialisation paiement:", error);
      return {
        success: false,
        error: `Erreur Stripe: ${error.message || error}`
      };
    }
  }

  async verifyWebhookSignature(rawBody: string, headers: Record<string, string | string[] | undefined>): Promise<boolean> {
    const signature = (headers["stripe-signature"] || headers["Stripe-Signature"]) as string;
    if (!signature) return false;

    let appId = "verifsms";
    try {
      const parsed = JSON.parse(rawBody);
      appId = parsed.data?.object?.metadata?.appId || "verifsms";
    } catch {}

    try {
      const { client, webhookSecret } = await this.getStripeClient(appId);
      if (!webhookSecret) return true; // Si pas de webhook secret configuré, bypasser

      client.webhooks.constructEvent(
        rawBody,
        signature,
        webhookSecret
      );
      return true;
    } catch (err) {
      console.error("Erreur vérification signature Stripe:", err);
      return false;
    }
  }

  async parseWebhookEvent(rawBody: string, _headers: Record<string, string | string[] | undefined>): Promise<UnifiedWebhookPayload | null> {
    let parsed: any;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      return null;
    }

    const eventType = parsed.type;
    if (eventType === "checkout.session.completed") {
      const session = parsed.data?.object as Stripe.Checkout.Session;
      const metadata = session.metadata || {};
      const appId = metadata.appId || "verifsms";
      const orderId = metadata.orderId || session.id;

      const originalAmount = metadata.originalAmount ? Number(metadata.originalAmount) : (session.amount_total ? session.amount_total / 100 : 0);
      const originalCurrency = metadata.originalCurrency || (session.currency || "EUR").toUpperCase();

      return {
        event: "payment.succeeded",
        appId,
        paymentId: session.id,
        orderId,
        provider: this.name,
        amount: originalAmount,
        currency: originalCurrency,
        customer: {
          email: session.customer_details?.email || session.customer_email || undefined,
          name: session.customer_details?.name || undefined,
        },
        providerTransactionId: (session.payment_intent as string) || session.id,
        metadata,
        timestamp: Date.now(),
      };
    }

    return null;
  }
}
