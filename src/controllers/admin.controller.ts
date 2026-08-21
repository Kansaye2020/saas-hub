import { Request, Response } from "express";
import crypto from "crypto";
import {
  config,
  updateFullConfig,
  upsertClientApp,
  deleteClientApp,
  getClientAppById,
  exportEnvFormat,
} from "../config";
import { PaymentService } from "../services/payment.service";
import { WebhookDispatcherService } from "../services/webhook-dispatcher.service";
import { LoggerService } from "../services/logger.service";
import { providerRegistry } from "../providers";
import { ClientAppConfig, UnifiedWebhookPayload } from "../types";

export class AdminController {
  /**
   * Vérification simple du mot de passe admin si configuré
   */
  private static checkAuth(req: Request): boolean {
    if (!config.adminPassword) return true;
    const authHeader = req.headers["x-admin-password"] || req.headers.authorization;
    if (!authHeader) return false;
    const token = typeof authHeader === "string" && authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : authHeader;
    return token === config.adminPassword;
  }

  /**
   * Statut global et configuration active
   * GET /api/v1/admin/config
   */
  static getConfig(req: Request, res: Response) {
    const isAuthed = AdminController.checkAuth(req);

    return res.status(200).json({
      success: true,
      authRequired: Boolean(config.adminPassword),
      isAuthenticated: isAuthed,
      baseUrl: config.baseUrl,
      nodeEnv: config.nodeEnv,
      port: config.port,
      clientApps: config.clientApps,
      gateways: {
        lomopay: {
          configured: Boolean(config.lomopay.publicKey && config.lomopay.secretKey),
          publicKey: config.lomopay.publicKey,
          secretKey: config.lomopay.secretKey ? (isAuthed ? config.lomopay.secretKey : "••••••••") : "",
          apiUrl: config.lomopay.apiUrl,
          webhookUrl: `${config.baseUrl}/webhooks/lomopay`,
        },
        whop: {
          configured: Boolean(config.whop.apiKey && config.whop.companyId),
          apiKey: config.whop.apiKey ? (isAuthed ? config.whop.apiKey : "••••••••") : "",
          companyId: config.whop.companyId,
          isSandbox: config.whop.isSandbox,
          webhookUrl: `${config.baseUrl}/webhooks/whop`,
        },
        stripe: {
          configured: Boolean(config.stripe.secretKey),
          secretKey: config.stripe.secretKey ? (isAuthed ? config.stripe.secretKey : "••••••••") : "",
          webhookSecret: config.stripe.webhookSecret ? (isAuthed ? config.stripe.webhookSecret : "••••••••") : "",
          webhookUrl: `${config.baseUrl}/webhooks/stripe`,
        },
        chariow: {
          configured: Boolean(config.chariow.secretKey),
          secretKey: config.chariow.secretKey ? (isAuthed ? config.chariow.secretKey : "••••••••") : "",
          publicKey: config.chariow.publicKey,
          webhookUrl: `${config.baseUrl}/webhooks/chariow`,
        },
      },
      availableProviders: providerRegistry.getAvailableProviders(),
    });
  }

