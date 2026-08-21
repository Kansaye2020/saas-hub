import { Router, Request, Response } from "express";
import { requireAdminAuth } from "../middleware/adminAuth";
import { dbQuery, dbRun } from "../database/db";

export const adminRouter = Router();

// Apply basic auth to all admin routes
adminRouter.use(requireAdminAuth);

adminRouter.get("/", async (req: Request, res: Response) => {
  try {
    // Get total revenue
    const revenueRows = await dbQuery("SELECT SUM(amount) as total FROM transactions WHERE status = 'succeeded'");
    const totalRevenue = Number(revenueRows[0]?.total || 0);

    // Get total transactions
    const countRows = await dbQuery("SELECT COUNT(*) as count FROM transactions");
    const totalTransactions = Number(countRows[0]?.count || 0);

    // Get recent transactions
    const recentTransactions = await dbQuery("SELECT * FROM transactions ORDER BY createdAt DESC LIMIT 20");

    res.render("admin/dashboard", {
      totalRevenue,
      totalTransactions,
      recentTransactions
    });
  } catch (error) {
    console.error("Dashboard error:", error);
    res.status(500).send("Internal Server Error");
  }
});

adminRouter.get("/settings", async (req: Request, res: Response) => {
  try {
    const rows = await dbQuery("SELECT * FROM providers_config");
    const configs: Record<string, any> = {};
    
    // Default configs to prevent undefined errors in EJS
    ['lomopay', 'whop', 'ikeepay'].forEach(p => {
      configs[p] = { isActive: false, publicKey: '', secretKey: '', extraConfig: '' };
    });

    rows.forEach(row => {
      configs[row.providerId] = {
        isActive: row.isActive === 1,
        publicKey: row.publicKey || '',
        secretKey: row.secretKey || '',
        extraConfig: row.extraConfig || ''
      };
    });

    const successMessage = req.query.success === '1' ? 'Configuration sauvegardée avec succès.' : null;

    res.render("admin/settings", { configs, successMessage });
  } catch (error) {
    console.error("Settings error:", error);
    res.status(500).send("Internal Server Error");
  }
});

adminRouter.get("/apps", async (req: Request, res: Response) => {
  try {
    const apps = await dbQuery("SELECT * FROM client_apps ORDER BY createdAt DESC");
    const successMessage = req.query.success === '1' ? 'Application sauvegardée avec succès.' : null;
    res.render("admin/apps", { apps, successMessage });
  } catch (error) {
    console.error("Apps error:", error);
    res.status(500).send("Internal Server Error");
  }
});

adminRouter.post("/apps", async (req: Request, res: Response) => {
  try {
    const { id, name, apiKey, webhookUrl, webhookSecret } = req.body;
    
    await dbRun(
      `INSERT INTO client_apps (id, name, apiKey, webhookUrl, webhookSecret)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET 
       name=excluded.name, 
       apiKey=excluded.apiKey, 
       webhookUrl=excluded.webhookUrl, 
       webhookSecret=excluded.webhookSecret`,
      [id, name, apiKey, webhookUrl, webhookSecret]
    );

    res.redirect("/admin/apps?success=1");
  } catch (error) {
    console.error("Save app error:", error);
    res.status(500).send("Internal Server Error");
  }
});

adminRouter.post("/settings/provider", async (req: Request, res: Response) => {
  try {
    const { providerId, publicKey, secretKey, extraConfig } = req.body;
    const isActive = req.body.isActive === '1' ? 1 : 0;

    await dbRun(
      `INSERT INTO providers_config (providerId, isActive, publicKey, secretKey, extraConfig)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(providerId) DO UPDATE SET 
       isActive=excluded.isActive, 
       publicKey=excluded.publicKey, 
       secretKey=excluded.secretKey, 
       extraConfig=excluded.extraConfig`,
      [providerId, isActive, publicKey, secretKey, extraConfig]
    );

    res.redirect("/admin/settings?success=1");
  } catch (error) {
    console.error("Save provider error:", error);
    res.status(500).send("Internal Server Error");
  }
});

adminRouter.get("/api/stats", async (req: Request, res: Response) => {
  try {
    const revenueRows = await dbQuery("SELECT SUM(amount) as total FROM transactions WHERE status = 'succeeded'");
    const totalRevenue = Number(revenueRows[0]?.total || 0);
    res.json({ totalRevenue });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});
