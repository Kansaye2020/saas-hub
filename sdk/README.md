# 📦 SDK d'Intégration Client TypeScript / Node.js

Ce SDK fournit le client officiel [`SaasPaymentClient`](./client.ts) pour intégrer rapidement votre **SaaS Payment Hub** dans vos applications TypeScript / JavaScript (**Next.js, Node.js, Express, Fastify, NestJS, etc.**).

---

## 🚀 1. Installation et Importation

Copiez le fichier [`client.ts`](./client.ts) dans votre projet (par exemple dans `lib/payment-hub.ts` ou `src/services/payment-hub.ts`).

### Initialisation du client

```typescript
import { SaasPaymentClient } from "@/lib/payment-hub";

export const paymentHub = new SaasPaymentClient({
  hubBaseUrl: process.env.PAYMENT_HUB_URL || "http://localhost:4000",
  apiKey: process.env.PAYMENT_HUB_API_KEY!, // Votre sk_hub_...
  webhookSecret: process.env.PAYMENT_HUB_WEBHOOK_SECRET!, // Votre whsec_...
});
```

---

## 💳 2. Créer une Session Checkout Hébergée (`createSession`)

La méthode recommandée pour envoyer vos clients sur le portail hébergé ou ouvrir la modale :

```typescript
const session = await paymentHub.createSession({
  amount: 5000,
  currency: "XOF", // ou "FCFA", "USD", "EUR"
  orderId: `CMD_${Date.now()}`,
  description: "Abonnement Pro 1 Mois",
  customerEmail: "client@example.com",
  customerName: "Jean Dupont",
  returnUrl: "https://monsaas.com/paiement/merci",
  cancelUrl: "https://monsaas.com/tarifs",
});

if (session.success && session.checkoutUrl) {
  // Redirigez l'utilisateur ou renvoyez l'URL au frontend
  console.log("URL de paiement :", session.checkoutUrl);
}
```

---

## 🔍 3. Vérifier le Statut d'une Session en Direct (`getSessionStatus`)

Pour interroger en temps réel l'état d'une session de paiement sans recharger la page :

```typescript
const status = await paymentHub.getSessionStatus(sessionToken);

console.log("Statut :", status.status); // 'pending' | 'processing' | 'succeeded' | 'failed' | 'canceled'
console.log("ID Commande :", status.orderId);
console.log("Processeur utilisé :", status.provider);
```

---

## ⚡ 4. Créer un Paiement Direct Server-to-Server (`createPayment`)

Si vous souhaitez déclencher directement un paiement auprès d'une passerelle spécifique (SasPay, LomoPay, iKeePay, Stripe, Whop, DepiPay) :

```typescript
const payment = await paymentHub.createPayment({
  provider: "saspay", // "saspay" | "lomopay" | "ikeepay" | "whop" | "stripe" | "depipay" | "auto"
  amount: 2500,
  currency: "XOF",
  orderId: "CMD_999",
  description: "Crédits SMS",
  customer: {
    email: "client@example.com",
    name: "Moussa Traoré",
    phone: "2250700000000",
  },
  returnUrl: "https://monsaas.com/succes",
});

if (payment.success) {
  console.log("Paiement initié :", payment.checkoutUrl);
}
```

---

## 💸 5. Retraits Mobile Money (Payouts)

### Via SasPay :
```typescript
const payout = await paymentHub.saspayPayout({
  amount: 10000,
  currency: "XOF",
  country: "CI",
  method: "orange_ci",
  phoneNumber: "2250700000000",
  firstName: "Jean",
  lastName: "Kouassi",
  description: "Gain affilié",
});
```

### Consulter les soldes de portefeuille SasPay :
```typescript
const balances = await paymentHub.saspayBalances();
console.log("Soldes disponibles :", balances);
```

### Via iKeePay :
```typescript
const payout = await paymentHub.ikeepayPayout({
  amount: 5000,
  currency: "XOF",
  country: "CI",
  phoneNumber: "2250700000000",
  operator: "ORANGE",
  orderId: "RETRAIT_101",
});
```

---

## 💳 6. Cartes Virtuelles iKeeCard (`ikeepayCardAction`)

Créer et gérer des cartes virtuelles Visa et Mastercard :

```typescript
// 1. Créer une nouvelle carte
const card = await paymentHub.ikeepayCardAction("create-card", {
  firstName: "Jean",
  lastName: "Dupont",
  email: "jean.dupont@example.com",
  phone: "+2250700000000",
  brand: "MasterCard",
  initialAmountCents: 500, // 5.00 USD
});

// 2. Obtenir les détails d'une carte
const details = await paymentHub.ikeepayCardAction("get-details", {
  cardId: "card_123456",
});

// 3. Recharger ou débiter une carte
const update = await paymentHub.ikeepayCardAction("fund-withdraw", {
  cardId: "card_123456",
  amountCents: 1000,
  action: "fund", // ou "withdraw"
});
```

---

## 🪙 7. Déclencher la Scrutation Crypto DepiPay (`depipayPoll`)

Pour interroger manuellement la blockchain via DepiPay et mettre à jour les transactions en attente :

```typescript
const pollResult = await paymentHub.depipayPoll();
console.log(`${pollResult.count} événement(s) crypto traité(s)`);
```

---

## 📋 8. Lister les Processeurs Actifs (`listProviders`)

```typescript
const { providers } = await paymentHub.listProviders();
console.log("Processeurs activés :", providers); // ex: ['saspay', 'lomopay', 'whop']
```

---

## 🔔 9. Valider la Signature des Webhooks (`verifyWebhook`)

Dans votre gestionnaire d'API de webhook (Next.js, Express, etc.) :

```typescript
// Exemple Next.js App Router (app/api/webhooks/payment/route.ts)
import { NextResponse } from "next/server";
import { paymentHub, UnifiedWebhookEvent } from "@/lib/payment-hub";

export async function POST(req: Request) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-hub-signature");

  // 1. Vérification cryptographique de l'authenticité
  const isValid = paymentHub.verifyWebhook(rawBody, signature);
  if (!isValid) {
    return NextResponse.json({ error: "Signature invalide" }, { status: 401 });
  }

  // 2. Traitement du webhook typé
  const event: UnifiedWebhookEvent = JSON.parse(rawBody);

  if (event.event === "payment.succeeded") {
    console.log(`Paiement reçu : Commande ${event.orderId} - ${event.amount} ${event.currency}`);
    // Valider la commande dans votre base de données
  }

  return NextResponse.json({ received: true });
}
```
