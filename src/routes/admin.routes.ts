import { Router } from "express";
import { AdminController } from "../controllers/admin.controller";

export const adminRouter = Router();

// Gestion de configuration
adminRouter.get("/config", AdminController.getConfig);
adminRouter.post("/config", AdminController.saveConfig);

// Gestion des SaaS clients
adminRouter.post("/client-apps", AdminController.saveClientApp);
adminRouter.delete("/client-apps/:id", AdminController.removeClientApp);

// Tests et simulations
adminRouter.post("/test-payment", AdminController.testPayment);
adminRouter.post("/test-webhook", AdminController.testWebhook);

// Logs et activité
adminRouter.get("/logs", AdminController.getLogs);
adminRouter.post("/logs/clear", AdminController.clearLogs);

// Outils utilitaires
adminRouter.get("/env-export", AdminController.getEnvExport);
adminRouter.get("/generate-keys", AdminController.generateKeys);
