export type PaymentProviderType = "lomopay" | "whop" | "stripe" | "chariow" | "ikeepay";

export type PaymentStatus = "pending" | "completed" | "failed" | "canceled";

export interface CustomerInfo {
  email?: string;
  name?: string;
  phone?: string;
}

export interface ClientAppConfig {
  id: string;
  name: string;
  apiKey: string;
  webhookUrl: string;
  webhookSecret: string;
  returnUrl?: string;
  cancelUrl?: string;
  logoUrl?: string;
}

export interface CreatePaymentRequest {
  appId: string;
  provider: PaymentProviderType | "auto";
  amount: number;
  currency?: string; // Defaut "XOF" ou "USD" selon le provider
  description?: string;
  orderId: string; // ID unique de la transaction générée par votre SaaS
  customer?: CustomerInfo;
  returnUrl: string;
  cancelUrl?: string;
  metadata?: Record<string, any>;
}

export interface UnifiedPaymentResponse {
  success: boolean;
  paymentId?: string;
  orderId?: string;
  checkoutUrl?: string;
  provider?: PaymentProviderType;
  status?: PaymentStatus;
  rawProviderData?: any;
  error?: string;
}

export type WebhookEventType = 
  | "payment.succeeded" 
  | "payment.failed" 
  | "payment.canceled";

export interface UnifiedWebhookPayload {
  event: WebhookEventType;
  appId: string;
  paymentId: string;
  orderId: string;
  provider: PaymentProviderType;
  amount: number;
  currency: string;
  customer?: CustomerInfo;
  metadata?: Record<string, any>;
  providerTransactionId?: string;
  timestamp: number;
}
