import { Router } from "express";
import { PaymentController } from "../controllers/payment.controller";
import { requireAppAuth } from "../middleware/auth";

export const paymentRouter = Router();

paymentRouter.post("/create", requireAppAuth, PaymentController.create);
paymentRouter.get("/providers", requireAppAuth, PaymentController.listProviders);
paymentRouter.post("/ikeepay/payout", requireAppAuth, PaymentController.ikeepayPayout);
paymentRouter.post("/ikeepay/card", requireAppAuth, PaymentController.ikeepayCardAction);
paymentRouter.post("/saspay/payout", requireAppAuth, PaymentController.saspayPayout);
paymentRouter.get("/saspay/balances", requireAppAuth, PaymentController.saspayBalances);
