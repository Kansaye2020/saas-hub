import { Router, Request, Response } from "express";
import crypto from "crypto";
import { requireAdminAuth, getExpectedSessionToken } from "../middleware/adminAuth";
import { dbQuery, dbRun, dbGet } from "../database/db";

export const adminRouter = Router();

// Routes de connexion publiques
adminRouter.get("/login", (req: Request, res: Response) => {
  const errorMessage = req.query.error as string || null;
  res.render("admin/login", { errorMessage, defaultUsername: process.env.ADMIN_USERNAME || "admin" });
});

adminRouter.post("/login", async (req: Request, res: Response) => {
  const { username, password, apiKey, authType } = req.body;
  const adminUsername = process.env.ADMIN_USERNAME || "admin";
  const adminPassword = process.env.ADMIN_PASSWORD || "admin";

  // Option 1 : Connexion directe via Clé API du Site (sk_hub_...)
  if (apiKey && apiKey.trim()) {
    const key = apiKey.trim();
    const app = await dbGet("SELECT * FROM client_apps WHERE apiKey = ?", [key]);
    if (app) {
      const sessionToken = getExpectedSessionToken();
      res.setHeader("Set-Cookie", `admin_session=${sessionToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`);
      return res.redirect(`/admin/app/${app.id}`);
    } else {
      return res.render("admin/login", {
        errorMessage: "Clé API de site introuvable ou invalide.",
        defaultUsername: username || "admin",
        activeTab: "apiKey"
      });
    }
  }

  // Option 2 : Connexion Master Admin (Identifiant & Mot de passe)
  if (username === adminUsername && password === adminPassword) {
    const sessionToken = getExpectedSessionToken();
    res.setHeader("Set-Cookie", `admin_session=${sessionToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`);
    return res.redirect("/admin");
  }

  res.render("admin/login", {
    errorMessage: "Identifiant ou mot de passe incorrect. En mode dev, utilisez admin / admin.",
    defaultUsername: username || "admin",
    activeTab: "credentials"
  });
});

adminRouter.get("/logout", (_req: Request, res: Response) => {
  res.setHeader("Set-Cookie", `admin_session=; Path=/; HttpOnly; Max-Age=0`);
  res.redirect("/admin/login");
});

// Appliquer la protection d'authentification pour toutes les autres routes d'admin
adminRouter.use(requireAdminAuth);

export const ALL_PROVIDERS = [
  {
    id: "lomopay",
    name: "LomoPay",
    tagline: "Mobile Money (Wave, Orange Money, MTN, Moov)",
    category: "Mobile Money",
    publicKeyLabel: "Clé Publique (pk_live_... ou pk_test_...)",
    publicKeyPlaceholder: "Ex: pk_live_...",
    secretKeyLabel: "Clé Secrète (sk_live_... ou sk_test_...)",
    secretKeyPlaceholder: "Ex: sk_live_...",
    hasExtraConfig: false,
    extraConfigLabel: "",
  },
  {
    id: "whop",
    name: "Whop",
    tagline: "Cartes Bancaires Internationales, Apple Pay, Google Pay",
    category: "Carte Bancaire",
    publicKeyLabel: "Company ID (biz_...)",
    publicKeyPlaceholder: "Ex: biz_...",
    secretKeyLabel: "Company API Key",
    secretKeyPlaceholder: "Ex: clé API Whop",
    hasExtraConfig: false,
    extraConfigLabel: "",
  },
  {
    id: "stripe",
    name: "Stripe",
    tagline: "Paiements par Carte Bancaire directs (Visa, Mastercard)",
    category: "Carte Bancaire",
    publicKeyLabel: "Publishable Key (Optionnel)",
    publicKeyPlaceholder: "Ex: pk_live_...",
    secretKeyLabel: "Secret Key (sk_live_... / sk_test_...)",
    secretKeyPlaceholder: "Ex: sk_live_...",
    hasExtraConfig: true,
    extraConfigLabel: "Webhook Secret (whsec_...)",
    extraConfigPlaceholder: "Ex: whsec_...",
  },
  {
    id: "ikeepay",
    name: "iKeepay",
    tagline: "Paiements Mobile Money et Cartes en Afrique",
    category: "Mobile Money & Cartes",
    publicKeyLabel: "Public Key (ou API Key)",
    publicKeyPlaceholder: "Ex: ikp_pub_...",
    secretKeyLabel: "Secret Key (ou Merchant ID)",
    secretKeyPlaceholder: "Ex: ikp_sec_...",
    hasExtraConfig: true,
    extraConfigLabel: "Configuration additionnelle (JSON optionnel)",
    extraConfigPlaceholder: '{"webhookSecret": "..."}',
  },
  {
    id: "chariow",
    name: "Chariow",
    tagline: "Passerelle Mobile Money alternative",
    category: "Mobile Money",
    publicKeyLabel: "Public Key (Optionnel)",
    publicKeyPlaceholder: "Ex: char_pub_...",
    secretKeyLabel: "Secret Key",
    secretKeyPlaceholder: "Ex: char_sec_...",
    hasExtraConfig: false,
    extraConfigLabel: "",
  },
];

