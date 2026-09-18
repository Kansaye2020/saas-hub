import { Wallet, sha256, toUtf8Bytes } from "ethers";
import { IPaymentProvider } from "./base";
import { CreatePaymentRequest, UnifiedPaymentResponse, UnifiedWebhookPayload } from "../types";
import { getAppProviderConfig } from "../config";

export interface DepiPayExtraConfig {
  network?: string;
  chainId?: number;
  acceptedTokens?: string[];
  deadlineSecs?: number;
  xofToUsdRate?: number;
  apiUrl?: string;
}

export class DepiPayProvider implements IPaymentProvider {
  readonly name = "depipay" as const;
  readonly API_BASE_URL = "https://api.depipay.com";

  /**
   * Formate une clé privée secp256k1 (ajoute 0x si manquant)
   */
  private formatPrivateKey(key: string): string {
    const trimmed = key.trim();
    if (!trimmed.startsWith("0x") && trimmed.length === 64) {
      return `0x${trimmed}`;
    }
    return trimmed;
  }

  /**
   * Obtient le wallet Ethereum/secp256k1 pour signer les requêtes
   */
  private getWallet(privateKey: string): Wallet {
    const formatted = this.formatPrivateKey(privateKey);
    try {
      return new Wallet(formatted);
    } catch (err: any) {
      throw new Error(`Clé privée DepiPay invalide: ${err.message || err}`);
    }
  }

  /**
   * Signe une requête pour l'API DepiPay selon la spécification EIP-191 :
   * sess:{nonce}:{sha256(body)}
   */
  private async signRequest(wallet: Wallet, body: string): Promise<{ nonce: number; signature: string }> {
    const nonce = Date.now();
    let bodyHash: string;

    if (body && body.length > 0) {
      bodyHash = sha256(toUtf8Bytes(body)).slice(2);
    } else {
      // Hash SHA-256 de chaîne vide pour les requêtes sans corps (/poll/events)
      bodyHash = sha256(toUtf8Bytes("")).slice(2);
    }

    const message = `sess:${nonce}:${bodyHash}`;
    const signature = await wallet.signMessage(message);

    return { nonce, signature };
  }

  /**
   * Crée une facture (Invoice) DepiPay pour recevoir un paiement crypto
   */
  async createPayment(request: CreatePaymentRequest): Promise<UnifiedPaymentResponse> {
    try {
      const { secretKey, extraConfig } = await getAppProviderConfig(request.appId, this.name);

      if (!secretKey) {
        return {
          success: false,
          error: `DepiPay : Clé privée de session (SESSION_PRIVATE_KEY) non configurée pour le site "${request.appId}". Renseignez-la dans l'onglet Processeurs de ce site.`
        };
      }

      const wallet = this.getWallet(secretKey);
      const conf: DepiPayExtraConfig = typeof extraConfig === "string" ? JSON.parse(extraConfig || "{}") : (extraConfig || {});

      // Détermination intelligente du réseau et tokens acceptés
      const network = (request.metadata?.network || conf.network || "").toLowerCase().trim();
      let chainId = Number(request.metadata?.chainId || conf.chainId || 0);

      if (!chainId) {
        if (network === "ethereum" || network === "eth" || network === "erc20") {
          chainId = 1;
        } else if (network === "polygon" || network === "matic") {
          chainId = 137;
        } else {
          // Par défaut : BNB Smart Chain (BSC - chainId 56) pour des frais minimes (<0.10$)
          chainId = 56;
        }
      }
      
      // Tokens par défaut selon la blockchain
      let defaultTokens: string[];
      if (network === "tron" || network === "trc20") {
        defaultTokens = ["tron:TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"];
      } else if (chainId === 56) {
        // BSC (BNB Smart Chain) : USDT BEP-20
        defaultTokens = [
          "56:0x55d398326f99059ff775485246999027b3197955",
          "56:0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d"
        ];
      } else if (chainId === 137) {
        // Polygon : USDT
        defaultTokens = ["137:0xc2132d05d31c914a87c6611c10748aeb04b58e8f"];
      } else {
        // Ethereum Mainnet (chainId 1) : USDT ERC-20
        defaultTokens = ["1:0xdac17f958d2ee523a2206206994597c13d831ec7"];
      }

      const acceptedTokens: string[] = request.metadata?.acceptedTokens || conf.acceptedTokens || defaultTokens;
      const deadlineSecs = Number(request.metadata?.deadlineSecs || conf.deadlineSecs || 86400); // 24 heures par défaut

      // Conversion de devise si nécessaire (ex: XOF -> USD)
      const originalCurrency = (request.currency || "USD").toUpperCase();
      let cryptoValue: string;

      if (["XOF", "XAF", "FCFA", "CFA"].includes(originalCurrency)) {
        const xofRate = conf.xofToUsdRate || 655.957;
        const usdVal = Math.max(1, Math.round((Number(request.amount) / xofRate) * 100) / 100);
        cryptoValue = usdVal.toFixed(2);
      } else {
        cryptoValue = Number(request.amount).toFixed(2);
      }

      const payload = {
        value: cryptoValue,
        chainId: chainId,
        description: request.description || `Commande #${request.orderId}`,
        acceptedTokens: acceptedTokens,
        deadlineSecs: deadlineSecs,
        data: {
          appId: request.appId,
          orderId: request.orderId,
          originalAmount: request.amount,
          originalCurrency: originalCurrency,
          customerEmail: request.customer?.email,
          customerName: request.customer?.name,
          ...(request.metadata || {})
        }
      };

      const bodyStr = JSON.stringify(payload);
      const { nonce, signature } = await this.signRequest(wallet, bodyStr);

      const apiUrl = conf.apiUrl || this.API_BASE_URL;
      console.log(`[DepiPay] Création d'invoice pour ${request.appId} (${cryptoValue} USD/Crypto sur chain ${chainId})...`);

      const response = await fetch(`${apiUrl}/invoice`, {
        method: "POST",
        headers: {
          "x-session-nonce": String(nonce),
          "x-session-signature": signature,
          "x-encryption": "none",
          "Content-Type": "application/json",
        },
        body: bodyStr,
      });

      const rawText = await response.text();
      let resData: any;
      try {
        resData = JSON.parse(rawText);
      } catch {
        console.error("[DepiPay] Réponse non-JSON:", rawText);
        return {
          success: false,
          error: `Réponse inattendue de DepiPay (Code HTTP ${response.status}): ${rawText.substring(0, 200)}`
        };
      }

      if (!response.ok || (!resData.guid && !resData.paymentUrl)) {
        console.error("[DepiPay] Erreur création invoice:", resData);
        return {
          success: false,
          error: resData.error || resData.message || `Erreur API DepiPay (${response.status})`
        };
      }

      console.log(`[DepiPay] Invoice créée avec succès : ${resData.guid} -> ${resData.paymentUrl}`);

      return {
        success: true,
        paymentId: resData.guid,
        orderId: request.orderId,
        checkoutUrl: resData.paymentUrl,
        provider: this.name,
        status: "pending",
        rawProviderData: resData
      };
    } catch (error: any) {
      console.error("[DepiPay] Exception lors de la création du paiement:", error);
      return {
        success: false,
        error: `Erreur DepiPay: ${error.message || error}`
      };
    }
  }

