# 📚 Guide d'Intégration du SaaS Payment Hub

Ce guide vous explique étape par étape comment connecter n'importe quel site ou SaaS (**Next.js, Node.js, PHP, Laravel, Python/Django, WordPress, etc.**) à votre **SaaS Payment Hub**.

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
         │                                       │   Le client choisit son moyen         │
         │                                       │   (Wave, OM, Carte) et paie           │
         │                                       │<──────────────────────────────────────┤
         │                                       │                                       │
  3. Reçoit le Webhook (Paiement Validé)         │   Redirige vers returnUrl ───────────>│
         │<──────────────────────────────────────┤   (Page de remerciement)              │
         │  (Crédite le solde ou valide la com.) │                                       │
```

---

## 🔑 Étape 1 : Récupérer vos identifiants sur le Hub

1. Connectez-vous à votre Hub d'administration : `https://checkout.inquart.xyz/admin` (ou votre URL).
2. Cliquez sur votre site ou créez-en un nouveau (ex: `verifsms`).
3. Dans l'onglet **"⚙️ Clés API & Webhook"**, copiez :
   - **`X-Hub-Api-Key`** : Votre clé API secrète (ex: `sk_hub_abcdef123456...`).
   - **`Secret Webhook`** : Votre secret pour vérifier la signature des paiements (ex: `whsec_987654...`).
   - **`Return URL`** : L'URL de succès de votre site (ex: `https://monsite.com/merci`).

---

## 💻 Étape 2 : Initier un Paiement depuis votre SaaS

---

### Option A : En JavaScript / TypeScript (Node.js, Express, Next.js)

#### Exemple pour Next.js (App Router : `app/api/checkout/route.ts`) :

```typescript
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { amount, orderId, customerEmail } = await req.json();

    // Appel à votre SaaS Payment Hub
    const response = await fetch("https://checkout.inquart.xyz/checkout/session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Hub-Api-Key": process.env.PAYMENT_HUB_API_KEY!, // Votre sk_hub_...
      },
      body: JSON.stringify({
        amount: amount, // Ex: 5000
        currency: "FCFA", // ou "XOF", "USD", "EUR"
        orderId: orderId, // Identifiant unique de la commande dans votre base
        description: "Recharge de compte VerifSMS",
        customerEmail: customerEmail,
        returnUrl: "https://monsite.com/dashboard?payment=success",
        cancelUrl: "https://monsite.com/tarifs",
      }),
    });

    const data = await response.json();

    if (!data.success || !data.checkoutUrl) {
      return NextResponse.json({ error: data.error || "Erreur de paiement" }, { status: 400 });
    }

    // Renvoie le lien au frontend pour redirection
    return NextResponse.json({ checkoutUrl: data.checkoutUrl });
  } catch (error) {
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
```

#### Côté Frontend (React / Vue / HTML) :

```javascript
async function payer() {
  const res = await fetch("/api/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      amount: 5000,
      orderId: "CMD_" + Date.now(),
      customerEmail: "client@example.com"
    })
  });

  const data = await res.json();
  if (data.checkoutUrl) {
    // Redirection immédiate vers la page de paiement sécurisée
    window.location.href = data.checkoutUrl;
  }
}
```

---

### Option B : En PHP / Laravel / WordPress

```php
<?php
// Exemple en PHP Vanilla
$hubUrl = "https://checkout.inquart.xyz/checkout/session";
$apiKey = "sk_hub_votre_cle_api_ici";

$payload = [
    "amount" => 10000,
    "currency" => "FCFA",
    "orderId" => "COMMANDE_" . time(),
    "description" => "Abonnement Mensuel",
    "customerEmail" => "client@gmail.com",
    "returnUrl" => "https://monsite.com/merci.php",
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
    // Redirection vers la page de paiement
    header("Location: " . $data['checkoutUrl']);
    exit;
} else {
    echo "Erreur : " . ($data['error'] ?? 'Impossible de créer la session');
}
?>
```

---

### Option C : En Python (FastAPI / Flask / Django)

```python
import requests

HUB_URL = "https://checkout.inquart.xyz/checkout/session"
API_KEY = "sk_hub_votre_cle_api"

def create_payment_session(order_id, amount, email):
    headers = {
        "Content-Type": "application/json",
        "X-Hub-Api-Key": API_KEY
    }
    payload = {
        "amount": amount,
        "currency": "FCFA",
        "orderId": order_id,
        "description": "Achat crédits",
        "customerEmail": email,
        "returnUrl": "https://monsite.com/paiement/succes",
        "cancelUrl": "https://monsite.com/tarifs"
    }

    response = requests.post(HUB_URL, json=payload, headers=headers)
    data = response.json()

    if data.get("success"):
        return data["checkoutUrl"] # Rediriger l'utilisateur vers cette URL
    else:
        raise Exception(data.get("error", "Erreur création paiement"))
```

---

## 🔔 Étape 3 : Traiter le Webhook de Confirmation (Validation automatique)

