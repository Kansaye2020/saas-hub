import { CreatePaymentRequest, PaymentProviderType, UnifiedPaymentResponse, UnifiedWebhookPayload } from "../types";

export interface IPaymentProvider {
  readonly name: PaymentProviderType;

  /**
   * Initialise un paiement auprès de la passerelle
   */
  createPayment(request: CreatePaymentRequest): Promise<UnifiedPaymentResponse>;

  /**
   * Vérifie la signature cryptographique du webhook provenant de la passerelle
   */
  verifyWebhookSignature(rawBody: string, headers: Record<string, string | string[] | undefined>): boolean;

  /**
   * Transforme le payload brut du webhook passerelle en payload unifié standard
   */
  parseWebhookEvent(rawBody: string, headers: Record<string, string | string[] | undefined>): Promise<UnifiedWebhookPayload | null>;
}
