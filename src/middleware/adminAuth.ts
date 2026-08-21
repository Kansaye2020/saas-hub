import { Request, Response, NextFunction } from "express";
import { config } from "../config";

export const requireAdminAuth = (req: Request, res: Response, next: NextFunction) => {
  // In a real app, you'd use sessions or JWT.
  // For simplicity, we check a cookie or basic auth.
  // Since we don't have cookies setup yet, we can use a query param or an authorization header.
  // Wait, for a browser-based dashboard, a session cookie is best.
  // If no cookie, redirect to login page.
  
  // Let's implement a very simple basic auth for now, or just check the password in a query param ?
  // Actually, standard HTTP Basic Auth is perfect for this. It prompts the browser's native login modal.
  
  const b64auth = (req.headers.authorization || '').split(' ')[1] || '';
  const [login, password] = Buffer.from(b64auth, 'base64').toString().split(':');

  const adminPassword = process.env.ADMIN_PASSWORD || 'admin';
  const adminUsername = process.env.ADMIN_USERNAME || 'admin';

  if (login && password && login === adminUsername && password === adminPassword) {
    return next();
  }

  res.set('WWW-Authenticate', 'Basic realm="401"');
  res.status(401).send('Authentication required.');
};
