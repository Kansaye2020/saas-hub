import { Router } from "express";
import { PaymentController } from "../controllers/payment.controller";
import { requireAppAuth } from "../middleware/auth";

export const paymentRouter = Router();

// Création d'une session de paiement / Checkout depuis un SaaS
paymentRouter.post("/create", requireAppAuth, PaymentController.create);
paymentRouter.get("/providers", PaymentController.listProviders);

// Routes publiques pour la page de Checkout hébergée
paymentRouter.get("/checkout/:id", PaymentController.getCheckoutSession);
paymentRouter.post("/checkout/:id/pay", PaymentController.processPayment);
