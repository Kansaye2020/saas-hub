import { z } from "zod";
import { CreatePaymentRequest, PaymentProviderType, UnifiedPaymentResponse } from "../types";
import { providerRegistry } from "../providers";
import { LoggerService } from "./logger.service";
import { SessionService, CheckoutSession } from "./session.service";
import { config, getClientAppById } from "../config";

const CreatePaymentSchema = z.object({
  appId: z.string().min(1, "appId requis"),
  provider: z.enum(["lomopay", "whop", "stripe", "chariow", "auto"]).optional().default("auto"),
  amount: z.number().positive("Le montant doit être supérieur à 0"),
  currency: z.string().optional().default("XOF"),
  description: z.string().optional(),
  orderId: z.string().min(1, "orderId requis"),
  customer: z
    .object({
      email: z.string().email().optional().or(z.literal("")),
      name: z.string().optional(),
      phone: z.string().optional(),
    })
    .optional(),
  returnUrl: z.string().url("returnUrl doit être une URL valide"),
  cancelUrl: z.string().url().optional(),
  metadata: z.record(z.any()).optional(),
});

export class PaymentService {
  /**
   * Crée une session de Checkout SaaS hébergée avec URL unique
   */
  static async createPaymentSession(rawParams: any): Promise<UnifiedPaymentResponse> {
    const parseResult = CreatePaymentSchema.safeParse(rawParams);
    if (!parseResult.success) {
      const errorMsg = parseResult.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join(", ");
      LoggerService.addLog({
        type: "payment_error",
        level: "error",
        title: "Validation session échouée",
        message: errorMsg,
        appId: rawParams?.appId,
        orderId: rawParams?.orderId,
      });
      return {
        success: false,
        error: `Données invalides: ${errorMsg}`,
      };
    }

    const data = parseResult.data;
    const clientApp = getClientAppById(data.appId);

    const session = SessionService.createSession({
      appId: data.appId,
      appName: clientApp?.name || data.appId,
      orderId: data.orderId,
      amount: data.amount,
      currency: data.currency,
      description: data.description || `Commande #${data.orderId}`,
      customer: data.customer,
      returnUrl: data.returnUrl,
      cancelUrl: data.cancelUrl,
      metadata: data.metadata,
      provider: data.provider,
    });

    const checkoutUrl = `${config.baseUrl}/checkout/${session.id}`;

    LoggerService.addLog({
      type: "payment_created",
      level: "success",
      title: `Checkout Session créée (${session.appName})`,
      appId: session.appId,
      orderId: session.orderId,
      amount: session.amount,
      currency: session.currency,
      message: `URL: ${checkoutUrl}`,
      details: session,
    });

    return {
      success: true,
      paymentId: session.id,
      orderId: session.orderId,
      checkoutUrl,
      status: "pending",
    };
  }

  /**
   * Exécute le paiement auprès du processeur choisi depuis la page de checkout
   */
  static async processCheckoutPayment(sessionId: string, chosenProvider?: PaymentProviderType, customerInfo?: any): Promise<{
    success: boolean;
    redirectUrl?: string;
    error?: string;
  }> {
    const session = SessionService.getSession(sessionId);
    if (!session) {
      return { success: false, error: "Session de paiement introuvable ou expirée" };
    }

    if (session.status === "completed") {
      return { success: true, redirectUrl: session.returnUrl };
    }

    // Déterminer la passerelle
    let targetProvider: PaymentProviderType;
    if (chosenProvider && chosenProvider !== ("auto" as any)) {
      targetProvider = chosenProvider;
    } else if (session.preferredProvider && session.preferredProvider !== "auto") {
      targetProvider = session.preferredProvider;
    } else {
      const cur = session.currency.toUpperCase();
      targetProvider = (cur === "XOF" || cur === "XAF") ? "lomopay" : "whop";
    }

    const providerInstance = providerRegistry.getProvider(targetProvider);

    const customer = {
      ...(session.customer || {}),
      ...(customerInfo || {}),
    };

    const request: CreatePaymentRequest = {
      appId: session.appId,
      provider: targetProvider,
      amount: session.amount,
      currency: session.currency,
      description: session.description,
      orderId: session.orderId,
      customer,
      returnUrl: `${config.baseUrl}/checkout/${session.id}/return`,
      cancelUrl: session.cancelUrl || session.returnUrl,
      metadata: {
        ...(session.metadata || {}),
        sessionId: session.id,
      },
    };

    try {
      const providerRes = await providerInstance.createPayment(request);

      if (!providerRes.success || !providerRes.checkoutUrl) {
        return {
          success: false,
          error: providerRes.error || "Impossible d'initialiser le paiement avec ce processeur",
        };
      }

      SessionService.updateSession(session.id, {
        provider: targetProvider,
        providerPaymentId: providerRes.paymentId,
        providerRedirectUrl: providerRes.checkoutUrl,
        customer,
      });

      return {
        success: true,
        redirectUrl: providerRes.checkoutUrl,
      };
    } catch (err: any) {
      console.error(`Erreur lors du traitement checkout [${targetProvider}]:`, err);
      return {
        success: false,
        error: err.message || "Erreur interne du processeur de paiement",
      };
    }
  }
}