Lorsque le client a payé avec succès (par Mobile Money ou Carte), votre SaaS reçoit instantanément une notification `POST` à l'adresse que vous avez configurée dans **URL du Webhook**.

### Format du Webhook envoyé par le Hub :

**Headers HTTP :**
- `X-Hub-Signature: sha256=abcdef123456...` *(Signature HMAC pour prouver que la requête vient bien de votre Hub)*
- `X-Hub-App-Id: verifsms`

**Corps JSON (Payload) :**
```json
{
  "event": "payment.succeeded",
  "appId": "verifsms",
  "paymentId": "pay_987654321",
  "orderId": "CMD_1724300000",
  "provider": "lomopay",
  "amount": 5000,
  "currency": "FCFA",
  "customer": {
    "email": "client@example.com"
  },
  "timestamp": 1724360000000
}
```

---

### Vérification de la signature HMAC (Sécurité)

#### En Node.js / Express :

```javascript
import crypto from 'crypto';

app.post('/api/webhooks/hub-payment', express.raw({ type: 'application/json' }), (req, res) => {
  const signature = req.headers['x-hub-signature'];
  const webhookSecret = process.env.PAYMENT_HUB_WEBHOOK_SECRET; // whsec_...

  // 1. Calculer la signature attendue
  const expectedSignature = 'sha256=' + crypto
    .createHmac('sha256', webhookSecret)
    .update(req.body) // rawBody
    .digest('hex');

  // 2. Vérifier la signature
  if (signature !== expectedSignature) {
    return res.status(401).json({ error: 'Signature invalide' });
  }

  const payload = JSON.parse(req.body.toString());

  // 3. Traiter le paiement
  if (payload.event === 'payment.succeeded') {
    const orderId = payload.orderId;
    const amount = payload.amount;

    console.log(`✅ Paiement validé pour la commande ${orderId} (${amount} FCFA)`);
    // TODO : Créditer le solde de l'utilisateur ou activer son abonnement dans votre BDD
  }

  res.status(200).json({ received: true });
});
```

#### En PHP :

```php
<?php
$webhookSecret = "whsec_votre_secret_ici";
$payload = file_get_contents('php://input');
$signature = $_SERVER['HTTP_X_HUB_SIGNATURE'] ?? '';

$expectedSignature = 'sha256=' . hash_hmac('sha256', $payload, $webhookSecret);

if (!hash_equals($expectedSignature, $signature)) {
    http_response_code(401);
    echo json_encode(["error" => "Signature invalide"]);
    exit;
}

$data = json_decode($payload, true);

if ($data['event'] === 'payment.succeeded') {
    $orderId = $data['orderId'];
    $amount = $data['amount'];
    // TODO: Mettre à jour la base de données (Commande Payée)
}

http_response_code(200);
echo json_encode(["status" => "success"]);
?>
```

---

## 🎨 Option Pop-up In-App (Whop Embed & Paiement sans quitter votre site)

Pour offrir une expérience fluide où le client paie en Pop-up sans quitter votre site, avec **crédit instantané** et **fermeture automatique** :

### 1. Endpoint Backend (`app/api/checkout/route.ts`) :
```typescript
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { amount, packId, userEmail, userName } = await req.json();

    // 1. Appel au Hub pour générer la session sécurisée
    const response = await fetch("https://checkout.inquart.xyz/checkout/session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Hub-Api-Key": process.env.PAYMENT_HUB_API_KEY!,
      },
      body: JSON.stringify({
        amount: amount,
        currency: "FCFA", // ou "XOF", "USD"
        orderId: `CMD_${Date.now()}`,
        description: `Pack #${packId}`,
        customerEmail: userEmail, // Transmet et masque l'email automatiquement sur Whop
        customerName: userName,
        returnUrl: "https://checkout.inquart.xyz/checkout/complete"
      }),
    });

    const data = await response.json();
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
```

### 2. Frontend Client (React, Next.js, Vue, ou HTML) :
```html
<!-- 1. Charger le SDK Widget dans votre page -->
<script src="https://checkout.inquart.xyz/public/sdk/widget.js"></script>

<script>
// Initialiser avec l'URL de votre Hub
HubWidget.init({ hubUrl: 'https://checkout.inquart.xyz' });

async function declencherPaiementPopUp() {
  // Flux tout-en-un : Appel à route.ts -> Ouverture Modale -> Crédit Instantané & Auto-close
  await HubWidget.checkout({
    route: '/api/checkout',
    payload: {
      amount: 5000,
      packId: 'PRO_MONTHLY',
      userEmail: 'client.connecte@exemple.com',
      userName: 'Jean Dupont'
    },
    onSuccess: (event) => {
      console.log('✅ Paiement complété !', event);
      // ⚡ Crédit instantané du solde ou mise à jour de l'UI sans recharger la page
      mettreAJourSoldeUtilisateur();
    },
    onError: (err) => {
      alert("Erreur de paiement : " + err.message);
    }
  });
}
</script>
```

---

---

## ⚡ Guide Spécifique : Intégration iKeePay

Le SaaS Payment Hub intègre nativement l'ensemble des fonctionnalités d'**iKeePay** :

### 1. Checkout Inline & Redirection (Par défaut)
Pour rediriger vos clients vers le tunnel iKeePay officiel (ou l'intégrer en iframe / WebView Flutter, React Native, iOS, Android) :
- Configurer votre `Clé Publique pk` et votre `Clé Secrète x-api-key` dans l'admin du Hub (`/admin`).
- Passer `provider: "ikeepay"` lors de la création du paiement (ou laisser en `"auto"`).
- L'URL de paiement générée `https://ikeepay.com/checkout/v1/inline?pk=...` est prête à être chargée.

