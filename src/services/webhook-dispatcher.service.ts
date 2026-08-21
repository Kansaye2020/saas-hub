import { UnifiedWebhookPayload } from "../types";
import { getClientAppById } from "../config";
import { SignatureService } from "./signature.service";

export class WebhookDispatcherService {
  /**
   * Transmet l'événement unifié au SaaS concerné avec signature cryptographique
   */
  static async dispatchToClientApp(event: UnifiedWebhookPayload): Promise<boolean> {
    const app = getClientAppById(event.appId);

    if (!app) {
      console.warn(`⚠️ Application SaaS inconnue "${event.appId}". Impossible de dispatcher le webhook.`);
      return false;
    }

    if (!app.webhookUrl) {
      console.warn(`⚠️ Aucune URL de webhook configurée pour l'application "${event.appId}".`);
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

      if (!response.ok) {
        const errText = await response.text();
        console.error(`❌ Échec webhook SaaS ${app.name} (${response.status}): ${errText}`);
        return false;
      }

      console.log(`✅ Webhook reçu et validé avec succès par ${app.name}.`);
      return true;
    } catch (err: any) {
      console.error(`❌ Erreur réseau lors de l'envoi du webhook à ${app.name}:`, err.message);
      return false;
    }
  }
}
