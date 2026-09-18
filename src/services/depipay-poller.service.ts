import { providerRegistry } from "../providers";
import { DepiPayProvider } from "../providers/depipay.provider";
import { dbQuery, dbRun } from "../database/db";
import { decryptSecret } from "../utils/encryption";
import { WebhookDispatcherService } from "./webhook-dispatcher.service";

export class DepiPayPollerService {
  private static intervalTimer: NodeJS.Timeout | null = null;
  private static isPolling: boolean = false;
  private static pollIntervalMs: number = 10000; // 10 secondes

  /**
   * Démarre la boucle automatique de scrutation des paiements DepiPay
   */
  static start(intervalMs: number = 10000): void {
    if (this.intervalTimer) {
      return;
    }
    this.pollIntervalMs = intervalMs;
    console.log(`🔄 [DepiPay Poller] Service de scrutation démarré (cadence: ${this.pollIntervalMs / 1000}s)`);

    this.intervalTimer = setInterval(() => {
      this.pollAll().catch((err) => {
        console.error("❌ [DepiPay Poller] Erreur inattendue lors de la scrutation:", err);
      });
    }, this.pollIntervalMs);
  }

  /**
   * Arrête la boucle de scrutation
   */
  static stop(): void {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
      console.log("⏹️ [DepiPay Poller] Service de scrutation arrêté.");
    }
  }

  /**
   * Exécute une passe de scrutation sur toutes les applications configurées pour DepiPay
   */
  static async pollAll(): Promise<number> {
    if (this.isPolling) {
      return 0;
    }

    this.isPolling = true;
    let totalEventsProcessed = 0;

    try {
      // Trouver tous les sites ayant DepiPay activé
      const rows = await dbQuery(
        "SELECT appId, secretKey FROM providers_config WHERE providerId = 'depipay' AND isActive = 1"
      );

      if (!rows || rows.length === 0) {
        return 0;
      }

      const depipayProvider = providerRegistry.getProvider("depipay") as DepiPayProvider;

      for (const row of rows) {
        const appId = row.appId || (row as any).appid;
        const rawSecret = row.secretKey || (row as any).secretkey;
        if (!appId || !rawSecret) continue;

        const secretKey = decryptSecret(rawSecret);
        if (!secretKey) continue;

        try {
          const events = await depipayProvider.pollEvents(appId, secretKey);
          if (events && events.length > 0) {
            console.log(`📥 [DepiPay Poller] ${events.length} événement(s) récupéré(s) pour le site "${appId}"`);
            for (const ev of events) {
              await this.processEvent(depipayProvider, appId, ev);
              totalEventsProcessed++;
            }
          }
        } catch (pollErr: any) {
          console.warn(`⚠️ [DepiPay Poller] Erreur lors de la scrutation pour "${appId}":`, pollErr.message || pollErr);
        }
      }
    } catch (err: any) {
      console.error("❌ [DepiPay Poller] Erreur d'accès à la base de données:", err);
    } finally {
      this.isPolling = false;
    }

    return totalEventsProcessed;
  }

  /**
   * Scrute manuellement les événements pour une application spécifique
   */
  static async pollApp(appId: string): Promise<any[]> {
    const row = await dbQuery(
      "SELECT secretKey FROM providers_config WHERE appId = ? AND providerId = 'depipay' AND isActive = 1",
      [appId]
    );

    if (!row || row.length === 0) {
      throw new Error(`Aucune configuration DepiPay active trouvée pour le site "${appId}".`);
    }

    const secretKey = decryptSecret(row[0].secretKey || row[0].secretkey);
    const depipayProvider = providerRegistry.getProvider("depipay") as DepiPayProvider;
    const events = await depipayProvider.pollEvents(appId, secretKey);

    for (const ev of events) {
      await this.processEvent(depipayProvider, appId, ev);
    }

    return events;
  }

  /**
   * Traite un événement de facture DepiPay individuel
   */
  private static async processEvent(provider: DepiPayProvider, appId: string, event: any): Promise<void> {
    try {
      console.log(`🔔 [DepiPay Event] Facture ${event.guid} - Statut: [${event.status}] - Montant: ${event.paidAmount || event.value}`);

      const unifiedPayload = await provider.parseWebhookEvent(JSON.stringify(event), {});
      if (!unifiedPayload) {
        return;
      }

      // 1. Mettre à jour l'enregistrement dans la base de données transactions
      let dbStatus = "pending";
      if (unifiedPayload.event === "payment.succeeded") dbStatus = "succeeded";
      if (unifiedPayload.event === "payment.failed") dbStatus = "failed";
      if (unifiedPayload.event === "payment.canceled") dbStatus = "canceled";

      await dbRun(
        "UPDATE transactions SET status = ? WHERE id = ? OR orderId = ?",
        [dbStatus, unifiedPayload.paymentId, unifiedPayload.orderId]
      );

      // 2. Mettre à jour la session de checkout
      await dbRun(
        "UPDATE checkout_sessions SET status = ? WHERE orderId = ? OR token = ?",
        [dbStatus, unifiedPayload.orderId, unifiedPayload.orderId]
      );

      // 3. Dispatcher l'événement au SaaS client
      await WebhookDispatcherService.dispatchToClientApp(unifiedPayload);

      console.log(`✅ [DepiPay] Transaction ${unifiedPayload.paymentId} marquée [${dbStatus}] et notifiée avec succès`);
    } catch (err: any) {
      console.error(`❌ [DepiPay] Erreur lors du traitement de l'événement ${event?.guid}:`, err);
    }
  }
}