  /**
   * Récupère et vide les événements en attente pour un marchand donné via /poll/events
   */
  async pollEvents(appId: string, secretKeyOverride?: string): Promise<any[]> {
    let secretKey = secretKeyOverride;
    if (!secretKey) {
      const providerConfig = await getAppProviderConfig(appId, this.name);
      secretKey = providerConfig.secretKey;
    }

    if (!secretKey) {
      return [];
    }

    const wallet = this.getWallet(secretKey);
    const { nonce, signature } = await this.signRequest(wallet, "");

    const response = await fetch(`${this.API_BASE_URL}/poll/events`, {
      method: "POST",
      headers: {
        "x-session-nonce": String(nonce),
        "x-session-signature": signature,
        "x-encryption": "none",
      },
    });

    if (!response.ok) {
      const errText = await response.text();
      console.warn(`[DepiPay] Échec /poll/events pour ${appId} (HTTP ${response.status}):`, errText);
      return [];
    }

    const data = await response.json();
    return Array.isArray(data.events) ? data.events : [];
  }

  /**
   * Vérifie la signature d'un webhook entrant
   */
  async verifyWebhookSignature(_rawBody: string, _headers: Record<string, string | string[] | undefined>): Promise<boolean> {
    // DepiPay communique principalement via /poll/events tiré par le serveur.
    // Si un relais webhook ou forwarder externe envoie un POST, on l'accepte.
    return true;
  }

  /**
   * Transforme le payload de facture DepiPay en événement unifié
   */
  async parseWebhookEvent(rawBody: string, _headers: Record<string, string | string[] | undefined>): Promise<UnifiedWebhookPayload | null> {
    let body: any;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return null;
    }

    // Supporte soit un événement unique (invoice), soit un wrapper avec { events: [...] }
    const invoice = Array.isArray(body.events) ? body.events[0] : body;
    if (!invoice || !invoice.guid) {
      return null;
    }

    const status = invoice.status;
    let eventType: "payment.succeeded" | "payment.failed" | "payment.canceled";

    if (status === "paid") {
      eventType = "payment.succeeded";
    } else if (status === "expired") {
      eventType = "payment.failed";
    } else if (status === "canceled") {
      eventType = "payment.canceled";
    } else {
      // Événement d'étape intermédiaire ('init', 'partialPaid', etc.) non finalisé
      return null;
    }

    const data = invoice.data || {};
    const appId = data.appId || "verifsms";
    const orderId = data.orderId || invoice.guid;
    const amount = data.originalAmount ? Number(data.originalAmount) : Number(invoice.paidAmount || invoice.value || 0);
    const currency = data.originalCurrency || "USDT";

    const payments = Array.isArray(invoice.payments) ? invoice.payments : [];
    const firstPayment = payments[0] || {};
    const txHash = firstPayment.txHash || invoice.guid;

    return {
      event: eventType,
      appId,
      paymentId: invoice.guid,
      orderId,
      provider: this.name,
      amount,
      currency,
      customer: {
        email: data.customerEmail,
        name: data.customerName,
      },
      providerTransactionId: txHash,
      metadata: invoice,
      timestamp: Date.now()
    };
  }
}
