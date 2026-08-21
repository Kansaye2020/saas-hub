import { Router } from "express";
import { WebhookController } from "../controllers/webhook.controller";

export const webhookRouter = Router();

// Endpoint pour recevoir les webhooks des passerelles (ex: /webhooks/lomopay, /webhooks/whop, /webhooks/stripe, /webhooks/chariow)
webhookRouter.post("/:provider", WebhookController.handleProviderWebhook);
