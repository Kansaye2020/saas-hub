import express, { Request, Response } from "express";
import cors from "cors";
import path from "path";
import { config } from "./config";
import { paymentRouter } from "./routes/payment.routes";
import { webhookRouter } from "./routes/webhook.routes";
import { adminRouter } from "./routes/admin.routes";
import { checkoutRouter } from "./routes/checkout.routes";

const app = express();

// Middleware CORS
app.use(cors({ origin: "*" }));

// Middleware JSON avec capture du rawBody requis pour la vérification des signatures HMAC des webhooks
app.use(
  express.json({
    verify: (req: Request, _res: Response, buf: Buffer) => {
      (req as any).rawBody = buf.toString("utf8");
    },
  })
);

app.use(express.urlencoded({ extended: true }));

// Healthcheck
app.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({
    status: "ok",
    service: "saas-payment-hub",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// Setup View Engine
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "../views"));

// Setup static files
app.use("/public", express.static(path.join(__dirname, "../public")));

// Subdomain checkout router middleware (ex: checkout.localhost:4000 ou checkout.mondomaine.com)
app.use((req: Request, _res: Response, next) => {
  const host = req.get("host") || "";
  const hostname = req.hostname || "";

  if (hostname.startsWith("checkout.") || host.startsWith("checkout.")) {
    if (req.path.startsWith("/checkout") || req.path.startsWith("/public") || req.path === "/health") {
      return next();
    }
    if (req.path === "/session" || req.path === "/pay") {
      req.url = `/checkout${req.url}`;
      return next();
    }
    // Token accédé directement à la racine du sous-domaine (ex: checkout.localhost:4000/token123)
    req.url = `/checkout${req.url}`;
    return next();
  }
  next();
});

// Redirections rapides vers l'espace d'administration
app.get("/", (_req: Request, res: Response) => {
  res.redirect("/admin");
});
app.get("/login", (_req: Request, res: Response) => {
  res.redirect("/admin/login");
});

// Routes API
app.use("/api/v1/payments", paymentRouter);
app.use("/webhooks", webhookRouter);
app.use("/admin", adminRouter);
app.use("/checkout", checkoutRouter);

// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: "Route not found" });
});

const PORT = config.port;

app.listen(PORT, () => {
  console.log("==================================================");
  console.log(`🚀 SaaS Payment Hub démarré sur le port ${PORT}`);
  console.log(`🌍 URL de Base: ${config.baseUrl}`);
  console.log("==================================================");
});

export default app;
