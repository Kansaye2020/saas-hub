import { Router, Request, Response } from "express";
import crypto from "crypto";
import { dbRun, dbGet } from "../database/db";
import { requireAppAuth, AuthenticatedRequest } from "../middleware/auth";
import { PaymentService } from "../services/payment.service";
import { providerRegistry } from "../providers";
import { getCheckoutUrl, getAppActiveProviders, getClientAppById } from "../config";

export const checkoutRouter = Router();

// Create a checkout session (Called by SaaS backend)
checkoutRouter.post("/session", requireAppAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const clientApp = req.clientApp!;
    let { amount, currency, returnUrl, cancelUrl, orderId, description, customerEmail, customerName } = req.body;

    if (!amount || !currency || !orderId) {
      return res.status(400).json({ error: "amount, currency, and orderId are required" });
    }

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

// Render the checkout page (Browser)
checkoutRouter.get("/:token", async (req: Request, res: Response) => {
  const token = req.params.token;
  const mode = req.query.mode as string; // 'widget' or undefined

  if (!token || token === 'session' || token === 'pay') {
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

    // Fetch the client app config to get the store name
    const clientApp = await getClientAppById(session.appId);
    const storeName = clientApp ? clientApp.name : session.appId;

    // Fetch active providers configured specifically for THIS site
    const appActiveProviders = await getAppActiveProviders(session.appId);
    const providers: Array<{ id: string; name: string }> = [];

    for (const p of appActiveProviders) {
      const pId = p.providerId || (p as any).providerid || '';
      if (pId) {
        providers.push({
          id: pId,
          name: pId.charAt(0).toUpperCase() + pId.slice(1)
        });
      }
    }

    // Fallback if no providers are active yet so the test UI isn't empty
    if (providers.length === 0) {
      providers.push({ id: 'lomopay', name: 'LomoPay (Non configuré)' });
      providers.push({ id: 'whop', name: 'Whop (Non configuré)' });
    }

    res.render("checkout/index", {
      session,
      storeName,
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
  const { token, provider } = req.body;

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

    // Call PaymentService directly
    const result = await PaymentService.createPayment({
      appId: session.appId || session.appid,
      provider: provider,
      amount: Number(session.amount),
      currency: session.currency || "XOF",
      description: session.description || `Commande #${session.orderId || session.orderid}`,
      orderId: session.orderId || session.orderid,
      customer: {
        email: session.customerEmail || session.customeremail,
        name: session.customerName || session.customername
      },
      returnUrl: returnUrl,
      cancelUrl: cancelUrl || returnUrl
    });

    if (result.success && result.checkoutUrl) {
      // Update session status and provider
      await dbRun("UPDATE checkout_sessions SET provider = ?, status = 'processing' WHERE token = ?", [provider, token]);
      return res.json({ checkoutUrl: result.checkoutUrl });
    } else {
      console.error(`[Checkout Pay] Échec initialisation avec le processeur ${provider}:`, result.error);
      return res.status(400).json({ error: result.error || "Échec de l'initialisation du paiement auprès du processeur" });
    }
  } catch (error: any) {
    console.error("Checkout pay error:", error);
    res.status(500).json({ error: error.message || "Erreur interne lors du paiement" });
  }
});
