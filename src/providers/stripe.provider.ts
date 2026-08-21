import Stripe from "stripe";
import { IPaymentProvider } from "./base";
import { CreatePaymentRequest, UnifiedPaymentResponse, UnifiedWebhookPayload } from "../types";
import { config } from "../config";

export class StripeProvider implements IPaymentProvider {
  readonly name = "stripe" as const;
  private stripeClient: Stripe | null = null;

  constructor() {
    if (config.stripe.secretKey) {
      this.stripeClient = new Stripe(config.stripe.secretKey, {
        apiVersion: "2024-06-20",
      });
    }
  }

  async createPayment(request: CreatePaymentRequest): Promise<UnifiedPaymentResponse> {
    if (!this.stripeClient) {
      throw new Error("STRIPE_SECRET_KEY non configuré.");
    }

    const currency = (request.currency || "EUR").toLowerCase();
    // Stripe requiert les montants en centimes pour EUR / USD
    const unitAmount = Math.round(request.amount * 100);

    const session = await this.stripeClient.checkout.sessions.create({
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
      customer_email: request.customer?.email,
      metadata: {
        appId: request.appId,
        orderId: request.orderId,
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
  }

  verifyWebhookSignature(rawBody: string, headers: Record<string, string | string[] | undefined>): boolean {
    if (!this.stripeClient || !config.stripe.webhookSecret) {
      return false;
    }

    const signature = (headers["stripe-signature"] || headers["Stripe-Signature"]) as string;
    if (!signature) return false;

    try {
      this.stripeClient.webhooks.constructEvent(
        rawBody,
        signature,
        config.stripe.webhookSecret
      );
      return true;
    } catch (err) {
      console.error("Erreur vérification signature Stripe:", err);
      return false;
    }
  }

  async parseWebhookEvent(rawBody: string, headers: Record<string, string | string[] | undefined>): Promise<UnifiedWebhookPayload | null> {
    if (!this.stripeClient || !config.stripe.webhookSecret) {
      return null;
    }

    const signature = (headers["stripe-signature"] || headers["Stripe-Signature"]) as string;
    const event = this.stripeClient.webhooks.constructEvent(
      rawBody,
      signature,
      config.stripe.webhookSecret
    );

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const metadata = session.metadata || {};
      const appId = metadata.appId || "verifsms";
      const orderId = metadata.orderId || session.id;

      return {
        event: "payment.succeeded",
        appId,
        paymentId: session.id,
        orderId,
        provider: this.name,
        amount: session.amount_total ? session.amount_total / 100 : 0,
        currency: (session.currency || "EUR").toUpperCase(),
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