### 2. Encaissement Direct H2H (Payin)
Pour initier directement un prélèvement Mobile Money (Wave, Orange, MTN, Moov...) sans redirection :
```json
POST /api/v1/payments/create
Header: X-Hub-Api-Key: sk_hub_...
{
  "provider": "ikeepay",
  "amount": 500,
  "currency": "XOF",
  "orderId": "CMD_1700000000",
  "returnUrl": "https://monsite.com/merci",
  "customer": {
    "email": "client@exemple.com",
    "name": "Jean Dupont"
  },
  "metadata": {
    "mode": "h2h",
    "country": "CI",
    "phoneNumber": "2250700000000",
    "operator": "ORANGE",
    "otp": "123456"
  }
}
```

### 3. Retraits H2H (Payouts)
Pour transférer des fonds vers un compte Mobile Money client :
```json
POST /api/v1/payments/ikeepay/payout
Header: X-Hub-Api-Key: sk_hub_...
{
  "amount": 200,
  "currency": "XOF",
  "country": "CI",
  "phoneNumber": "2250700000000",
  "operator": "ORANGE",
  "orderId": "PAYOUT_1700000000"
}
```

### 4. Cartes Virtuelles Visa/Mastercard (iKeeCard)
Pour créer et gérer des cartes virtuelles :
```json
POST /api/v1/payments/ikeepay/card
Header: X-Hub-Api-Key: sk_hub_...
{
  "action": "create-card", // ou "get-details", "fund-withdraw", "delete-card"
  "payload": {
    "firstName": "John",
    "lastName": "Doe",
    "email": "johndoe@example.com",
    "phone": "+2348012345678",
    "brand": "MasterCard",
    "initialAmountCents": 500
  }
}
```

---

## 💳 Guide Spécifique : Intégration Whop

**Whop** gère les paiements internationaux par Carte Bancaire (Visa, Mastercard, American Express), Apple Pay et Google Pay :

- **Transmission de l'email client :** Lorsque vous passez `customerEmail` ou `customer: { email }`, le Hub transmet automatiquement l'email dans les métadonnées de la session Whop et pré-remplit le champ sur la page de paiement sécurisée Whop (`?email=client@domaine.com`).
- **Conversion automatique :** Si le montant est en FCFA (`XOF` ou `XAF`), le Hub applique une conversion dynamique en USD pour Whop tout en conservant le montant initial en devise locale dans le webhook de retour.
- **Réception du Webhook :** Une fois le paiement validé sur Whop, le Hub transmet à votre SaaS l'événement unifié `payment.succeeded` avec l'email du client acheteur.

---

## 📱 Guide Spécifique : Intégration LomoPay

**LomoPay** est spécialisé dans les encaissements Mobile Money pour l'Afrique de l'Ouest et Centrale (Wave, Orange Money, MTN MoMo, Moov Money) :

- **Devises gérées :** `XOF` (UEMOA) et `XAF` (CEMAC).
- **Webhooks signés HMAC :** Confirmation instantanée de paiement avec vérification cryptographique des transactions.

---

## 🎯 Récapitulatif des Endpoints API

| Action | Méthode | URL | Header Requis | Description |
| :--- | :--- | :--- | :--- | :--- |
| **Créer une Session Checkout** | `POST` | `/checkout/session` | `X-Hub-Api-Key: sk_hub_...` | Génère un token et une URL de paiement hébergée |
| **Créer un Paiement Direct (API)** | `POST` | `/api/v1/payments/create` | `X-Hub-Api-Key: sk_hub_...` | Initialisation directe auprès d'une passerelle |
| **Retrait H2H iKeePay** | `POST` | `/api/v1/payments/ikeepay/payout` | `X-Hub-Api-Key: sk_hub_...` | Transfert direct vers Mobile Money client |
| **Cartes Virtuelles iKeeCard** | `POST` | `/api/v1/payments/ikeepay/card` | `X-Hub-Api-Key: sk_hub_...` | Création / gestion de cartes Visa et Mastercard |
| **Liste des passerelles disponibles** | `GET` | `/api/v1/payments/providers` | `X-Hub-Api-Key: sk_hub_...` | Liste des processeurs actifs pour ce site |
| **Page de Santé (Anti-veille)** | `GET` | `/health` | Aucun | Monitoring et uptime check |
