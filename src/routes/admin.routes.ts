import { Router } from "express";
import { AdminController } from "../controllers/admin.controller";

export const adminRouter = Router();

// Gestion de configuration
adminRouter.get("/config", AdminController.getConfig);
adminRouter.post("/config", AdminController.saveConfig);

// Gestion des SaaS clients
adminRouter.post("/client-apps", AdminController.saveClientApp);
adminRouter.delete("/client-apps/:id", AdminController.removeClientApp);

// Liens de checkout rapides et sessions
adminRouter.post("/quick-link", AdminController.createQuickLink);
adminRouter.get("/sessions", AdminController.getSessions);

// Export Render.com
adminRouter.get("/env-export", AdminController.getEnvExport);
