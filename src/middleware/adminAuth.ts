import { Request, Response, NextFunction } from "express";
import crypto from "crypto";

export function parseCookies(cookieHeader?: string): Record<string, string> {
  if (!cookieHeader) return {};
  return cookieHeader.split(';').reduce((res, c) => {
    const [k, v] = c.trim().split('=');
    if (k && v) res[k] = decodeURIComponent(v);
    return res;
  }, {} as Record<string, string>);
}

export function getExpectedSessionToken(): string {
  const adminUsername = process.env.ADMIN_USERNAME || 'admin';
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin';
  return crypto.createHash('sha256').update(`${adminUsername}:${adminPassword}:saas_hub_auth_secret`).digest('hex');
}

export const requireAdminAuth = (req: Request, res: Response, next: NextFunction) => {
  // Allow login and logout routes through
  if (req.path === '/login' || req.path === '/login/' || req.path === '/logout') {
    return next();
  }

  const adminPassword = process.env.ADMIN_PASSWORD || 'admin';
  const adminUsername = process.env.ADMIN_USERNAME || 'admin';

  // 1. Check Cookie Session
  const cookies = parseCookies(req.headers.cookie);
  const expectedToken = getExpectedSessionToken();
  if (cookies.admin_session === expectedToken) {
    return next();
  }

  // 2. Check HTTP Basic Auth (pour scripts, curl, extensions)
  const b64auth = (req.headers.authorization || '').split(' ')[1] || '';
  if (b64auth) {
    try {
      const [login, password] = Buffer.from(b64auth, 'base64').toString().split(':');
      if (login === adminUsername && password === adminPassword) {
        return next();
      }
    } catch {}
  }

  // 3. If request is from a browser, redirect to the friendly login page
  if (req.accepts('html')) {
    return res.redirect('/admin/login');
  }

  res.status(401).json({ error: 'Authentication required. Please login.' });
};
