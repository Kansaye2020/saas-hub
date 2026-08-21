import { Router, Request, Response } from "express";
import crypto from "crypto";
import { dbRun, dbGet } from "../database/db";
import { requireAppAuth, AuthenticatedRequest } from "../middleware/auth";
import { PaymentService } from "../services/payment.service";
import { providerRegistry } from "../providers";

export const checkoutRouter = Router();

// Create a checkout session (Called by SaaS backend)
checkoutRouter.post("/session", requireAppAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const clientApp = req.clientApp!;
    const { amount, currency, returnUrl, cancelUrl, orderId, description, customerEmail, customerName } = req.body;

    if (!amount || !currency || !orderId) {
      return res.status(400).json({ error: "amount, currency, and orderId are required" });
    }

    const token = crypto.randomBytes(32).toString("hex");

    await dbRun(
      `INSERT INTO checkout_sessions (token, appId, amount, currency, returnUrl, cancelUrl, status, orderId, description, customerEmail, customerName)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [token, clientApp.id, amount, currency, returnUrl, cancelUrl, "pending", orderId, description, customerEmail, customerName]
    );

    const checkoutUrl = `${req.protocol}://${req.get("host")}/checkout/${token}`;

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

    const allProviderIds = providerRegistry.getAvailableProviders();
    const providers = [];

    const { getProviderConfig, getClientAppById } = require("../config");
    
    // Fetch the client app config to get the store name
    const clientApp = await getClientAppById(session.appId);
    const storeName = clientApp ? clientApp.name : session.appId;

    for (const pId of allProviderIds) {
      const pConf = await getProviderConfig(pId);
      if (pConf.isActive) {
        providers.push({
          id: pId,
          name: pId.charAt(0).toUpperCase() + pId.slice(1)
        });
      }
    }

    // Fallback if no providers are active so the test UI isn't empty
    if (providers.length === 0) {
      providers.push({ id: 'lomopay', name: 'Lomopay (Test)' });
      providers.push({ id: 'whop', name: 'Whop (Test)' });
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
      return res.status(404).json({ error: "Session not found" });
    }

    // Call PaymentService directly
    const result = await PaymentService.createPayment({
      appId: session.appId,
      provider: provider,
      amount: session.amount,
      currency: session.currency,
      description: session.description,
      orderId: session.orderId,
      customer: {
        email: session.customerEmail,
        name: session.customerName
      },
      returnUrl: session.returnUrl,
      cancelUrl: session.cancelUrl
    });

    if (result.success) {
      // Update session status and provider
      await dbRun("UPDATE checkout_sessions SET provider = ?, status = 'processing' WHERE token = ?", [provider, token]);
      return res.json({ checkoutUrl: result.checkoutUrl });
    } else {
      return res.status(400).json({ error: result.error });
    }
  } catch (error) {
    console.error("Checkout pay error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
