import { UnifiedWebhookPayload } from "../types";
import { getClientAppById } from "../config";
import { SignatureService } from "./signature.service";
import { LoggerService } from "./logger.service";

export class WebhookDispatcherService {
  /**
   * Transmet l'événement unifié au SaaS concerné avec signature cryptographique
   */
  static async dispatchToClientApp(event: UnifiedWebhookPayload): Promise<boolean> {
    const app = getClientAppById(event.appId);

    if (!app) {
      console.warn(`⚠️ Application SaaS inconnue "${event.appId}". Impossible de dispatcher le webhook.`);
      LoggerService.addLog({
        type: "webhook_out",
        level: "error",
        title: `Dispatch impossible: App "${event.appId}" inconnue`,
        appId: event.appId,
        provider: event.provider,
        orderId: event.orderId,
        amount: event.amount,
        currency: event.currency,
        message: "Application non trouvée dans la configuration",
        details: event,
      });
      return false;
    }

    if (!app.webhookUrl) {
      console.warn(`⚠️ Aucune URL de webhook configurée pour l'application "${event.appId}".`);
      LoggerService.addLog({
        type: "webhook_out",
        level: "warn",
        title: `Webhook ignoré: pas d'URL pour "${app.name}"`,
        appId: app.id,
        provider: event.provider,
        orderId: event.orderId,
        amount: event.amount,
        currency: event.currency,
        details: event,
      });
      return false;
    }

    const payloadString = JSON.stringify(event);
    const signature = SignatureService.signPayload(payloadString, app.webhookSecret);

    console.log(`📡 Envoi du webhook [${event.event}] vers ${app.name} (${app.webhookUrl})...`);

    try {
      const response = await fetch(app.webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Hub-Signature": signature,
          "X-Hub-App-Id": app.id,
          "User-Agent": "SaaS-Payment-Hub/1.0",
        },
        body: payloadString,
      });

      const responseText = await response.text();

      if (!response.ok) {
        console.error(`❌ Échec webhook SaaS ${app.name} (${response.status}): ${responseText}`);
        LoggerService.addLog({
          type: "webhook_out",
          level: "error",
          title: `Échec webhook vers ${app.name} (HTTP ${response.status})`,
          appId: app.id,
          provider: event.provider,
          orderId: event.orderId,
          amount: event.amount,
          currency: event.currency,
          message: responseText.slice(0, 300),
          details: { event, status: response.status, response: responseText },
        });
        return false;
      }

      console.log(`✅ Webhook reçu et validé avec succès par ${app.name}.`);
      LoggerService.addLog({
        type: "webhook_out",
        level: "success",
        title: `Webhook validé par ${app.name} (HTTP ${response.status})`,
        appId: app.id,
        provider: event.provider,
        orderId: event.orderId,
        amount: event.amount,
        currency: event.currency,
        message: `Événement ${event.event} transmis`,
        details: { event, status: response.status, response: responseText },
      });
      return true;
    } catch (err: any) {
      console.error(`❌ Erreur réseau lors de l'envoi du webhook à ${app.name}:`, err.message);
      LoggerService.addLog({
        type: "webhook_out",
        level: "error",
        title: `Erreur réseau webhook -> ${app.name}`,
        appId: app.id,
        provider: event.provider,
        orderId: event.orderId,
        amount: event.amount,
        currency: event.currency,
        message: err.message,
        details: { event, error: err.stack },
      });
      return false;
    }
  }
}
