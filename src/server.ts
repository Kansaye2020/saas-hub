import express, { Request, Response } from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { config } from "./config";
import { paymentRouter } from "./routes/payment.routes";
import { webhookRouter } from "./routes/webhook.routes";
import { adminRouter } from "./routes/admin.routes";

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

// Résolution du dossier public pour l'interface UI
let publicDir = path.join(__dirname, "../public");
if (!fs.existsSync(publicDir)) {
  publicDir = path.join(__dirname, "public");
}
if (!fs.existsSync(publicDir)) {
  publicDir = path.join(process.cwd(), "public");
}

app.use(express.static(publicDir));

// Healthcheck
app.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({
    status: "ok",
    service: "saas-payment-hub",
    uptime: process.uptime(),
    registeredApps: config.clientApps.map((a) => ({ id: a.id, name: a.name })),
    timestamp: new Date().toISOString(),
  });
});

// Routes API
app.use("/api/v1/admin", adminRouter);
app.use("/api/v1/payments", paymentRouter);
app.use("/webhooks", webhookRouter);

// Interface Web (Fallback pour l'UI SPA)
app.get("/", (_req: Request, res: Response) => {
  const indexPath = path.join(publicDir, "index.html");
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(200).json({
      service: "SaaS Payment Hub",
      status: "running",
      adminUi: "Interface public/index.html introuvable",
    });
  }
});

// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: "Route not found" });
});

const PORT = config.port;

app.listen(PORT, () => {
  console.log("==================================================");
  console.log(`🚀 SaaS Payment Hub démarré sur le port ${PORT}`);
  console.log(`🌍 Dashboard UI accessible sur: http://localhost:${PORT}`);
  console.log(`📱 Applications SaaS configurées: ${config.clientApps.length}`);
  config.clientApps.forEach((app) => {
    console.log(`   - [${app.id}] ${app.name} -> Webhook: ${app.webhookUrl || "Non configuré"}`);
  });
  console.log("==================================================");
});

export default app;
