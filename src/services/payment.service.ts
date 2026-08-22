import { z } from "zod";
import { CreatePaymentRequest, PaymentProviderType, UnifiedPaymentResponse } from "../types";
import { providerRegistry } from "../providers";
import { getAppActiveProvider } from "../config";

const CreatePaymentSchema = z.object({
  appId: z.string().min(1, "appId requis"),
  provider: z.enum(["lomopay", "whop", "stripe", "chariow", "ikeepay", "auto"]),
  amount: z.number().positive("Le montant doit être supérieur à 0"),
  currency: z.string().nullish(),
  description: z.string().nullish(),
  orderId: z.string().min(1, "orderId requis"),
  customer: z
    .object({
      email: z.string().nullish().or(z.literal("")),
      name: z.string().nullish().or(z.literal("")),
      phone: z.string().nullish().or(z.literal("")),
    })
    .nullish(),
  returnUrl: z.string().min(1, "returnUrl requis"),
  cancelUrl: z.string().nullish(),
  metadata: z.record(z.any()).nullish(),
});

export class PaymentService {
  /**
   * Valide et initialise un paiement auprès de la passerelle appropriée
   */
  static async createPayment(rawParams: any): Promise<UnifiedPaymentResponse> {
    // Nettoyer les valeurs null pour éviter les erreurs de type strictes
    const sanitizedParams = {
      ...rawParams,
      amount: Number(rawParams?.amount),
      currency: rawParams?.currency || "XOF",
      description: rawParams?.description || undefined,
      returnUrl: rawParams?.returnUrl || undefined,
      cancelUrl: rawParams?.cancelUrl || undefined,
      customer: rawParams?.customer
        ? {
            email: rawParams.customer.email || undefined,
            name: rawParams.customer.name || undefined,
            phone: rawParams.customer.phone || undefined,
          }
        : undefined,
      metadata: rawParams?.metadata || undefined,
    };

    const parseResult = CreatePaymentSchema.safeParse(sanitizedParams);
    if (!parseResult.success) {
      const errorMsg = parseResult.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join(", ");
      return {
        success: false,
        error: `Données invalides: ${errorMsg}`,
      };
    }

    const data = parseResult.data;

    // Détermination automatique du provider si 'auto'
    let targetProvider: PaymentProviderType;
    if (data.provider === "auto") {
      const active = await getAppActiveProvider(data.appId);
      if (active && active.providerId) {
        targetProvider = active.providerId as PaymentProviderType;
      } else {
        const cur = (data.currency || "XOF").toUpperCase();
        if (cur === "XOF" || cur === "XAF" || cur === "FCFA" || cur === "CFA") {
          targetProvider = "lomopay";
        } else {
          targetProvider = "whop";
        }
      }
    } else {
      targetProvider = data.provider;
    }

    const providerInstance = providerRegistry.getProvider(targetProvider);
    
    const request: CreatePaymentRequest = {
      appId: data.appId,
      provider: targetProvider,
      amount: data.amount,
      currency: data.currency || "XOF",
      description: data.description || undefined,
      orderId: data.orderId,
      customer: {
        email: data.customer?.email || undefined,
        name: data.customer?.name || undefined,
        phone: data.customer?.phone || undefined,
      },
      returnUrl: data.returnUrl,
      cancelUrl: data.cancelUrl || undefined,
      metadata: data.metadata || undefined,
    };

    const response = await providerInstance.createPayment(request);

    if (response.success && response.paymentId) {
      try {
        const { dbRun } = require("../database/db");
        await dbRun(
          "INSERT INTO transactions (id, appId, provider, amount, currency, status, orderId) VALUES (?, ?, ?, ?, ?, ?, ?)",
          [response.paymentId, data.appId, targetProvider, data.amount, data.currency || "XOF", "pending", data.orderId]
        );
      } catch (err) {
        console.error("Failed to record transaction in DB:", err);
      }
    }

    return response;
  }
}
