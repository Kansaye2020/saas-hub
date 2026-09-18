import { Router, Request, Response } from "express";
import crypto from "crypto";
import { dbRun, dbGet } from "../database/db";
import { requireAppAuth, AuthenticatedRequest } from "../middleware/auth";
import { PaymentService } from "../services/payment.service";
import { getCheckoutUrl, getAppActiveProviders, getClientAppById } from "../config";

export const checkoutRouter = Router();

// Create a checkout session (Called by SaaS backend)
checkoutRouter.post("/session", requireAppAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const clientApp = req.clientApp!;
    let { amount, currency, returnUrl, cancelUrl, orderId, description, customerEmail, customerName, email, name, customer } = req.body;

    if (!amount || !currency || !orderId) {
      return res.status(400).json({ error: "amount, currency, and orderId are required" });
    }

    customerEmail = customerEmail || email || customer?.email || undefined;
    customerName = customerName || name || customer?.name || undefined;

    // Utiliser la returnUrl de l'application cliente par défaut si non spécifiée
    returnUrl = returnUrl || clientApp.returnUrl || `${req.protocol}://${req.get("host")}/public/test-redirect.html?status=success`;
    cancelUrl = cancelUrl || clientApp.cancelUrl || returnUrl;

    const token = crypto.randomBytes(32).toString("hex");

    await dbRun(
      `INSERT INTO checkout_sessions (token, appId, amount, currency, returnUrl, cancelUrl, status, orderId, description, customerEmail, customerName)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [token, clientApp.id, Number(amount), currency, returnUrl, cancelUrl, "pending", orderId, description, customerEmail, customerName]
    );

    const checkoutUrl = getCheckoutUrl(token, req);

    res.json({
      success: true,
      token,
      checkoutUrl
    });
  } catch (error) {
    console.error("Session creation error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Confirmation de paiement intelligente (Popup vs Redirection directe)
checkoutRouter.get("/complete", async (req: Request, res: Response) => {
  const token = (req.query.token as string) || "";
  const orderId = (req.query.orderId as string) || (req.query.order_id as string) || "";

  try {
    let session = null;
    if (token) {
      session = await dbGet("SELECT * FROM checkout_sessions WHERE token = ?", [token]);
    } else if (orderId) {
      session = await dbGet("SELECT * FROM checkout_sessions WHERE orderId = ? ORDER BY createdAt DESC", [orderId]);
    }

    let returnUrl = session?.returnUrl || session?.returnurl || "/public/test-redirect.html?status=success";
    let storeName = "Boutique";
    let storeLogo = "";

    if (session) {
      const clientApp = await getClientAppById(session.appId);
      if (clientApp) {
        storeName = clientApp.name;
        storeLogo = clientApp.logoUrl || "";
      }
    }

    res.render("checkout/complete", {
      session,
      token,
      returnUrl,
      storeName,
      storeLogo
    });
  } catch (error) {
    console.error("Error rendering complete page:", error);
    res.redirect("/public/test-redirect.html?status=success");
  }
});

// Annulation de paiement intelligente (Popup vs Redirection directe)
checkoutRouter.get("/cancel", async (req: Request, res: Response) => {
  const token = (req.query.token as string) || "";
  const orderId = (req.query.orderId as string) || (req.query.order_id as string) || "";

  try {
    let session = null;
    if (token) {
      session = await dbGet("SELECT * FROM checkout_sessions WHERE token = ?", [token]);
    } else if (orderId) {
      session = await dbGet("SELECT * FROM checkout_sessions WHERE orderId = ? ORDER BY createdAt DESC", [orderId]);
    }

    let cancelUrl = session?.cancelUrl || session?.cancelurl || session?.returnUrl || session?.returnurl || "/public/test-redirect.html?status=cancel";
    let storeName = "Boutique";
    let storeLogo = "";

    if (session) {
      const clientApp = await getClientAppById(session.appId);
      if (clientApp) {
        storeName = clientApp.name;
        storeLogo = clientApp.logoUrl || "";
      }
    }

    res.render("checkout/cancel", {
      session,
      token,
      cancelUrl,
      storeName,
      storeLogo
    });
  } catch (error) {
    console.error("Error rendering cancel page:", error);
    res.redirect("/public/test-redirect.html?status=cancel");
  }
});

// Render the checkout page (Browser)
checkoutRouter.get("/:token", async (req: Request, res: Response) => {
  const token = req.params.token;
  const mode = req.query.mode as string; // 'widget' or undefined

  if (!token || token === 'session' || token === 'pay' || token === 'complete' || token === 'cancel') {
    return res.status(404).send("Not found");
  }

  try {
    const session = await dbGet("SELECT * FROM checkout_sessions WHERE token = ?", [token]);
    
    if (!session) {
      return res.status(404).send("Session not found or expired");
    }

    if (session.status !== 'pending') {
      return res.status(400).send("Session is already completed or cancelled");
    }

    // Préremplissage intelligent de l'email et du nom depuis les paramètres URL (?email=... ou ?customerEmail=...)
    const queryEmail = ((req.query.customerEmail || req.query.email) as string || "").trim();
    const queryName = ((req.query.customerName || req.query.name) as string || "").trim();

    if (queryEmail && (!session.customerEmail && !session.customeremail)) {
      session.customerEmail = queryEmail;
      try {
        await dbRun("UPDATE checkout_sessions SET customerEmail = ? WHERE token = ?", [queryEmail, token]);
      } catch (e) {}
    }

    if (queryName && (!session.customerName && !session.customername)) {
      session.customerName = queryName;
      try {
        await dbRun("UPDATE checkout_sessions SET customerName = ? WHERE token = ?", [queryName, token]);
      } catch (e) {}
    }

    // Fetch the client app config to get the store name and logo
    const clientApp = await getClientAppById(session.appId);
    const storeName = clientApp ? clientApp.name : session.appId;
    const storeLogo = clientApp?.logoUrl || "";

    // Fetch active providers configured specifically for THIS site
    const appActiveProviders = await getAppActiveProviders(session.appId);
    const providers: Array<{ id: string; name: string }> = [];

    for (const p of appActiveProviders) {
      const pId = p.providerId || (p as any).providerid || '';
      if (pId) {
        let name = pId.charAt(0).toUpperCase() + pId.slice(1);
        if (pId === 'saspay') name = 'Mobile Money & Carte Bancaire';
        else if (pId === 'lomopay') name = 'Mobile Money';
        else if (pId === 'ikeepay') name = 'Mobile Money';
        else if (pId === 'depipay') name = 'Crypto-monnaies (DepiPay)';
        providers.push({
          id: pId,
          name
        });
      }
    }

    // Fallback if no providers are active yet so the test UI isn't empty
    if (providers.length === 0) {
      providers.push({ id: 'saspay', name: 'Mobile Money & Carte Bancaire (Non configuré)' });
      providers.push({ id: 'lomopay', name: 'Mobile Money (Non configuré)' });
      providers.push({ id: 'whop', name: 'Carte Bancaire (Non configuré)' });
    }

    res.render("checkout/index", {
      session,
      storeName,
      storeLogo,
      providers,
      mode
    });
  } catch (error) {
    console.error("Checkout render error:", error);
    res.status(500).send("Internal server error");
  }
});

// Process payment from the checkout page
checkoutRouter.post("/pay", async (req: Request, res: Response) => {
  const { token, provider, customerEmail, customerName, email, name, cryptoNetwork, cryptoToken } = req.body;

  try {
    const session = await dbGet("SELECT * FROM checkout_sessions WHERE token = ?", [token]);
    
    if (!session) {
      return res.status(404).json({ error: "Session introuvable ou expirée" });
    }

    const host = req.get("host") || "localhost:4000";
    const protocol = req.protocol || "https";
    let returnUrl = session.returnUrl || session.returnurl;
    if (!returnUrl || !returnUrl.startsWith("http")) {
      returnUrl = `${protocol}://${host}${returnUrl && returnUrl.startsWith("/") ? returnUrl : "/public/test-redirect.html?status=success"}`;
    }

    let cancelUrl = session.cancelUrl || session.cancelurl;
    if (cancelUrl && !cancelUrl.startsWith("http")) {
      cancelUrl = `${protocol}://${host}${cancelUrl.startsWith("/") ? cancelUrl : "/" + cancelUrl}`;
    }

    const finalEmail = (customerEmail || email || session.customerEmail || session.customeremail || "").trim() || undefined;
    const finalName = (customerName || name || session.customerName || session.customername || "").trim() || undefined;

    if (finalEmail && (!session.customerEmail && !session.customeremail)) {
      try {
        await dbRun("UPDATE checkout_sessions SET customerEmail = ?, customerName = ? WHERE token = ?", [finalEmail, finalName || "", token]);
      } catch (e) {}
    }

    // Call PaymentService directly
    const result = await PaymentService.createPayment({
      appId: session.appId || session.appid,
      provider: provider,
      amount: Number(session.amount),
      currency: session.currency || "XOF",
      description: session.description || `Commande #${session.orderId || session.orderid}`,
      orderId: session.orderId || session.orderid,
      customer: {
        email: finalEmail,
        name: finalName
      },
      returnUrl: returnUrl,
      cancelUrl: cancelUrl || returnUrl,
      metadata: {
        network: cryptoNetwork,
        token: cryptoToken,
        cryptoNetwork,
        cryptoToken
      }
    });

    if (result.success && result.checkoutUrl) {
      // Update session status and provider
      await dbRun("UPDATE checkout_sessions SET provider = ?, status = 'processing' WHERE token = ?", [provider, token]);
      return res.json({
        success: true,
        checkoutUrl: result.checkoutUrl,
        provider: provider,
        paymentId: result.paymentId,
        cryptoDetails: (provider === "depipay" && result.rawProviderData) ? {
          address: result.rawProviderData.address,
          value: result.rawProviderData.value,
          guid: result.rawProviderData.guid,
          token: result.rawProviderData.token,
          chainId: result.rawProviderData.chainId,
          paymentUrl: result.checkoutUrl,
          network: cryptoNetwork,
          cryptoToken: cryptoToken,
          deadlineSecs: Number(result.rawProviderData.deadlineSecs || 900)
        } : undefined
      });
    } else {
      console.error(`[Checkout Pay] Échec initialisation avec le processeur ${provider}:`, result.error);
      let clientError = "Ce moyen de paiement est momentanément indisponible. Veuillez essayer un autre mode de paiement ou réessayer.";
      if (provider === "depipay") {
        clientError = "Le paiement en crypto-monnaie est momentanément indisponible. Veuillez sélectionner un autre moyen de paiement (Mobile Money, Carte) ou réessayer plus tard.";
      }
      return res.status(400).json({ error: clientError });
    }
  } catch (error: any) {
    console.error("Checkout pay error:", error);
    res.status(500).json({ error: "Une erreur temporaire est survenue lors de l'initialisation du paiement." });
  }
});

// Vérification en direct de l'état d'une session de paiement (pour le suivi in-page sans redirection)
checkoutRouter.get("/status/:token", async (req: Request, res: Response) => {
  try {
    const token = req.params.token;
    const session = await dbGet("SELECT status, orderId, provider, amount, currency FROM checkout_sessions WHERE token = ?", [token]);
    if (!session) {
      return res.status(404).json({ error: "Session introuvable" });
    }
    res.json({
      status: session.status,
      orderId: session.orderId || session.orderid,
      provider: session.provider,
      amount: session.amount,
      currency: session.currency
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
