import { Request, Response, NextFunction } from "express";
import { getClientAppByApiKey } from "../config";
import { ClientAppConfig } from "../types";

export interface AuthenticatedRequest extends Request {
  clientApp?: ClientAppConfig;
}

export function requireAppAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const apiKeyHeader = req.headers["x-hub-api-key"] || req.headers["authorization"];

  if (!apiKeyHeader) {
    return res.status(401).json({
      success: false,
      error: "Authentification requise. Veuillez fournir le header 'X-Hub-Api-Key'.",
    });
  }

  const rawKey = typeof apiKeyHeader === "string" 
    ? apiKeyHeader.replace(/^Bearer\s+/i, "").trim()
    : apiKeyHeader[0];

  const app = getClientAppByApiKey(rawKey);

  if (!app) {
    return res.status(403).json({
      success: false,
      error: "Clé API SaaS invalide ou non reconnue.",
    });
  }

  req.clientApp = app;
  next();
}