adminRouter.get("/", async (_req: Request, res: Response) => {
  res.redirect("/admin/apps");
});

adminRouter.get("/apps", async (req: Request, res: Response) => {
  try {
    const apps = await dbQuery("SELECT * FROM client_apps ORDER BY createdAt DESC");
    
    let totalGlobalRevenue = 0;
    let totalGlobalTransactions = 0;

    // Enrich each app with stats
    const enrichedApps = await Promise.all(apps.map(async (app: any) => {
      const revenueRow = await dbGet("SELECT SUM(amount) as total FROM transactions WHERE appId = ? AND status = 'succeeded'", [app.id]);
      const txCountRow = await dbGet("SELECT COUNT(*) as count FROM transactions WHERE appId = ?", [app.id]);
      const activeProviders = await dbQuery("SELECT providerId FROM providers_config WHERE appId = ? AND isActive = 1", [app.id]);
      
      const rev = Number(revenueRow?.total || 0);
      const txs = Number(txCountRow?.count || 0);

      totalGlobalRevenue += rev;
      totalGlobalTransactions += txs;

      return {
        ...app,
        totalRevenue: rev,
        transactionCount: txs,
        activeProvidersCount: activeProviders.length,
        activeProviders: activeProviders.map((p: any) => p.providerId)
      };
    }));

    const successMessage = req.query.success === '1' ? 'Application enregistrée avec succès.' : (req.query.success as string || null);
    const errorMessage = req.query.error as string || null;

    res.render("admin/apps", {
      apps: enrichedApps,
      totalGlobalRevenue,
      totalGlobalTransactions,
      totalAppsCount: apps.length,
      successMessage,
      errorMessage
    });
  } catch (error: any) {
    console.error("Apps error:", error);
    res.render("admin/apps", {
      apps: [],
      totalGlobalRevenue: 0,
      totalGlobalTransactions: 0,
      totalAppsCount: 0,
      successMessage: null,
      errorMessage: "Erreur base de données: " + (error?.message || "Impossible de charger les données.")
    });
  }
});

// Tableau de bord dédié pour un Site / SaaS spécifique
adminRouter.get("/app/:appId", async (req: Request, res: Response) => {
  const appId = req.params.appId;

  try {
    const allApps = await dbQuery("SELECT * FROM client_apps ORDER BY createdAt DESC");
    const currentApp = allApps.find((a: any) => a.id === appId);

    if (!currentApp) {
      return res.redirect("/admin/apps?error=" + encodeURIComponent(`Le site "${appId}" n'existe pas.`));
    }

    // 1. Stats pour ce site
    const revenueRows = await dbQuery("SELECT SUM(amount) as total FROM transactions WHERE appId = ? AND status = 'succeeded'", [appId]);
    const totalRevenue = Number(revenueRows[0]?.total || 0);

    const countRows = await dbQuery("SELECT COUNT(*) as count FROM transactions WHERE appId = ?", [appId]);
    const totalTransactions = Number(countRows[0]?.count || 0);

    const successCountRows = await dbQuery("SELECT COUNT(*) as count FROM transactions WHERE appId = ? AND status = 'succeeded'", [appId]);
    const successfulTransactions = Number(successCountRows[0]?.count || 0);

    const recentTransactions = await dbQuery("SELECT * FROM transactions WHERE appId = ? ORDER BY createdAt DESC LIMIT 25", [appId]);

    // 2. Processeurs configurés pour ce site
    const providerRows = await dbQuery("SELECT * FROM providers_config WHERE appId = ?", [appId]);
    
    const configuredProviders = providerRows.map((row: any) => {
      const pId = row.providerId || row.providerid || '';
      const meta = ALL_PROVIDERS.find(p => p.id === pId) || {
        id: pId,
        name: pId ? (pId.charAt(0).toUpperCase() + pId.slice(1)) : 'Processeur',
        tagline: "Processeur de paiement personnalisé",
        category: "Paiement",
        publicKeyLabel: "Clé Publique",
        publicKeyPlaceholder: "",
        secretKeyLabel: "Clé Secrète",
        secretKeyPlaceholder: "",
        hasExtraConfig: !!(row.extraConfig || row.extraconfig),
        extraConfigLabel: "Configuration additionnelle"
      };

      return {
        providerId: pId,
        isActive: (row.isActive ?? row.isactive) === 1,
        publicKey: row.publicKey || row.publickey || '',
        secretKey: row.secretKey || row.secretkey || '',
        extraConfig: row.extraConfig || row.extraconfig || '',
        meta
      };
    });

    const activeProviders = configuredProviders.filter(p => p.isActive);
    const unconfiguredProviders = ALL_PROVIDERS.filter(p => !configuredProviders.some(cp => cp.providerId === p.id));
    const canAddProcessor = unconfiguredProviders.length > 0;

    const activeProcessorName = activeProviders.length > 0
      ? activeProviders.map(p => p.meta.name).join(", ")
      : "Aucun processeur actif";

    const successMessage = req.query.success as string || null;
    const errorMessage = req.query.error as string || null;
    const activeTab = req.query.tab as string || "dashboard";

    res.render("admin/app_dashboard", {
      currentApp,
      allApps,
      totalRevenue,
      totalTransactions,
      successfulTransactions,
      recentTransactions,
      configuredProviders,
      activeProviders,
      unconfiguredProviders,
      canAddProcessor,
      activeProcessorName,
      allAvailableProviders: ALL_PROVIDERS,
      successMessage,
      errorMessage,
      activeTab
    });
  } catch (error: any) {
    console.error("Site Dashboard error:", error);
    res.redirect("/admin/apps?error=" + encodeURIComponent("Erreur: " + (error?.message || "Impossible de charger le tableau de bord.")));
  }
});

