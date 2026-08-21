import crypto from "crypto";

export class SignatureService {
  /**
   * Génère une signature HMAC-SHA256 pour sécuriser les webhooks sortants vers vos SaaS
   */
  static signPayload(payload: string | object, secret: string): string {
    const stringified = typeof payload === "string" ? payload : JSON.stringify(payload);
    const hmac = crypto.createHmac("sha256", secret).update(stringified).digest("hex");
    return `sha256=${hmac}`;
  }

  /**
   * Vérifie une signature HMAC-SHA256 en temps constant
   */
  static verifySignature(rawPayload: string, signature: string, secret: string): boolean {
    if (!signature || !secret) return false;

    try {
      const hmac = crypto.createHmac("sha256", secret).update(rawPayload).digest("hex");
      const expectedWithPrefix = `sha256=${hmac}`;
      const received = signature.trim();

      const bufReceived = Buffer.from(received.startsWith("sha256=") ? received : `sha256=${received}`);
      const bufExpected = Buffer.from(expectedWithPrefix);

      if (bufReceived.length !== bufExpected.length) return false;
      return crypto.timingSafeEqual(bufReceived, bufExpected);
    } catch {
      return false;
    }
  }
}
