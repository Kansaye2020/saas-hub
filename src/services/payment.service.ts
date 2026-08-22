import { z } from "zod";
import { CreatePaymentRequest, PaymentProviderType, UnifiedPaymentResponse } from "../types";
import { providerRegistry } from "../providers";
import { getAppActiveProvider } from "../config";

const CreatePaymentSchema = z.object({
  appId: z.string().min(1, "appId requis"),
  provider: z.enum(["lomopay", "whop", "stripe", "chariow", "ikeepay", "auto"]),
  amount: z.number().positive("Le montant doit être supérieur à 0"),
  currency: z.string().optional(),
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
   * Valide et initialise un paiement auprès de la passerelle appropriée
   */
  static async createPayment(rawParams: any): Promise<UnifiedPaymentResponse> {
    const parseResult = CreatePaymentSchema.safeParse(rawParams);
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
        if (cur === "XOF" || cur === "XAF") {
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
      ...data,
      provider: targetProvider,
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
