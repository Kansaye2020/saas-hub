import { Response } from "express";
import { AuthenticatedRequest } from "../middleware/auth";
import { PaymentService } from "../services/payment.service";
import { providerRegistry } from "../providers";

export class PaymentController {
  /**
   * Endpoint pour initier un paiement depuis un SaaS
   * POST /api/v1/payments/create
   */
  static async create(req: AuthenticatedRequest, res: Response) {
    try {
      const clientApp = req.clientApp!;
      const payload = {
        ...req.body,
        appId: clientApp.id, // Force l'appId authentifiée pour éviter l'usurpation
      };

      const result = await PaymentService.createPayment(payload);

      if (!result.success) {
        return res.status(400).json(result);
      }

      return res.status(200).json(result);
    } catch (err: any) {
      console.error("❌ Erreur dans PaymentController.create:", err);
      return res.status(500).json({
        success: false,
        error: err.message || "Erreur interne lors de la création du paiement",
      });
    }
  }

  /**
   * Liste des passerelles disponibles
   * GET /api/v1/payments/providers
   */
  static async listProviders(_req: AuthenticatedRequest, res: Response) {
    const providers = providerRegistry.getAvailableProviders();
    return res.status(200).json({
      success: true,
      providers,
    });
  }
}
