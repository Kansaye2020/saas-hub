import { IPaymentProvider } from "./base";
import { CreatePaymentRequest, UnifiedPaymentResponse, UnifiedWebhookPayload } from "../types";
import { config, getAppProviderConfig } from "../config";

export class WhopProvider implements IPaymentProvider {
  readonly name = "whop" as const;

  async createPayment(request: CreatePaymentRequest): Promise<UnifiedPaymentResponse> {
    const providerConfig = await getAppProviderConfig(request.appId, this.name);
    const companyId = providerConfig.publicKey;
    const apiKey = providerConfig.secretKey;
    const extraConfig = providerConfig.extraConfig || {};
    const isSandbox = Boolean(extraConfig?.isSandbox || extraConfig?.sandbox);

    if (!apiKey || !companyId) {
      return {
        success: false,
        error: `Whop : Company ID ou API Key non configurés pour le site "${request.appId}". Veuillez les renseigner dans l'onglet Processeurs de ce site.`
      };
    }

    // Normalisation de la devise et conversion USD si nécessaire
    let currency = (request.currency || "XOF").toUpperCase();
    if (currency === "FCFA" || currency === "CFA") currency = "XOF";

    let amountUSD = Number(request.amount);
    if (currency === "XOF" || currency === "XAF") {
      amountUSD = Math.max(1, Number((request.amount / 600).toFixed(2)));
    } else if (currency === "EUR") {
      amountUSD = Number((request.amount * 1.08).toFixed(2));
    }

    // Détermination des moyens de paiement souhaités
    // 1. Paramètre de la requête dynamique (si un appel API spécifie ses propres moyens)
    // 2. Ou configuration enregistrée pour le site
    const requestedMethods =
      (request as any).paymentMethods ||
      (request as any).payment_methods ||
      request.metadata?.paymentMethods ||
      request.metadata?.payment_methods;

    const isCustomMode =
      extraConfig.allPaymentMethods === false ||
      extraConfig.allPaymentMethods === "false" ||
      extraConfig.allPaymentMethods === 0 ||
      extraConfig.allPaymentMethods === "0";

    let allPaymentMethods = !isCustomMode;
    let enabledMethods: string[] = [];

    let rawMethods = extraConfig.enabledPaymentMethods;
    if (typeof rawMethods === "string") {
      try {
        const parsed = JSON.parse(rawMethods);
        if (Array.isArray(parsed)) rawMethods = parsed;
      } catch (e) {
        rawMethods = rawMethods.split(",").map((m: string) => m.trim()).filter(Boolean);
      }
    }

    if (requestedMethods) {
      if (Array.isArray(requestedMethods)) {
        enabledMethods = requestedMethods;
        allPaymentMethods = false;
      } else if (typeof requestedMethods === "string") {
        if (requestedMethods.toLowerCase() === "all" || requestedMethods.trim() === "*") {
          allPaymentMethods = true;
          enabledMethods = [];
        } else {
          enabledMethods = requestedMethods.split(",").map((m: string) => m.trim().toLowerCase()).filter(Boolean);
          allPaymentMethods = false;
        }
      }
    } else if (isCustomMode && Array.isArray(rawMethods)) {
      enabledMethods = rawMethods.map((m: any) => String(m).trim().toLowerCase()).filter(Boolean);
      allPaymentMethods = false;
    }

    // Tous les types de moyens de paiement standards supportés par Whop
    const ALL_WHOP_METHODS = [
      "card",
      "apple_pay",
      "google_pay",
      "crypto",
      "coinbase",
      "coinflow",
      "us_bank_account",
      "sepa_debit",
      "paypal",
      "cashapp"
    ];

    // Mapping des méthodes utilisateur vers les identifiants techniques Whop (conformes OpenAPI PaymentMethodTypes)
    const methodAliases: Record<string, string[]> = {
      card: ["card", "apple_pay", "google_pay"],
      cards: ["card", "apple_pay", "google_pay"],
      credit_card: ["card", "apple_pay", "google_pay"],
      crypto: ["crypto", "coinbase", "coinflow"],
      cryptocurrency: ["crypto", "coinbase", "coinflow"],
      ach: ["us_bank_account"],
      ach_debit: ["us_bank_account"],
      us_bank_account: ["us_bank_account"],
      sepa: ["sepa_debit"],
      sepa_debit: ["sepa_debit"],
      paypal: ["paypal"],
      cashapp: ["cashapp"],
      cash_app: ["cashapp"],
    };

    let whopMethods: string[] = [];
    if (!allPaymentMethods && enabledMethods.length > 0) {
      for (const m of enabledMethods) {
        if (methodAliases[m]) {
          whopMethods.push(...methodAliases[m]);
        } else {
          whopMethods.push(m);
        }
      }
      whopMethods = Array.from(new Set(whopMethods));
    }

    // Calcul des méthodes explicitement désactivées
    const disabledMethods = ALL_WHOP_METHODS.filter((m) => !whopMethods.includes(m));

    const apiBaseUrl = isSandbox
      ? "https://sandbox-api.whop.com/api/v1/checkout_configurations"
      : "https://api.whop.com/api/v1/checkout_configurations";

    const customerEmail = request.customer?.email || (request as any).customerEmail || (request as any).email;
    const customerName = request.customer?.name || (request as any).customerName || (request as any).name;

    try {
      const methodsLabel = allPaymentMethods
        ? "Tous les moyens autorisés"
        : `Moyens autorisés: [${whopMethods.join(", ")}], Désactivés: [${disabledMethods.join(", ")}]`;
      console.log(`[Whop] Envoi de la requête pour ${request.appId}: ${amountUSD} USD (${methodsLabel}, Client: ${customerEmail || 'anonyme'})`);

      const whopPayload: any = {
        redirect_url: request.returnUrl,
        metadata: {
          appId: request.appId,
          orderId: request.orderId,
          customerEmail: customerEmail || "",
          customerName: customerName || "",
          email: customerEmail || "",
          name: customerName || "",
          originalAmount: request.amount.toString(),
          originalCurrency: request.currency || "XOF",
          allPaymentMethods: String(allPaymentMethods),
          ...(whopMethods.length > 0 ? { allowedPaymentMethods: whopMethods.join(",") } : {}),
          ...(request.metadata || {}),
        },
      };

      if (extraConfig.planId && typeof extraConfig.planId === "string" && extraConfig.planId.trim()) {
        whopPayload.plan_id = extraConfig.planId.trim();
      } else {
        whopPayload.plan = {
          company_id: companyId.trim(),
          initial_price: amountUSD,
          plan_type: "one_time",
          currency: "usd",
        };

        if (!allPaymentMethods && whopMethods.length > 0) {
          // Selon la doc OpenAPI Whop, les champs 'enabled' et 'disabled' sont tous deux obligatoires
          whopPayload.plan.payment_method_configuration = {
            enabled: whopMethods,
            disabled: disabledMethods,
            include_platform_defaults: false,
          };
        }
      }

      let response = await fetch(apiBaseUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey.trim()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(whopPayload),
      });

      // Si Whop rejette avec include_platform_defaults: false, tenter avec include_platform_defaults: true et disabled explicite
      if (!response.ok && !allPaymentMethods && whopPayload.plan?.payment_method_configuration?.include_platform_defaults === false) {
        const errorCloned = await response.clone().text();
        console.warn(`[Whop] Whop API note (${response.status}: ${errorCloned.substring(0, 150)}). Réessai avec include_platform_defaults: true...`);
        whopPayload.plan.payment_method_configuration = {
          enabled: whopMethods,
          disabled: disabledMethods,
          include_platform_defaults: true,
        };
        response = await fetch(apiBaseUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey.trim()}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(whopPayload),
        });
      }

      // Repli ultime sans faire échouer la vente si le compte Whop du marchand n'a pas accès à la personnalisation des plans
      if (!response.ok && !allPaymentMethods && whopPayload.plan?.payment_method_configuration) {
        const errorCloned = await response.clone().text();
        console.warn(`[Whop] L'API Whop ne permet pas la personnalisation des méthodes sur ce compte (${response.status}: ${errorCloned.substring(0, 150)}). Repli standard...`);
        delete whopPayload.plan.payment_method_configuration;
        response = await fetch(apiBaseUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey.trim()}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(whopPayload),
        });
      }

      if (!response.ok) {
        const errorText = await response.text();
        console.error("[Whop] Erreur API:", response.status, errorText);
        return {
          success: false,
          error: `Erreur API Whop (${response.status}): ${errorText.substring(0, 200)}`,
        };
      }

      const checkoutConfig: any = await response.json();
      const baseCheckoutUrl = isSandbox
        ? "https://sandbox.whop.com/checkout"
        : "https://whop.com/checkout";

      let paymentUrl = checkoutConfig.purchase_url || checkoutConfig.url || `${baseCheckoutUrl}/${checkoutConfig.id}`;

      // Si des méthodes restreintes sont sélectionnées, ajouter en query parameter pour guider la page Whop
      if (!allPaymentMethods && whopMethods.length > 0) {
        const sep = paymentUrl.includes("?") ? "&" : "?";
        paymentUrl += `${sep}payment_methods=${encodeURIComponent(whopMethods.join(","))}&methods=${encodeURIComponent(whopMethods.join(","))}`;
      }

      // Transmission directe de l'email et masquage du champ email sur la page Whop
      if (customerEmail) {
        const separator = paymentUrl.includes("?") ? "&" : "?";
        paymentUrl += `${separator}email=${encodeURIComponent(customerEmail)}&email.hidden=1&email.disabled=1`;
        if (customerName) {
          paymentUrl += `&name=${encodeURIComponent(customerName)}`;
        }
      }

      return {
        success: true,
        paymentId: checkoutConfig.id,
        orderId: request.orderId,
        checkoutUrl: paymentUrl,
        provider: this.name,
        status: "pending",
        rawProviderData: checkoutConfig,
      };
    } catch (networkError: any) {
      console.error("[Whop] Erreur réseau / API:", networkError);
      return {
        success: false,
        error: `Erreur de connexion à l'API Whop: ${networkError.message || networkError}`
      };
    }
  }

  async verifyWebhookSignature(_rawBody: string, _headers: Record<string, string | string[] | undefined>): Promise<boolean> {
    return true;
  }

  async parseWebhookEvent(rawBody: string, _headers: Record<string, string | string[] | undefined>): Promise<UnifiedWebhookPayload | null> {
    const body = JSON.parse(rawBody);

    if (body.type !== "payment.succeeded" && body.action !== "payment.succeeded") {
      return null;
    }

    const paymentData = body.data || body;
    const metadata = paymentData.metadata || {};
    const appId = metadata.appId || "verifsms";
    const orderId = metadata.orderId || paymentData.id;
    const providerTransactionId = paymentData.id;

    const originalAmount = metadata.originalAmount ? Number(metadata.originalAmount) : (paymentData.amount || 0);
    const originalCurrency = metadata.originalCurrency || "USD";

    const user = paymentData.user || paymentData.customer || {};
    const member = paymentData.member || {};

    const customerEmail = 
      paymentData.customer_email ||
      paymentData.email ||
      user.email ||
      member.email ||
      metadata.customerEmail ||
      metadata.email ||
      metadata.userEmail ||
      undefined;

    const customerName =
      paymentData.customer_name ||
      paymentData.name ||
      user.name ||
      user.username ||
      member.name ||
      metadata.customerName ||
      metadata.name ||
      metadata.userName ||
      undefined;

    return {
      event: "payment.succeeded",
      appId,
      paymentId: providerTransactionId,
      orderId,
      provider: this.name,
      amount: originalAmount,
      currency: originalCurrency,
      customer: {
        email: customerEmail,
        name: customerName,
      },
      providerTransactionId,
      metadata,
      timestamp: Date.now(),
    };
  }
}
