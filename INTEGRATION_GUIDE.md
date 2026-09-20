# 📚 Guide d'Intégration Complet du SaaS Payment Hub

Bienvenue dans le guide d'intégration officiel du **SaaS Payment Hub**. Ce document vous guide pas-à-pas pour connecter vos applications (**Next.js, React, Node.js, PHP/Laravel, Python/Django, WordPress, etc.**) à votre Hub de paiement en quelques minutes.

---

## 📑 Table des Matières

1. [🧭 Le Fonctionnement en 3 Étapes](#-le-fonctionnement-en-3-étapes)
2. [🔑 Étape 1 : Récupérer vos identifiants sur le Hub](#-étape-1--récupérer-vos-identifiants-sur-le-hub)
3. [💻 Étape 2 : Initier un Paiement depuis votre SaaS](#-étape-2--initier-un-paiement-depuis-votre-saas)
   - [Option A : Next.js 13/14/15 (App Router & Pages Router)](#option-a--nextjs-131415-app-router--pages-router)
   - [Option B : Node.js / Express](#option-b--nodejs--express)
   - [Option C : PHP & Laravel](#option-c--php--laravel)
   - [Option D : Python (FastAPI & Django)](#option-d--python-fastapi--django)
   - [Option E : Appel cURL direct](#option-e--appel-curl-direct)
4. [🎨 Option Pop-up In-App (Widget SDK sans rechargement de page)](#-option-pop-up-in-app-widget-sdk-sans-rechargement-de-page)
5. [🔔 Étape 3 : Traiter le Webhook de Confirmation (Validation automatique)](#-étape-3--traiter-le-webhook-de-confirmation-validation-automatique)
   - [Vérification HMAC en Next.js (App Router)](#vérification-hmac-en-nextjs-app-router)
   - [Vérification HMAC en Node.js / Express](#vérification-hmac-en-nodejs--express)
   - [Vérification HMAC en PHP / Laravel](#vérification-hmac-en-php--laravel)
   - [Vérification HMAC en Python (FastAPI)](#vérification-hmac-en-python-fastapi)
6. [⚡ Guides Spécifiques par Passerelle](#-guides-spécifiques-par-passerelle)
   - [🚀 SasPay (Mobile Money & Cartes Afrique)](#-saspay-saspayme)
   - [📱 LomoPay (Mobile Money XOF/XAF)](#-lomopay)
   - [⚡ iKeePay (Inline Checkout, Payin, Payouts & Cartes Virtuelles)](#-ikeepay)
   - [💳 Whop (Cartes Internationales, Apple Pay, Crypto, ACH)](#-whop)
   - [💳 Stripe (Cartes Bancaires Directes)](#-stripe)
   - [🪙 DepiPay (Crypto Décentralisée USDT/USDC)](#-depipay-depipaycom)
   - [🔄 Chariow](#-chariow)
7. [🎯 Récapitulatif Complet des Endpoints API](#-récapitulatif-complet-des-endpoints-api)

---

## 🧭 Le Fonctionnement en 3 Étapes

```text
[ Votre Site / SaaS ]                   [ SaaS Payment Hub ]                   [ Client / Navigateur ]
         │                                       │                                       │
  1. Crée la session (POST /checkout/session)   │                                       │
         ├──────────────────────────────────────>│                                       │
         │<──────────────────────────────────────┤                                       │
         │  Renvoie { checkoutUrl, token }       │                                       │
         │                                       │                                       │
  2. Redirige le client vers checkoutUrl ────────┼──────────────────────────────────────>│
     (ou ouvre le Widget Pop-up)                 │                                       │
         │                                       │   Le client choisit son moyen         │
         │                                       │   (Wave, OM, Carte, Crypto)           │
         │                                       │<──────────────────────────────────────┤
         │                                       │                                       │
  3. Reçoit le Webhook (Paiement Validé)         │   Redirige vers returnUrl ───────────>│
         │<──────────────────────────────────────┤   (ou ferme la pop-up instantanément) │
         │  (Crédite le solde ou valide la com.) │                                       │
```

---

## 🔑 Étape 1 : Récupérer vos identifiants sur le Hub

1. Connectez-vous à votre Hub d'administration : `http://localhost:4000/admin` (ou `https://checkout.votredomaine.com/admin`).
2. Cliquez sur votre site ou créez-en un nouveau (ex: `verifsms`, `mon-saas`).
3. Dans l'onglet **"⚙️ Clés API & Webhook"**, copiez :
   - **`X-Hub-Api-Key`** : Votre clé API secrète (ex: `sk_hub_abcdef123456...`).
   - **`Secret Webhook`** : Votre clé secrète de webhook pour vérifier la signature des événements (ex: `whsec_987654...`).
   - **`Return URL`** : L'URL de redirection après succès (ex: `https://monsaas.com/dashboard/merci`).
   - **`Cancel URL`** : L'URL de redirection en cas d'abandon (ex: `https://monsaas.com/tarifs`).

---

## 💻 Étape 2 : Initier un Paiement depuis votre SaaS

### Option A : Next.js 13/14/15 (App Router & Pages Router)

#### 1. Route Backend (`app/api/checkout/route.ts`) :
```typescript
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { amount, packId, customerEmail, customerName } = await req.json();

    const hubBaseUrl = process.env.PAYMENT_HUB_URL || "http://localhost:4000";
    const apiKey = process.env.PAYMENT_HUB_API_KEY!; // Votre sk_hub_...

    const response = await fetch(`${hubBaseUrl}/checkout/session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Hub-Api-Key": apiKey,
      },
      body: JSON.stringify({
        amount: amount, // Ex: 5000
        currency: "FCFA", // ou "XOF", "USD", "EUR"
        orderId: `CMD_${Date.now()}`,
        description: `Pack Crédits #${packId}`,
        customerEmail: customerEmail,
        customerName: customerName,
        returnUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?status=success`,
        cancelUrl: `${process.env.NEXT_PUBLIC_APP_URL}/tarifs`,
      }),
    });

    const data = await response.json();

    if (!data.success || !data.checkoutUrl) {
      return NextResponse.json({ error: data.error || "Impossible de créer la session de paiement" }, { status: 400 });
    }

    return NextResponse.json({ checkoutUrl: data.checkoutUrl, token: data.token });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Erreur interne" }, { status: 500 });
  }
}
```

#### 2. Composant Frontend React / Next.js (`components/CheckoutButton.tsx`) :
```tsx
"use client";

import { useState } from "react";

export default function CheckoutButton({ amount = 5000, packId = "PRO" }) {
  const [loading, setLoading] = useState(false);

  const handlePayment = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount,
          packId,
          customerEmail: "client@example.com",
          customerName: "Amadou Traore",
        }),
      });

      const data = await res.json();
      if (data.checkoutUrl) {
        // Redirection vers le portail de paiement sécurisé
        window.location.href = data.checkoutUrl;
      } else {
        alert("Erreur: " + (data.error || "Paiement impossible"));
      }
    } catch (err) {
      alert("Erreur de connexion au serveur");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handlePayment}
      disabled={loading}
      className="px-6 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 disabled:opacity-50"
    >
      {loading ? "Chargement..." : `Payer ${amount.toLocaleString()} FCFA`}
    </button>
  );
}
```

---

### Option B : Node.js / Express

```javascript
const express = require('express');
const app = express();
app.use(express.json());

const HUB_URL = process.env.PAYMENT_HUB_URL || "http://localhost:4000";
const HUB_API_KEY = process.env.PAYMENT_HUB_API_KEY; // sk_hub_...

app.post('/api/checkout', async (req, res) => {
  try {
    const { amount, orderId, email, name } = req.body;

    const response = await fetch(`${HUB_URL}/checkout/session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Hub-Api-Key": HUB_API_KEY,
      },
      body: JSON.stringify({
        amount: amount,
        currency: "XOF",
        orderId: orderId || `CMD_${Date.now()}`,
        description: "Recharge de solde",
        customerEmail: email,
        customerName: name,
        returnUrl: "https://monsite.com/merci",
        cancelUrl: "https://monsite.com/panier"
      }),
    });

    const data = await response.json();
    if (!data.success) {
      return res.status(400).json({ error: data.error });
    }

    res.json({ checkoutUrl: data.checkoutUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
```

---

### Option C : PHP & Laravel

#### En PHP Vanilla :
```php
<?php
$hubUrl = "http://localhost:4000/checkout/session";
$apiKey = "sk_hub_votre_cle_api_ici";

$payload = [
    "amount" => 10000,
    "currency" => "FCFA",
    "orderId" => "COMMANDE_" . time(),
    "description" => "Abonnement Mensuel Pro",
    "customerEmail" => "client@example.com",
    "customerName" => "Moussa Diarra",
    "returnUrl" => "https://monsite.com/paiement/merci.php",
    "cancelUrl" => "https://monsite.com/panier.php"
];

$ch = curl_init($hubUrl);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    "Content-Type: application/json",
    "X-Hub-Api-Key: " . $apiKey
]);

$response = curl_exec($ch);
curl_close($ch);

$data = json_decode($response, true);

if (!empty($data['checkoutUrl'])) {
    header("Location: " . $data['checkoutUrl']);
    exit;
} else {
    echo "Erreur lors de la création de la session : " . ($data['error'] ?? 'Inconnue');
}
?>
```

#### Dans un Contrôleur Laravel :
```php
<?php
namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;

class PaymentController extends Controller
{
    public function initiateCheckout(Request $request)
    {
        $response = Http::withHeaders([
            'X-Hub-Api-Key' => config('services.payment_hub.api_key'),
            'Content-Type' => 'application/json',
        ])->post(config('services.payment_hub.url') . '/checkout/session', [
            'amount' => $request->amount,
            'currency' => 'XOF',
            'orderId' => 'CMD_' . uniqid(),
            'description' => 'Achat crédits',
            'customerEmail' => $request->user()->email,
            'customerName' => $request->user()->name,
            'returnUrl' => route('payment.success'),
            'cancelUrl' => route('payment.cancel'),
        ]);

        $data = $response->json();

        if ($data['success'] && !empty($data['checkoutUrl'])) {
            return redirect()->away($data['checkoutUrl']);
        }

        return back()->withErrors(['msg' => $data['error'] ?? 'Erreur de paiement']);
    }
}
```

---

### Option D : Python (FastAPI & Django)

#### FastAPI :
```python
import os
import requests
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI()

HUB_URL = os.getenv("PAYMENT_HUB_URL", "http://localhost:4000")
HUB_API_KEY = os.getenv("PAYMENT_HUB_API_KEY", "sk_hub_votre_cle")

class CheckoutRequest(BaseModel):
    amount: float
    order_id: str
    email: str
    name: str = None

@app.post("/api/checkout")
def create_checkout(req: CheckoutRequest):
    headers = {
        "Content-Type": "application/json",
        "X-Hub-Api-Key": HUB_API_KEY
    }
    payload = {
        "amount": req.amount,
        "currency": "FCFA",
        "orderId": req.order_id,
        "description": f"Commande #{req.order_id}",
        "customerEmail": req.email,
        "customerName": req.name,
        "returnUrl": "https://monsaas.com/success",
        "cancelUrl": "https://monsaas.com/cancel"
    }

    resp = requests.post(f"{HUB_URL}/checkout/session", json=payload, headers=headers)
    data = resp.json()

    if not data.get("success"):
        raise HTTPException(status_code=400, detail=data.get("error", "Erreur session"))

    return {"checkout_url": data["checkoutUrl"]}
```

---

### Option E : Appel cURL direct

```bash
curl -X POST http://localhost:4000/checkout/session \
  -H "Content-Type: application/json" \
  -H "X-Hub-Api-Key: sk_hub_votre_cle_api" \
  -d '{
    "amount": 5000,
    "currency": "FCFA",
    "orderId": "CMD_12345",
    "description": "Recharge compte",
    "customerEmail": "client@example.com",
    "customerName": "Jean Dupont",
    "returnUrl": "https://monsite.com/merci",
    "cancelUrl": "https://monsite.com/annuler"
  }'
```

---

## 🎨 Option Pop-up In-App (Widget SDK sans rechargement de page)

Si vous souhaitez que le tunnel de paiement s'ouvre dans une **fenêtre modale / pop-up** sur votre propre site (sans quitter votre application), utilisez le SDK Widget inclus :

### 1. Intégration HTML / Frontend
```html
<!-- 1. Charger le script du Widget depuis votre Hub -->
<script src="http://localhost:4000/public/sdk/widget.js"></script>

<script>
// 2. Initialiser le widget avec l'URL de base de votre Hub
HubWidget.init({ hubUrl: 'http://localhost:4000' });

// 3. Déclencher l'ouverture
async function openPaymentModal() {
  await HubWidget.checkout({
    route: '/api/checkout', // Votre route locale qui appelle /checkout/session
    payload: {
      amount: 5000,
      customerEmail: 'client@example.com',
      customerName: 'Fatou Sow'
    },
    onSuccess: (event) => {
      console.log('✅ Paiement confirmé reçu !', event);
      // Exemple : Mise à jour du solde sans recharger
      alert('Paiement réussi ! Votre solde a été crédité.');
    },
    onClose: () => {
      console.log('Modale fermée.');
    }
  });
}
</script>

<button onclick="openPaymentModal()" class="btn-primary">
  Payer en Pop-up
</button>
```

---

## 🔔 Étape 3 : Traiter le Webhook de Confirmation (Validation automatique)

Dès qu'un paiement est validé (par Wave, Orange Money, Carte Bancaire, Apple Pay ou Crypto), le Hub transmet une requête `POST` vers l'**URL du Webhook** configurée pour votre site dans le Dashboard.

### En-têtes HTTP Reçus :
- `X-Hub-Signature: sha256=abcdef123456...` *(Signature cryptographique HMAC-SHA256)*
- `X-Hub-App-Id: verifsms` *(Identifiant de votre site)*

### Format du Payload Reçu :
```json
{
  "event": "payment.succeeded",
  "appId": "verifsms",
  "paymentId": "pay_987654321",
  "orderId": "CMD_1726870000",
  "provider": "saspay",
  "amount": 5000,
  "currency": "XOF",
  "customer": {
    "email": "client@example.com",
    "name": "Jean Dupont",
    "phone": "2250700000000"
  },
  "providerTransactionId": "sas_tx_554433",
  "timestamp": 1726870050000
}
```

---

### Vérification HMAC en Next.js (App Router)

Fichier : `app/api/webhooks/hub-payment/route.ts` :
```typescript
import { NextResponse } from "next/server";
import crypto from "crypto";

export async function POST(req: Request) {
  try {
    // 1. IMPORTANT : Récupérer le corps brut (raw text) avant JSON.parse
    const rawBody = await req.text();
    const signature = req.headers.get("x-hub-signature") || "";
    const webhookSecret = process.env.PAYMENT_HUB_WEBHOOK_SECRET!; // whsec_...

    // 2. Calculer la signature attendue
    const expectedSignature = "sha256=" + crypto
      .createHmac("sha256", webhookSecret)
      .update(rawBody)
      .digest("hex");

    // 3. Vérification temporelle sécurisée
    const isValid = crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );

    if (!isValid) {
      console.warn("⚠️ Signature de webhook Hub invalide !");
      return NextResponse.json({ error: "Signature invalide" }, { status: 401 });
    }

    // 4. Traitement de l'événement
    const event = JSON.parse(rawBody);

    if (event.event === "payment.succeeded") {
      const { orderId, amount, provider, customer } = event;
      console.log(`✅ Commande ${orderId} payée avec succès (${amount} FCFA via ${provider})`);

      // TODO : Mettre à jour votre BDD (Ex: Prisma, Drizzle, Supabase)
      // await db.order.update({ where: { id: orderId }, data: { status: 'PAID' } });
    }

    return NextResponse.json({ received: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
```

---

### Vérification HMAC en Node.js / Express

```javascript
const express = require('express');
const crypto = require('crypto');
const app = express();

// Utiliser express.raw pour capturer le corps brut
app.post('/api/webhooks/hub-payment', express.raw({ type: 'application/json' }), (req, res) => {
  const signature = req.headers['x-hub-signature'];
  const webhookSecret = process.env.PAYMENT_HUB_WEBHOOK_SECRET; // whsec_...

  const expectedSignature = 'sha256=' + crypto
    .createHmac('sha256', webhookSecret)
    .update(req.body)
    .digest('hex');

  if (signature !== expectedSignature) {
    return res.status(401).json({ error: 'Signature invalide' });
  }

  const payload = JSON.parse(req.body.toString());

  if (payload.event === 'payment.succeeded') {
    console.log(`✅ Paiement validé pour la commande ${payload.orderId} (${payload.amount} ${payload.currency})`);
    // TODO : Valider la commande dans votre BDD
  }

  res.status(200).json({ received: true });
});
```

---

### Vérification HMAC en PHP / Laravel

```php
<?php
namespace App\Http\Controllers;

use Illuminate\Http\Request;

class HubWebhookController extends Controller
{
    public function handle(Request $request)
    {
        $webhookSecret = config('services.payment_hub.webhook_secret');
        $rawPayload = $request->getContent();
        $signature = $request->header('X-Hub-Signature');

        $expectedSignature = 'sha256=' . hash_hmac('sha256', $rawPayload, $webhookSecret);

        if (!hash_equals($expectedSignature, (string)$signature)) {
            return response()->json(['error' => 'Signature invalide'], 401);
        }

        $event = json_decode($rawPayload, true);

        if ($event['event'] === 'payment.succeeded') {
            $orderId = $event['orderId'];
            $amount = $event['amount'];

            // TODO : Valider la commande dans la base de données
            // Order::where('id', $orderId)->update(['status' => 'paid']);
        }

        return response()->json(['status' => 'success'], 200);
    }
}
```

---

### Vérification HMAC en Python (FastAPI)

```python
import hmac
import hashlib
from fastapi import FastAPI, Request, HTTPException

app = FastAPI()
WEBHOOK_SECRET = "whsec_votre_secret_ici"

@app.post("/api/webhooks/hub-payment")
async def receive_hub_webhook(request: Request):
    raw_body = await request.body()
    signature = request.headers.get("x-hub-signature", "")

    expected_signature = "sha256=" + hmac.new(
        WEBHOOK_SECRET.encode("utf-8"),
        raw_body,
        hashlib.sha256
    ).hexdigest()

    if not hmac.compare_digest(signature, expected_signature):
        raise HTTPException(status_code=401, detail="Signature invalide")

    payload = await request.json()

    if payload.get("event") == "payment.succeeded":
        print(f"✅ Commande {payload['orderId']} payée !")
        # TODO : Traitement en base

    return {"received": True}
```

---

## ⚡ Guides Spécifiques par Passerelle

---

### 🚀 SasPay (`saspay.me`)

**SasPay** permet d'encaisser par Mobile Money (Wave, Orange, MTN, Moov) et Carte Bancaire dans toute la zone UEMOA/CEMAC.

#### 1. Configuration dans le Dashboard Admin :
- **Clé Secrète :** Renseignez votre `sk_live_...` ou `sk_test_...`.
- **Clé Publique (Optionnel) :** UUID Marchand ou laisser vide.
- **Extra Config (Optionnel) :** Votre secret de webhook SasPay pour la vérification HMAC (`X-Webhook-Signature`).

#### 2. Fonctionnalités Disponibles via le Hub :
1. **Sessions Checkout hébergées** : Par défaut via `/checkout/session`.
2. **SoftPay direct** (Push USSD ou redirection directe par opérateur) :
   ```json
   POST /api/v1/payments/create
   Header: X-Hub-Api-Key: sk_hub_...
   {
     "provider": "saspay",
     "amount": 1000,
     "currency": "XOF",
     "orderId": "CMD_9901",
     "metadata": {
       "mode": "softpay",
       "network": "mtn_bj",
       "country": "BJ",
       "phoneNumber": "22960000000"
     }
   }
   ```
3. **Retraits Mobile Money (Payouts)** :
   ```json
   POST /api/v1/payments/saspay/payout
   Header: X-Hub-Api-Key: sk_hub_...
   {
     "amount": 2500,
     "currency": "XOF",
     "country": "CI",
     "method": "orange_ci",
     "phoneNumber": "2250700000000",
     "firstName": "Jean",
     "lastName": "Kouassi",
     "description": "Retrait gains"
   }
   ```
4. **Consultation des soldes de portefeuille** :
   ```http
   GET /api/v1/payments/saspay/balances
   Header: X-Hub-Api-Key: sk_hub_...
   ```

---

### 📱 LomoPay

Spécialisé dans les encaissements Mobile Money en **XOF** et **XAF** (Wave, Orange, MTN, Moov).
- **Configuration :** Renseignez votre `pk_live_...` (Clé Publique) et votre `sk_live_...` (Clé Secrète).
- **Webhooks :** Signatures cryptographiques validées automatiquement par le Hub avant notification de votre SaaS.

---

### ⚡ iKeePay

Plateforme tout-en-un pour Mobile Money et Cartes Virtuelles :
1. **Checkout Inline (Iframe/WebView)** : Intégration ultra-fluide sans flash blanc.
2. **Encaissement Direct H2H (Payin)** :
   ```json
   POST /api/v1/payments/create
   Header: X-Hub-Api-Key: sk_hub_...
   {
     "provider": "ikeepay",
     "amount": 500,
     "currency": "XOF",
     "orderId": "PAYIN_101",
     "metadata": {
       "mode": "h2h",
       "country": "CI",
       "phoneNumber": "2250700000000",
       "operator": "ORANGE",
       "otp": "123456"
     }
   }
   ```
3. **Retraits Mobile Money (Payouts)** :
   ```json
   POST /api/v1/payments/ikeepay/payout
   Header: X-Hub-Api-Key: sk_hub_...
   {
     "amount": 1000,
     "currency": "XOF",
     "country": "CI",
     "phoneNumber": "2250700000000",
     "operator": "ORANGE"
   }
   ```
4. **Cartes Virtuelles Visa/Mastercard (iKeeCard)** :
   ```json
   POST /api/v1/payments/ikeepay/card
   Header: X-Hub-Api-Key: sk_hub_...
   {
     "action": "create-card", // "get-details", "fund-withdraw", "delete-card"
     "payload": {
       "firstName": "John",
       "lastName": "Doe",
       "email": "johndoe@example.com",
       "brand": "MasterCard",
       "initialAmountCents": 500
     }
   }
   ```

---

### 💳 Whop

Idéal pour accepter les Cartes Internationales (Visa, Mastercard, Amex), Apple Pay, Google Pay et virements ACH.
- **Configuration :**
  - `Company ID` (ex: `biz_...`)
  - `Company API Key`
  - **Restriction des moyens (Optionnel)** : Vous pouvez forcer uniquement les cartes (`card, apple_pay, google_pay`) ou inclure les cryptos et ACH.
- **Fonctionnalités avancées :**
  - **Conversion dynamique USD/XOF** : Si vous facturez en FCFA, le Hub convertit intelligemment en USD (taux configurable, défaut 1 USD = 600 XOF).
  - **Pré-remplissage et masquage de l'email** : Si vous transmettez `customerEmail`, le champ d'email sur Whop est automatiquement pré-rempli et verrouillé (`email.hidden=1&email.disabled=1`).

---

### 💳 Stripe

Paiements directs par Cartes Bancaires internationales :
- Renseignez votre `sk_live_...` (Clé Secrète) et votre secret de Webhook Stripe `whsec_...`.
- Le Hub redirige directement vers Stripe Checkout hébergé et dispatche l'événement de paiement.

---

### 🪙 DepiPay (`depipay.com`)

Paiements crypto décentralisés (USDT, USDC sur BSC, Polygon, Ethereum) sans intermédiaire financier :
1. **Authentification EIP-191** : Renseignez uniquement la `SESSION_PRIVATE_KEY` de votre wallet Ethereum (`0x...`). Le Hub gère la signature cryptographique secp256k1 de chaque requête.
2. **Scrutation Automatique** : Le serveur exécute en arrière-plan le service `DepiPayPollerService` qui interroge régulièrement l'API de DepiPay pour détecter les transactions confirmées sur la blockchain.
3. **Scrutation Manuelle** :
   ```http
   POST /api/v1/payments/depipay/poll
   Header: X-Hub-Api-Key: sk_hub_...
   ```

---

### 🔄 Chariow

Passerelle alternative de Mobile Money en Afrique :
- Renseignez votre clé publique et votre clé secrète.
- Compatible avec le portail Checkout hébergé.

---

## 🎯 Récapitulatif Complet des Endpoints API

| Méthode | Route | Headers Requis | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/checkout/session` | `X-Hub-Api-Key: sk_hub_...` | **Point d'entrée principal** : Génère une session Checkout et renvoie `checkoutUrl` |
| `GET` | `/checkout/status/:token` | Aucun | Vérifie en temps réel le statut d'une session de paiement |
| `POST` | `/api/v1/payments/create` | `X-Hub-Api-Key: sk_hub_...` | Initialisation directe d'un paiement auprès d'une passerelle spécifique |
| `GET` | `/api/v1/payments/providers` | `X-Hub-Api-Key: sk_hub_...` | Liste tous les processeurs de paiement actifs pour votre site |
| `POST` | `/api/v1/payments/saspay/payout` | `X-Hub-Api-Key: sk_hub_...` | Déclenche un retrait Mobile Money via SasPay |
| `GET` | `/api/v1/payments/saspay/balances` | `X-Hub-Api-Key: sk_hub_...` | Récupère les soldes du portefeuille SasPay |
| `POST` | `/api/v1/payments/ikeepay/payout` | `X-Hub-Api-Key: sk_hub_...` | Déclenche un retrait Mobile Money via iKeePay |
| `POST` | `/api/v1/payments/ikeepay/card` | `X-Hub-Api-Key: sk_hub_...` | Gestion des cartes virtuelles iKeeCard |
| `POST` / `GET` | `/api/v1/payments/depipay/poll` | `X-Hub-Api-Key: sk_hub_...` | Déclenche la scrutation des paiements crypto DepiPay |
| `POST` | `/webhooks/:provider` | Signature Opérateur | Réception des notifications brutes des passerelles (LomoPay, Whop, SasPay, Stripe...) |
| `GET` | `/health` | Aucun | Monitoring, ping anti-veille et vérification de santé |
