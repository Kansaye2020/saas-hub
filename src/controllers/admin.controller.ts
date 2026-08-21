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
import { SessionService } from "../services/session.service";
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
   * Création d'un lien de paiement direct (SaaS Checkout Link) depuis le tableau de bord
   * POST /api/v1/admin/quick-link
   */
  static async createQuickLink(req: Request, res: Response) {
    try {
      const { title, amount, currency, returnUrl, appId } = req.body;
      const app = (appId ? getClientAppById(appId) : null) || config.clientApps[0] || {
        id: "default_app",
        name: "Mon SaaS",
      };

      const session = SessionService.createSession({
        appId: app.id,
        appName: app.name,
        orderId: `link_${Date.now()}`,
        amount: Number(amount) || 1000,
        currency: currency || "XOF",
        description: title || "Paiement sécurisé",
        returnUrl: returnUrl || `${config.baseUrl}/health`,
      });

      const checkoutUrl = `${config.baseUrl}/checkout/${session.id}`;

      return res.status(200).json({
        success: true,
        sessionId: session.id,
        checkoutUrl,
        session,
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  /**
   * Récupérer les sessions de paiement récentes
   * GET /api/v1/admin/sessions
   */
  static getSessions(_req: Request, res: Response) {
    const sessions = SessionService.listSessions(20);
    return res.status(200).json({ success: true, sessions });
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
}
