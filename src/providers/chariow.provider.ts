import { IPaymentProvider } from "./base";
import { CreatePaymentRequest, UnifiedPaymentResponse, UnifiedWebhookPayload } from "../types";
import { config } from "../config";

export class ChariowProvider implements IPaymentProvider {
  readonly name = "chariow" as const;

  async createPayment(request: CreatePaymentRequest): Promise<UnifiedPaymentResponse> {
    const { secretKey, publicKey } = config.chariow;

    if (!secretKey) {
      throw new Error("CHARIOW_SECRET_KEY non configuré.");
    }

    // Structure Chariow standard
    return {
      success: true,
      paymentId: `chariow_${Date.now()}`,
      orderId: request.orderId,
      checkoutUrl: `https://chariow.com/pay?appId=${request.appId}&orderId=${request.orderId}&amount=${request.amount}`,
      provider: this.name,
      status: "pending",
    };
  }

  verifyWebhookSignature(_rawBody: string, _headers: Record<string, string | string[] | undefined>): boolean {
    return true;
  }

  async parseWebhookEvent(rawBody: string, _headers: Record<string, string | string[] | undefined>): Promise<UnifiedWebhookPayload | null> {
    const body = JSON.parse(rawBody);

    const isSuccess = body.status === "SUCCESS" || body.status === "completed";
    const transactionId = body.transactionId || body.id;
    const chariowId = body.chariowId || body.reference;

    let appId = "verifsms";
    let orderId = transactionId;
    if (transactionId && transactionId.includes(":::")) {
      const parts = transactionId.split(":::");
      appId = parts[0];
      orderId = parts[1];
    }

    return {
      event: isSuccess ? "payment.succeeded" : "payment.failed",
      appId,
      paymentId: chariowId || transactionId,
      orderId,
      provider: this.name,
      amount: Number(body.amount || 0),
      currency: body.currency || "XOF",
      customer: {
        email: body.email,
        name: body.name,
      },
      providerTransactionId: chariowId,
      metadata: body,
      timestamp: Date.now(),
    };
  }
}
