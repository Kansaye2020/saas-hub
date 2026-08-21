import { Router } from "express";
import { PaymentController } from "../controllers/payment.controller";
import { requireAppAuth } from "../middleware/auth";

export const paymentRouter = Router();

paymentRouter.post("/create", requireAppAuth, PaymentController.create);
paymentRouter.get("/providers", requireAppAuth, PaymentController.listProviders);
