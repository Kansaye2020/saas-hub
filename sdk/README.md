# 📦 SDK d'Intégration Client Multi-SaaS

Ce SDK vous permet de connecter n'importe lequel de vos projets SaaS à votre **SaaS Payment Hub** en quelques lignes de code.

---

## 🚀 1. Utilisation dans un projet Next.js / Node.js

Copiez simplement le fichier [`client.ts`](./client.ts) dans votre projet SaaS (ex: dans `lib/payment-hub.ts`).

### Initialisation du client

```typescript
import { SaasPaymentClient } from "@/lib/payment-hub";

export const paymentClient = new SaasPaymentClient({
  hubBaseUrl: process.env.PAYMENT_HUB_URL || "https://pay.votredomaine.com",
  apiKey: process.env.PAYMENT_HUB_API_KEY || "votre_cle_api_saas",
  webhookSecret: process.env.PAYMENT_HUB_WEBHOOK_SECRET || "votre_secret_webhook",
});
```

---

## 💳 2. Initier un Paiement (API Route dans votre SaaS)

Dans votre route d'API (ex: `app/api/checkout/route.ts`) :

```typescript
import { NextResponse } from "next/server";
import { paymentClient } from "@/lib/payment-hub";

export async function POST(req: Request) {
  const { amount, packId, userEmail, userName } = await req.json();

  // Création de votre transaction locale dans votre BDD (Prisma, etc.)
  const localTransaction = await db.transaction.create({
    data: { amount, status: "PENDING", ... }
  });

  // Appel au Hub Unifié
  const payment = await paymentClient.createPayment({
    provider: "lomopay", // ou "whop", "stripe", "chariow", ou "auto"
    amount: amount,
    currency: "XOF",
    orderId: localTransaction.id,
    description: `Achat Pack ${packId}`,
    returnUrl: "https://monsaas.com/dashboard/billing?status=success",
    customer: {
      email: userEmail,
      name: userName,
    },
    metadata: {
      packId,
    },
  });

  if (!payment.success || !payment.checkoutUrl) {
    return NextResponse.json({ error: payment.error }, { status: 400 });
  }

  // Renvoyer l'URL de paiement à votre frontend
  return NextResponse.json({ checkoutUrl: payment.checkoutUrl });
}
```

---

## 🔔 3. Recevoir le Webhook Unifié dans votre SaaS

Créez une seule route de webhook dans votre SaaS (ex: `app/api/webhooks/payment/route.ts`) :

```typescript
import { NextResponse } from "next/server";
import { paymentClient, UnifiedWebhookEvent } from "@/lib/payment-hub";

export async function POST(req: Request) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-hub-signature");

  // 1. Vérification sécurisée de la signature envoyée par le Hub
  const isValid = paymentClient.verifyWebhook(rawBody, signature);
  if (!isValid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const event: UnifiedWebhookEvent = JSON.parse(rawBody);

  // 2. Traitement du paiement réussi
  if (event.event === "payment.succeeded") {
    const { orderId, amount, provider } = event;

    // Mettre à jour votre BDD
    await db.transaction.update({
      where: { id: orderId },
      data: { status: "COMPLETED" },
    });

    await db.user.update({
      where: { id: userId },
      data: { balance: { increment: amount } },
    });
  }

  return NextResponse.json({ received: true });
}
```