// Créer ou modifier un site SaaS
adminRouter.post("/apps", async (req: Request, res: Response) => {
  try {
    let { id, name, apiKey, webhookUrl, webhookSecret, returnUrl, cancelUrl } = req.body;
    
    if (!id || !name) {
      return res.redirect("/admin/apps?error=" + encodeURIComponent("L'ID et le nom du site sont requis."));
    }

    // Normaliser l'id (minuscules, sans espaces)
    id = id.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");

    if (!apiKey) apiKey = 'sk_hub_' + crypto.randomBytes(16).toString('hex');
    if (!webhookSecret) webhookSecret = 'whsec_' + crypto.randomBytes(16).toString('hex');
    
    const existingApp = await dbQuery("SELECT * FROM client_apps WHERE id = ?", [id]);
    if (existingApp.length > 0) {
      await dbRun(
        `UPDATE client_apps SET name = ?, apiKey = ?, webhookUrl = ?, webhookSecret = ?, returnUrl = ?, cancelUrl = ? WHERE id = ?`,
        [name, apiKey, webhookUrl || '', webhookSecret, returnUrl || '', cancelUrl || '', id]
      );
    } else {
      await dbRun(
        `INSERT INTO client_apps (id, name, apiKey, webhookUrl, webhookSecret, returnUrl, cancelUrl) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, name, apiKey, webhookUrl || '', webhookSecret, returnUrl || '', cancelUrl || '']
      );
    }

    res.redirect(`/admin/app/${id}?success=` + encodeURIComponent(`Site "${name}" configuré avec succès !`));
  } catch (error: any) {
    console.error("Save app error:", error);
    res.redirect("/admin/apps?error=" + encodeURIComponent("Erreur: " + (error?.message || "Erreur lors de l'enregistrement du site.")));
  }
});

// Supprimer un site
adminRouter.post("/apps/delete", async (req: Request, res: Response) => {
  try {
    const { appId } = req.body;
    if (!appId) {
      return res.redirect("/admin/apps?error=" + encodeURIComponent("ID du site requis."));
    }

    await dbRun("DELETE FROM client_apps WHERE id = ?", [appId]);
    await dbRun("DELETE FROM providers_config WHERE appId = ?", [appId]);

    res.redirect("/admin/apps?success=" + encodeURIComponent(`Le site "${appId}" et ses processeurs ont été supprimés.`));
  } catch (error: any) {
    console.error("Delete app error:", error);
    res.redirect("/admin/apps?error=" + encodeURIComponent("Erreur: " + (error?.message || "Erreur lors de la suppression.")));
  }
});

// Ajouter ou modifier un processeur pour un Site spécifique
adminRouter.post("/app/:appId/provider", async (req: Request, res: Response) => {
  const appId = req.params.appId;
  try {
    const { providerId, publicKey, secretKey, extraConfig, isEdit } = req.body;
    const isActive = (req.body.isActive === '1' || req.body.isActive === 'on' || req.body.isActive === true) ? 1 : 0;

    if (!providerId) {
      return res.redirect(`/admin/app/${appId}?tab=processors&error=` + encodeURIComponent("Veuillez sélectionner un processeur."));
    }

    const existing = await dbQuery("SELECT * FROM providers_config WHERE appId = ? AND providerId = ?", [appId, providerId]);
    const isAlreadyConfigured = existing.length > 0;

    if (!isEdit && isAlreadyConfigured) {
      return res.redirect(`/admin/app/${appId}?tab=processors&error=` + encodeURIComponent("Ce processeur est déjà configuré pour ce site. Vous pouvez modifier sa configuration."));
    }

    if (isAlreadyConfigured) {
      await dbRun(
        `UPDATE providers_config SET isActive = ?, publicKey = ?, secretKey = ?, extraConfig = ? WHERE appId = ? AND providerId = ?`,
        [isActive, publicKey || '', secretKey || '', extraConfig || '', appId, providerId]
      );
    } else {
      await dbRun(
        `INSERT INTO providers_config (appId, providerId, isActive, publicKey, secretKey, extraConfig) VALUES (?, ?, ?, ?, ?, ?)`,
        [appId, providerId, isActive, publicKey || '', secretKey || '', extraConfig || '']
      );
    }

    const match = ALL_PROVIDERS.find(p => p.id === providerId);
    const providerName = match ? match.name : providerId;
    const statusText = isActive === 1 ? 'Actif' : 'Inactif';

    res.redirect(`/admin/app/${appId}?tab=processors&success=` + encodeURIComponent(`Le processeur ${providerName} a été enregistré pour ce site. Statut : ${statusText}.`));
  } catch (error: any) {
    console.error("Save site provider error:", error);
    res.redirect(`/admin/app/${appId}?tab=processors&error=` + encodeURIComponent("Erreur: " + (error?.message || "Une erreur est survenue lors de l'enregistrement.")));
  }
});

// Basculer le statut d'un processeur pour un Site spécifique
adminRouter.post("/app/:appId/provider/toggle", async (req: Request, res: Response) => {
  const appId = req.params.appId;
  try {
    const { providerId } = req.body;
    if (!providerId) {
      return res.redirect(`/admin/app/${appId}?tab=processors&error=` + encodeURIComponent("Processeur introuvable."));
    }

    const row = await dbGet("SELECT * FROM providers_config WHERE appId = ? AND providerId = ?", [appId, providerId]);
    if (!row) {
      return res.redirect(`/admin/app/${appId}?tab=processors&error=` + encodeURIComponent("Processeur non configuré pour ce site."));
    }

    const match = ALL_PROVIDERS.find(p => p.id === providerId);
    const providerName = match ? match.name : providerId;
    const newStatus = row.isActive === 1 ? 0 : 1;

    await dbRun("UPDATE providers_config SET isActive = ? WHERE appId = ? AND providerId = ?", [newStatus, appId, providerId]);

    const statusText = newStatus === 1 ? 'Actif' : 'Inactif';
    res.redirect(`/admin/app/${appId}?tab=processors&success=` + encodeURIComponent(`Le statut de ${providerName} pour ce site est maintenant : ${statusText}.`));
  } catch (error) {
    console.error("Toggle site provider error:", error);
    res.redirect(`/admin/app/${appId}?tab=processors&error=` + encodeURIComponent("Erreur lors du changement de statut."));
  }
});

// Supprimer un processeur configuré pour un Site spécifique
adminRouter.post("/app/:appId/provider/delete", async (req: Request, res: Response) => {
  const appId = req.params.appId;
  try {
    const { providerId } = req.body;
    if (!providerId) {
      return res.redirect(`/admin/app/${appId}?tab=processors&error=` + encodeURIComponent("Processeur introuvable."));
    }

    await dbRun("DELETE FROM providers_config WHERE appId = ? AND providerId = ?", [appId, providerId]);
    res.redirect(`/admin/app/${appId}?tab=processors&success=` + encodeURIComponent("Processeur supprimé avec succès pour ce site."));
  } catch (error) {
    console.error("Delete site provider error:", error);
    res.redirect(`/admin/app/${appId}?tab=processors&error=` + encodeURIComponent("Erreur lors de la suppression du processeur."));
  }
});

// Redirection pour l'ancienne route /settings
adminRouter.get("/settings", async (_req: Request, res: Response) => {
  const apps = await dbQuery("SELECT id FROM client_apps LIMIT 1");
  if (apps.length > 0) {
    return res.redirect(`/admin/app/${apps[0].id}?tab=processors`);
  }
  res.redirect("/admin/apps");
});

adminRouter.get("/api/stats", async (req: Request, res: Response) => {
  try {
    const appId = req.query.appId as string;
    let sql = "SELECT SUM(amount) as total FROM transactions WHERE status = 'succeeded'";
    let params: any[] = [];
    if (appId) {
      sql += " AND appId = ?";
      params.push(appId);
    }
    const revenueRows = await dbQuery(sql, params);
    const totalRevenue = Number(revenueRows[0]?.total || 0);
    res.json({ totalRevenue });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});
