import { Request, Response } from "express";
import { providerRegistry } from "../providers";
import { PaymentProviderType } from "../types";
import { WebhookDispatcherService } from "../services/webhook-dispatcher.service";
import { LoggerService } from "../services/logger.service";

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
      const isValid = provider.verifyWebhookSignature(rawBody, req.headers);
      if (!isValid) {
        console.warn(`⚠️ Signature webhook invalide pour la passerelle [${providerName}]`);
        LoggerService.addLog({
          type: "webhook_in",
          level: "warn",
          title: `Signature invalide [${providerName.toUpperCase()}]`,
          provider: providerName,
          message: "La signature du webhook reçu de la passerelle est incorrecte.",
          details: { headers: req.headers, body: req.body },
        });
        return res.status(401).json({ error: "Invalid provider signature" });
      }

      // 2. Transformation en événement unifié
      const unifiedEvent = await provider.parseWebhookEvent(rawBody, req.headers);

      if (!unifiedEvent) {
        console.log(`ℹ️ Événement [${providerName}] ignoré ou non pertinent.`);
        LoggerService.addLog({
          type: "webhook_in",
          level: "info",
          title: `Webhook ignoré [${providerName.toUpperCase()}]`,
          provider: providerName,
          message: "Événement non traitable ou non pertinent.",
          details: req.body,
        });
        return res.status(200).json({ received: true, ignored: true });
      }

      console.log(
        `🔔 Webhook unifié généré: [${unifiedEvent.event}] pour l'application [${unifiedEvent.appId}] - Montant: ${unifiedEvent.amount} ${unifiedEvent.currency}`
      );

      LoggerService.addLog({
        type: "webhook_in",
        level: "success",
        title: `Webhook reçu [${providerName.toUpperCase()}] : ${unifiedEvent.event}`,
        appId: unifiedEvent.appId,
        provider: providerName,
        orderId: unifiedEvent.orderId,
        amount: unifiedEvent.amount,
        currency: unifiedEvent.currency,
        message: `ID Transaction: ${unifiedEvent.providerTransactionId || unifiedEvent.paymentId}`,
        details: unifiedEvent,
      });

      // 3. Dispatch vers le SaaS client en arrière-plan
      WebhookDispatcherService.dispatchToClientApp(unifiedEvent).catch((err) => {
        console.error("Erreur asynchrone lors du dispatch du webhook:", err);
      });

      // 4. Réponse immédiate 200 OK à la passerelle de paiement
      return res.status(200).json({ received: true, success: true });
    } catch (err: any) {
      console.error(`❌ Erreur webhook [${providerName}]:`, err);
      LoggerService.addLog({
        type: "webhook_in",
        level: "error",
        title: `Erreur traitement webhook [${providerName.toUpperCase()}]`,
        provider: providerName,
        message: err.message,
        details: err.stack,
      });
      return res.status(500).json({ error: "Internal webhook processing error" });
    }
  }
}
