import { Request, Response } from "express";
import { providerRegistry } from "../providers";
import { PaymentProviderType } from "../types";
import { WebhookDispatcherService } from "../services/webhook-dispatcher.service";

export class WebhookController {
  /**
   * Réception et traitement générique des webhooks provenant des passerelles
   * POST /webhooks/:provider
   */
  static async handleProviderWebhook(req: Request, res: Response) {
    const providerName = req.params.provider as PaymentProviderType;

    try {
      const provider = providerRegistry.getProvider(providerName);

      // Récupérer le rawBody capturé par le middleware Express
      const rawBody = (req as any).rawBody || JSON.stringify(req.body);

      // 1. Vérification de signature
      const isValid = await provider.verifyWebhookSignature(rawBody, req.headers);
      if (!isValid) {
        console.warn(`⚠️ Signature webhook invalide pour la passerelle [${providerName}]`);
        return res.status(401).json({ error: "Invalid provider signature" });
      }

      // 2. Transformation en événement unifié
      const unifiedEvent = await provider.parseWebhookEvent(rawBody, req.headers);

      if (!unifiedEvent) {
        console.log(`ℹ️ Événement [${providerName}] ignoré ou non pertinent.`);
        return res.status(200).json({ received: true, ignored: true });
      }

      console.log(
        `🔔 Webhook unifié généré: [${unifiedEvent.event}] pour l'application [${unifiedEvent.appId}] - Montant: ${unifiedEvent.amount} ${unifiedEvent.currency}`
      );

      // 3. Update transaction status in DB
      try {
        const { dbRun } = require("../database/db");
        let newStatus = 'pending';
        if (unifiedEvent.event === 'payment.succeeded') newStatus = 'succeeded';
        if (unifiedEvent.event === 'payment.failed') newStatus = 'failed';
        
        await dbRun("UPDATE transactions SET status = ? WHERE id = ?", [newStatus, unifiedEvent.paymentId]);
        
        // Also update checkout_sessions if it's tied to one (using orderId as proxy, or we can just update all sessions with this orderId)
        await dbRun("UPDATE checkout_sessions SET status = ? WHERE orderId = ?", [newStatus, unifiedEvent.orderId]);
      } catch (dbErr) {
        console.error("Failed to update transaction status in DB:", dbErr);
      }

      // 4. Dispatch vers le SaaS client en arrière-plan
      WebhookDispatcherService.dispatchToClientApp(unifiedEvent).catch((err) => {
        console.error("Erreur asynchrone lors du dispatch du webhook:", err);
      });

      // 4. Réponse immédiate 200 OK à la passerelle de paiement
      return res.status(200).json({ received: true, success: true });
    } catch (err: any) {
      console.error(`❌ Erreur webhook [${providerName}]:`, err);
      return res.status(500).json({ error: "Internal webhook processing error" });
    }
  }
}
