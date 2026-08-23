import { Router, Request, Response } from "express";
import crypto from "crypto";
import { requireAdminAuth, getExpectedSessionToken } from "../middleware/adminAuth";
import { dbQuery, dbRun, dbGet } from "../database/db";
import { encryptSecret, decryptSecret, maskSecret } from "../utils/encryption";

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
    tagline: "Mobile Money & Cartes Virtuelles en Afrique (Checkout Inline & H2H)",
    category: "Mobile Money & Cartes",
    publicKeyLabel: "Clé Publique pk (Checkout Inline)",
    publicKeyPlaceholder: "Ex: votre_cle_publique",
    secretKeyLabel: "Clé Secrète / x-api-key (API H2H & iKeeCard)",
    secretKeyPlaceholder: "Ex: votre_secret_key",
    hasExtraConfig: true,
    extraConfigLabel: "Configuration additionnelle (JSON optionnel)",
    extraConfigPlaceholder: '{"mode": "inline", "isSandbox": false}',
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
      const pId = (row.providerId || row.providerid || '').trim();
      const rawSec = row.secretKey || row.secretkey || '';
      const meta = ALL_PROVIDERS.find(p => p.id === pId) || {
        id: pId,
        name: pId ? (pId.charAt(0).toUpperCase() + pId.slice(1)) : 'Processeur',
        tagline: "Processeur de paiement",
        category: "Paiement",
        publicKeyLabel: "Clé Publique",
        publicKeyPlaceholder: "",
        secretKeyLabel: "Clé Secrète",
        secretKeyPlaceholder: "",
        hasExtraConfig: !!(row.extraConfig || row.extraconfig),
        extraConfigLabel: "Configuration additionnelle",
        extraConfigPlaceholder: ""
      };

      const isActiveBool = (row.isActive === 1 || row.isactive === 1 || row.isActive === true);

      return {
        id: pId,
        providerId: pId,
        name: meta.name,
        tagline: meta.tagline,
        category: meta.category,
        publicKeyLabel: meta.publicKeyLabel,
        secretKeyLabel: meta.secretKeyLabel,
        hasExtraConfig: meta.hasExtraConfig,
        extraConfigLabel: meta.extraConfigLabel,
        extraConfigPlaceholder: meta.extraConfigPlaceholder || "",
        isActive: isActiveBool,
        publicKey: row.publicKey || row.publickey || '',
        secretKey: rawSec,
        maskedSecretKey: maskSecret(rawSec),
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

    const existingApp = await dbQuery("SELECT * FROM client_apps WHERE id = ?", [id]);

    if (!apiKey) apiKey = 'sk_hub_' + crypto.randomBytes(16).toString('hex');
    
    let encWebhookSecret = '';
    if (existingApp.length > 0 && (!webhookSecret || webhookSecret.includes('••••') || webhookSecret.trim() === '')) {
      encWebhookSecret = existingApp[0].webhookSecret || existingApp[0].webhooksecret || '';
    } else if (webhookSecret) {
      encWebhookSecret = encryptSecret(webhookSecret.trim());
    } else {
      encWebhookSecret = encryptSecret('whsec_' + crypto.randomBytes(16).toString('hex'));
    }
    
    if (existingApp.length > 0) {
      await dbRun(
        `UPDATE client_apps SET name = ?, apiKey = ?, webhookUrl = ?, webhookSecret = ?, returnUrl = ?, cancelUrl = ? WHERE id = ?`,
        [name, apiKey, webhookUrl || '', encWebhookSecret, returnUrl || '', cancelUrl || '', id]
      );
    } else {
      await dbRun(
        `INSERT INTO client_apps (id, name, apiKey, webhookUrl, webhookSecret, returnUrl, cancelUrl) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, name, apiKey, webhookUrl || '', encWebhookSecret, returnUrl || '', cancelUrl || '']
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
    let { providerId, publicKey, secretKey, extraConfig } = req.body;
    const isActive = (req.body.isActive === '1' || req.body.isActive === 'on' || req.body.isActive === true || req.body.isActive === 1) ? 1 : 0;

    if (!providerId) {
      return res.redirect(`/admin/app/${appId}?tab=processors&error=` + encodeURIComponent("Veuillez sélectionner un processeur."));
    }

    providerId = providerId.trim().toLowerCase();

    const existing = await dbQuery("SELECT * FROM providers_config WHERE appId = ? AND providerId = ?", [appId, providerId]);
    const isAlreadyConfigured = existing.length > 0;

    let finalSecretKey = '';
    if (isAlreadyConfigured && (!secretKey || secretKey.includes('••••') || secretKey.trim() === '')) {
      finalSecretKey = existing[0].secretKey || existing[0].secretkey || '';
    } else if (secretKey && secretKey.trim() !== '') {
      finalSecretKey = encryptSecret(secretKey.trim());
    }

    if (isAlreadyConfigured) {
      await dbRun(
        `UPDATE providers_config SET isActive = ?, publicKey = ?, secretKey = ?, extraConfig = ? WHERE appId = ? AND providerId = ?`,
        [isActive, publicKey ? publicKey.trim() : '', finalSecretKey, extraConfig ? extraConfig.trim() : '', appId, providerId]
      );
    } else {
      await dbRun(
        `INSERT INTO providers_config (appId, providerId, isActive, publicKey, secretKey, extraConfig) VALUES (?, ?, ?, ?, ?, ?)`,
        [appId, providerId, isActive, publicKey ? publicKey.trim() : '', finalSecretKey, extraConfig ? extraConfig.trim() : '']
      );
    }

    const match = ALL_PROVIDERS.find(p => p.id === providerId);
    const providerName = match ? match.name : providerId;
    const statusText = isActive === 1 ? 'Actif' : 'Inactif';

    res.redirect(`/admin/app/${appId}?tab=processors&success=` + encodeURIComponent(`Le processeur ${providerName} a été enregistré avec succès (Statut : ${statusText}).`));
  } catch (error: any) {
    console.error("Save site provider error:", error);
    res.redirect(`/admin/app/${appId}?tab=processors&error=` + encodeURIComponent("Erreur: " + (error?.message || "Une erreur est survenue lors de l'enregistrement.")));
  }
});

// Basculer le statut d'un processeur pour un Site spécifique
adminRouter.post("/app/:appId/provider/toggle", async (req: Request, res: Response) => {
  const appId = req.params.appId;
  try {
    let { providerId } = req.body;
    if (!providerId) {
      return res.redirect(`/admin/app/${appId}?tab=processors&error=` + encodeURIComponent("Processeur introuvable."));
    }

    providerId = providerId.trim().toLowerCase();

    const row = await dbGet("SELECT * FROM providers_config WHERE appId = ? AND providerId = ?", [appId, providerId]);
    if (!row) {
      return res.redirect(`/admin/app/${appId}?tab=processors&error=` + encodeURIComponent("Processeur non configuré pour ce site."));
    }

    const match = ALL_PROVIDERS.find(p => p.id === providerId);
    const providerName = match ? match.name : providerId;
    const currentIsActive = (row.isActive === 1 || row.isactive === 1 || row.isActive === true) ? 1 : 0;
    const newStatus = currentIsActive === 1 ? 0 : 1;

    await dbRun("UPDATE providers_config SET isActive = ? WHERE appId = ? AND providerId = ?", [newStatus, appId, providerId]);

    const statusText = newStatus === 1 ? 'Actif' : 'Inactif';
    res.redirect(`/admin/app/${appId}?tab=processors&success=` + encodeURIComponent(`Le statut de ${providerName} est maintenant : ${statusText}.`));
  } catch (error: any) {
    console.error("Toggle site provider error:", error);
    res.redirect(`/admin/app/${appId}?tab=processors&error=` + encodeURIComponent("Erreur lors du changement de statut: " + (error?.message || error)));
  }
});

// Supprimer un processeur configuré pour un Site spécifique
adminRouter.post("/app/:appId/provider/delete", async (req: Request, res: Response) => {
  const appId = req.params.appId;
  try {
    let { providerId } = req.body;
    if (!providerId) {
      return res.redirect(`/admin/app/${appId}?tab=processors&error=` + encodeURIComponent("Processeur introuvable."));
    }

    providerId = providerId.trim().toLowerCase();

    await dbRun("DELETE FROM providers_config WHERE appId = ? AND providerId = ?", [appId, providerId]);

    const match = ALL_PROVIDERS.find(p => p.id === providerId);
    const providerName = match ? match.name : providerId;

    res.redirect(`/admin/app/${appId}?tab=processors&success=` + encodeURIComponent(`Processeur "${providerName}" supprimé avec succès pour ce site.`));
  } catch (error: any) {
    console.error("Delete site provider error:", error);
    res.redirect(`/admin/app/${appId}?tab=processors&error=` + encodeURIComponent("Erreur lors de la suppression: " + (error?.message || error)));
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

adminRouter.post("/settings/provider/toggle", async (req: Request, res: Response) => {
  const apps = await dbQuery("SELECT id FROM client_apps LIMIT 1");
  const appId = apps.length > 0 ? apps[0].id : "verifsms";
  const { providerId } = req.body;
  if (providerId) {
    const row = await dbGet("SELECT * FROM providers_config WHERE appId = ? AND providerId = ?", [appId, providerId]);
    if (row) {
      const newStatus = (row.isActive === 1 || row.isactive === 1) ? 0 : 1;
      await dbRun("UPDATE providers_config SET isActive = ? WHERE appId = ? AND providerId = ?", [newStatus, appId, providerId]);
    }
  }
  res.redirect(`/admin/app/${appId}?tab=processors`);
});

adminRouter.post("/settings/provider/delete", async (req: Request, res: Response) => {
  const apps = await dbQuery("SELECT id FROM client_apps LIMIT 1");
  const appId = apps.length > 0 ? apps[0].id : "verifsms";
  const { providerId } = req.body;
  if (providerId) {
    await dbRun("DELETE FROM providers_config WHERE appId = ? AND providerId = ?", [appId, providerId]);
  }
  res.redirect(`/admin/app/${appId}?tab=processors`);
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
