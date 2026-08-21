import { z } from "zod";
import { CreatePaymentRequest, PaymentProviderType, UnifiedPaymentResponse } from "../types";
import { providerRegistry } from "../providers";
import { LoggerService } from "./logger.service";

const CreatePaymentSchema = z.object({
  appId: z.string().min(1, "appId requis"),
  provider: z.enum(["lomopay", "whop", "stripe", "chariow", "auto"]),
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
      LoggerService.addLog({
        type: "payment_error",
        level: "error",
        title: "Validation de paiement échouée",
        message: errorMsg,
        appId: rawParams?.appId,
        orderId: rawParams?.orderId,
        details: rawParams,
      });
      return {
        success: false,
        error: `Données invalides: ${errorMsg}`,
      };
    }

    const data = parseResult.data;

    // Détermination automatique du provider si 'auto'
    let targetProvider: PaymentProviderType;
    if (data.provider === "auto") {
      const cur = (data.currency || "XOF").toUpperCase();
      if (cur === "XOF" || cur === "XAF") {
        targetProvider = "lomopay";
      } else {
        targetProvider = "whop";
      }
    } else {
      targetProvider = data.provider;
    }

    const providerInstance = providerRegistry.getProvider(targetProvider);
    
    const request: CreatePaymentRequest = {
      ...data,
      provider: targetProvider,
    };

    try {
      const response = await providerInstance.createPayment(request);

      if (response.success) {
        LoggerService.addLog({
          type: "payment_created",
          level: "success",
          title: `Paiement créé [${targetProvider.toUpperCase()}]`,
          appId: data.appId,
          provider: targetProvider,
          orderId: data.orderId,
          amount: data.amount,
          currency: data.currency || "XOF",
          message: `Lien: ${response.checkoutUrl}`,
          details: response,
        });
      } else {
        LoggerService.addLog({
          type: "payment_error",
          level: "warn",
          title: `Échec création paiement [${targetProvider.toUpperCase()}]`,
          appId: data.appId,
          provider: targetProvider,
          orderId: data.orderId,
          message: response.error,
          details: response,
        });
      }

      return response;
    } catch (err: any) {
      LoggerService.addLog({
        type: "payment_error",
        level: "error",
        title: `Exception paiement [${targetProvider.toUpperCase()}]`,
        appId: data.appId,
        provider: targetProvider,
        orderId: data.orderId,
        message: err.message,
        details: err.stack,
      });
      throw err;
    }
  }
}