  /**
   * Sauvegarde des passerelles de paiement et paramètres globaux
   * POST /api/v1/admin/config
   */
  static saveConfig(req: Request, res: Response) {
    if (!AdminController.checkAuth(req)) {
      return res.status(401).json({ success: false, error: "Mot de passe administrateur requis" });
    }

    try {
      const { baseUrl, adminPassword, lomopay, whop, stripe, chariow } = req.body;

      updateFullConfig({
        ...(baseUrl ? { baseUrl } : {}),
        ...(adminPassword !== undefined ? { adminPassword } : {}),
        ...(lomopay ? { lomopay } : {}),
        ...(whop ? { whop } : {}),
        ...(stripe ? { stripe } : {}),
        ...(chariow ? { chariow } : {}),
      });

      LoggerService.addLog({
        type: "config_updated",
        level: "info",
        title: "Configuration du hub mise à jour",
        message: "Les clés et paramètres ont été enregistrés.",
      });

      return res.status(200).json({
        success: true,
        message: "Configuration sauvegardée avec succès",
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  /**
   * Ajout ou modification d'une application SaaS cliente
   * POST /api/v1/admin/client-apps
   */
  static saveClientApp(req: Request, res: Response) {
    if (!AdminController.checkAuth(req)) {
      return res.status(401).json({ success: false, error: "Mot de passe administrateur requis" });
    }

    try {
      const { id, name, apiKey, webhookUrl, webhookSecret } = req.body;

      if (!id || !name) {
        return res.status(400).json({ success: false, error: "ID et Nom du SaaS requis" });
      }

      const cleanId = id.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "_");

      const appData: ClientAppConfig = {
        id: cleanId,
        name: name.trim(),
        apiKey: apiKey || `sec_live_${crypto.randomBytes(12).toString("hex")}`,
        webhookUrl: (webhookUrl || "").trim(),
        webhookSecret: webhookSecret || `whsec_${crypto.randomBytes(16).toString("hex")}`,
      };

      upsertClientApp(appData);

      LoggerService.addLog({
        type: "config_updated",
        level: "success",
        title: `SaaS "${appData.name}" enregistré`,
        appId: appData.id,
        message: `Webhook URL: ${appData.webhookUrl || "Non configurée"}`,
      });

      return res.status(200).json({
        success: true,
        message: `Application "${appData.name}" enregistrée avec succès`,
        app: appData,
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  /**
   * Suppression d'une application SaaS
   * DELETE /api/v1/admin/client-apps/:id
   */
  static removeClientApp(req: Request, res: Response) {
    if (!AdminController.checkAuth(req)) {
      return res.status(401).json({ success: false, error: "Mot de passe administrateur requis" });
    }

    const { id } = req.params;
    const deleted = deleteClientApp(id);

    if (deleted) {
      LoggerService.addLog({
        type: "config_updated",
        level: "warn",
        title: `SaaS "${id}" supprimé`,
        appId: id,
      });
      return res.status(200).json({ success: true, message: `Application "${id}" supprimée` });
    }

    return res.status(404).json({ success: false, error: "Application introuvable" });
  }

  /**
   * Test de création de paiement depuis le dashboard
   * POST /api/v1/admin/test-payment
   */
  static async testPayment(req: Request, res: Response) {
    try {
      const { appId, provider, amount, currency, description, orderId, email, name, returnUrl } = req.body;

      const app = getClientAppById(appId) || config.clientApps[0];
      if (!app) {
        return res.status(400).json({ success: false, error: "Aucun SaaS configuré pour tester" });
      }

      const generatedOrderId = orderId || `test_order_${Date.now()}`;
      const payload = {
        appId: app.id,
        provider: provider || "auto",
        amount: Number(amount) || 1000,
        currency: currency || "XOF",
        description: description || `Test de paiement Hub #${generatedOrderId}`,
        orderId: generatedOrderId,
        customer: {
          email: email || "test-client@example.com",
          name: name || "Client Test",
        },
        returnUrl: returnUrl || `${config.baseUrl}/health`,
      };

      const result = await PaymentService.createPayment(payload);
      return res.status(200).json(result);
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  /**
   * Test d'envoi d'un webhook simulé vers un SaaS client
   * POST /api/v1/admin/test-webhook
   */
  static async testWebhook(req: Request, res: Response) {
    try {
      const { appId, event, amount, currency, orderId, provider } = req.body;

      const app = getClientAppById(appId);
      if (!app) {
        return res.status(404).json({ success: false, error: `SaaS "${appId}" introuvable` });
      }

      if (!app.webhookUrl) {
        return res.status(400).json({ success: false, error: `Le SaaS "${app.name}" n'a pas d'URL de webhook configurée` });
      }

      const samplePayload: UnifiedWebhookPayload = {
        event: event || "payment.succeeded",
        appId: app.id,
        paymentId: `sim_pay_${Date.now()}`,
        orderId: orderId || `sim_order_${Date.now()}`,
        provider: provider || "lomopay",
        amount: Number(amount) || 2500,
        currency: currency || "XOF",
        customer: {
          email: "client-test@example.com",
          name: "Test Client",
        },
        providerTransactionId: `sim_tx_${Date.now()}`,
        timestamp: Date.now(),
      };

      const success = await WebhookDispatcherService.dispatchToClientApp(samplePayload);

      return res.status(200).json({
        success,
        message: success
          ? `Webhook transmis avec succès à ${app.name} (${app.webhookUrl})`
          : `Échec de réception par ${app.name} (${app.webhookUrl}). Vérifiez vos logs.`,
        payload: samplePayload,
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  /**
   * Consultation des logs en direct
   * GET /api/v1/admin/logs
   */
  static getLogs(req: Request, res: Response) {
    const { type, appId, limit } = req.query;
    const logs = LoggerService.getLogs({
      type: type as string,
      appId: appId as string,
      limit: limit ? parseInt(limit as string, 10) : 100,
    });
    return res.status(200).json({ success: true, logs });
  }

  /**
   * Nettoyage des logs
   * POST /api/v1/admin/logs/clear
   */
  static clearLogs(_req: Request, res: Response) {
    LoggerService.clearLogs();
    return res.status(200).json({ success: true, message: "Logs effacés" });
  }

  /**
   * Export des variables d'environnement au format Render.com
   * GET /api/v1/admin/env-export
   */
  static getEnvExport(_req: Request, res: Response) {
    const envString = exportEnvFormat();
    return res.status(200).json({
      success: true,
      env: envString,
      clientAppsJson: JSON.stringify(config.clientApps, null, 2),
    });
  }

  /**
   * Générateur de clés aléatoires sécurisées
   * GET /api/v1/admin/generate-keys
   */
  static generateKeys(_req: Request, res: Response) {
    return res.status(200).json({
      apiKey: `vfs_live_sec_${crypto.randomBytes(12).toString("hex")}`,
      webhookSecret: `whsec_${crypto.randomBytes(16).toString("hex")}`,
    });
  }
}
