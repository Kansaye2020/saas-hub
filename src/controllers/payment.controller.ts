import { Request, Response } from "express";
import { AuthenticatedRequest } from "../middleware/auth";
import { PaymentService } from "../services/payment.service";
import { SessionService } from "../services/session.service";
import { providerRegistry } from "../providers";
import { config } from "../config";

export class PaymentController {
  /**
   * Endpoint appelé par un SaaS pour générer une URL de Checkout hébergée
   * POST /api/v1/payments/create
   */
  static async create(req: AuthenticatedRequest, res: Response) {
    try {
      const clientApp = req.clientApp!;
      const payload = {
        ...req.body,
        appId: clientApp.id, // Forcé pour sécurité
      };

      const result = await PaymentService.createPaymentSession(payload);

      if (!result.success) {
        return res.status(400).json(result);
      }

      return res.status(200).json(result);
    } catch (err: any) {
      console.error("❌ Erreur dans PaymentController.create:", err);
      return res.status(500).json({
        success: false,
        error: err.message || "Erreur lors de la création de la session de paiement",
      });
    }
  }

  /**
   * Récupère les détails publics d'une session de Checkout (pour affichage de la page)
   * GET /api/v1/checkout/:id
   */
  static async getCheckoutSession(req: Request, res: Response) {
    const { id } = req.params;
    const session = SessionService.getSession(id);

    if (!session) {
      return res.status(404).json({ success: false, error: "Session de paiement introuvable" });
    }

    return res.status(200).json({
      success: true,
      session: {
        id: session.id,
        appName: session.appName,
        orderId: session.orderId,
        amount: session.amount,
        currency: session.currency,
        description: session.description,
        customer: session.customer,
        status: session.status,
        preferredProvider: session.preferredProvider,
        returnUrl: session.returnUrl,
      },
      gateways: {
        lomopay: Boolean(config.lomopay.publicKey && config.lomopay.secretKey),
        whop: Boolean(config.whop.apiKey && config.whop.companyId),
        stripe: Boolean(config.stripe.secretKey),
        chariow: Boolean(config.chariow.secretKey),
      },
    });
  }

  /**
   * Lance le paiement sur le processeur sélectionné par le client
   * POST /api/v1/checkout/:id/pay
   */
  static async processPayment(req: Request, res: Response) {
    const { id } = req.params;
    const { provider, customer } = req.body;

    const result = await PaymentService.processCheckoutPayment(id, provider, customer);

    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.status(200).json(result);
  }

  /**
   * Page / URL de retour après paiement auprès du processeur
   * GET /checkout/:id/return
   */
  static async handleCheckoutReturn(req: Request, res: Response) {
    const { id } = req.params;
    const session = SessionService.getSession(id);

    if (!session) {
      return res.redirect("/");
    }

    // Redirige vers le returnUrl configuré par le SaaS client
    const target = new URL(session.returnUrl);
    target.searchParams.set("orderId", session.orderId);
    target.searchParams.set("paymentId", session.id);
    target.searchParams.set("status", session.status === "completed" ? "success" : "pending");

    return res.redirect(target.toString());
  }

  /**
   * Liste des passerelles disponibles
   * GET /api/v1/payments/providers
   */
  static async listProviders(_req: Request, res: Response) {
    const providers = providerRegistry.getAvailableProviders();
    return res.status(200).json({
      success: true,
      providers,
    });
  }
}
