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

  /**
   * Effectuer un retrait H2H iKeePay (Payout)
   * POST /api/v1/payments/ikeepay/payout
   */
  static async ikeepayPayout(req: AuthenticatedRequest, res: Response) {
    try {
      const clientApp = req.clientApp!;
      const ikeepay = providerRegistry.getProvider("ikeepay") as any;
      const result = await ikeepay.createPayout(clientApp.id, req.body);
      return res.status(200).json({ success: true, data: result });
    } catch (err: any) {
      console.error("❌ Erreur dans PaymentController.ikeepayPayout:", err);
      return res.status(500).json({
        success: false,
        error: err.message || "Erreur lors du payout iKeePay",
      });
    }
  }

  /**
   * Actions Cartes Virtuelles iKeeCard (create-card, get-details, fund-withdraw, delete-card)
   * POST /api/v1/payments/ikeepay/card
   */
  static async ikeepayCardAction(req: AuthenticatedRequest, res: Response) {
    try {
      const clientApp = req.clientApp!;
      const { action, payload, isSandbox } = req.body;

      if (!action) {
        return res.status(400).json({ success: false, error: "Le champ 'action' est requis (create-card, get-details, fund-withdraw, delete-card)" });
      }

      const ikeepay = providerRegistry.getProvider("ikeepay") as any;
      const result = await ikeepay.cardAction(clientApp.id, action, payload || req.body, isSandbox);
      return res.status(200).json({ success: true, data: result });
    } catch (err: any) {
      console.error("❌ Erreur dans PaymentController.ikeepayCardAction:", err);
      return res.status(500).json({
        success: false,
        error: err.message || "Erreur lors de l'action carte iKeePay",
      });
    }
  }
}
