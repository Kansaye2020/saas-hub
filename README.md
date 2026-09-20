# 💳 SaaS Payment Hub (Passerelle & Unificateur Multi-SaaS)

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue.svg)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-MIT-purple.svg)](LICENSE)
[![Security](https://img.shields.io/badge/Security-AES--256--GCM-red.svg)](#-sécurité-et-chiffrement)

**SaaS Payment Hub** est une infrastructure unifiée, auto-hébergée et multi-tenant pour centraliser tous vos paiements en ligne. Elle vous permet de connecter l'ensemble de vos projets SaaS, applications web/mobiles et sites e-commerce à toutes vos passerelles (**SasPay, LomoPay, iKeePay, Whop, Stripe, DepiPay, Chariow**) via une **API unique, unifiée et standardisée**.

Fini de réintégrer Stripe, Wave, Orange Money ou des passerelles crypto dans chacun de vos SaaS : intégrez le Hub une seule fois, et gérez tout depuis un tableau de bord unique !

---

## 📑 Table des Matières

- [🌟 Fonctionnalités Clés](#-fonctionnalités-clés)
- [💳 Passerelles de Paiement Supportées](#-passerelles-de-paiement-supportées)
- [🏗️ Architecture du Système](#-architecture-du-système)
- [🚀 Démarrage Rapide en 3 Minutes (Local)](#-démarrage-rapide-en-3-minutes-local)
- [🖥️ Guide du Dashboard d'Administration](#-guide-du-dashboard-dadministration)
- [💻 Comment Intégrer le Hub dans votre SaaS](#-comment-intégrer-le-hub-dans-votre-saas)
  - [Flux 1 : Page de Checkout Hébergée (Recommandé)](#flux-1--page-de-checkout-hébergée-recommandé)
  - [Flux 2 : Widget Pop-up / Modale In-App](#flux-2--widget-pop-up--modale-in-app)
  - [Flux 3 : API Directe (Server-to-Server)](#flux-3--api-directe-server-to-server)
- [🔔 Réception et Sécurisation des Webhooks](#-réception-et-sécurisation-des-webhooks)
- [📦 SDK Client TypeScript](#-sdk-client-typescript)
- [📁 Structure du Projet](#-structure-du-projet)
- [⚙️ Configuration (.env)](#️-configuration-env)
- [🚢 Déploiement en Production (Render, Koyeb, Docker)](#-déploiement-en-production)
- [🛠️ FAQ & Dépannage](#️-faq--dépannage)

---

## 🌟 Fonctionnalités Clés

1. **Architecture Multi-Tenant Complète** :
   - Connectez autant d'applications ou sites indépendants que vous le souhaitez (`verifsms`, `boutique`, `mon-saas`...).
   - Chaque site possède sa propre clé API (`sk_hub_...`), son secret de signature de webhook, ses propres passerelles configurées, ses statistiques de vente isolées et ses pages de redirection personnalisées avec son logo et son nom.

2. **Dashboard Moderne & Réactif (`/admin`)** :
   - **Interrupteurs coulissants (Switch Toggles)** : Activez ou désactivez une passerelle pour un site en un clic avec synchronisation AJAX instantanée.
   - **Toasts dynamiques** : Notifications flottantes de confirmation en temps réel.
   - **Double mode de connexion** : Connectez-vous avec le mot de passe Master Admin ou connectez-vous directement à un site avec sa clé API `sk_hub_...`.

3. **Expérience Checkout Mobile-First & Marque Blanche** :
   - Portail de paiement ultra-rapide (`/checkout/:token`) s'adaptant automatiquement au logo et au nom de chaque SaaS.
   - Affichage dynamique uniquement des processeurs activés pour le site émetteur.
   - Préremplissage intelligent et masquage automatique de l'email client pour une conversion optimale.

4. **Dispatcher de Webhooks Unifié & Sécurisé** :
   - Toutes les passerelles de paiement (LomoPay, Whop, Stripe, SasPay, etc.) envoient leurs notifications au Hub.
   - Le Hub valide les signatures cryptographiques de chaque opérateur, met à jour la base de données et transmet un **webhook unifié signé HMAC-SHA256 (`x-hub-signature`)** à votre serveur SaaS.

5. **Sécurité & Chiffrement au Repos (AES-256-GCM)** :
   - Toutes les clés privées de vos passerelles et les secrets de webhooks sont automatiquement chiffrés dans la base de données.
   - Les clés secrètes sont masquées (`••••••••`) sur l'interface d'administration.

6. **Base de Données Hybride (PostgreSQL / SQLite)** :
   - Zéro configuration en local avec **SQLite** automatique.
   - Prêt pour la production avec **PostgreSQL** (Neon.tech, Supabase, Render, Railway).
   - Auto-migration intelligente des tables et des colonnes à chaque démarrage.

---

## 💳 Passerelles de Paiement Supportées

| Passerelle | Catégorie | Méthodes Supportées | Devises | Fonctionnalités Avancées |
| :--- | :--- | :--- | :--- | :--- |
| **SasPay** | Mobile Money & Carte | Wave, Orange Money, MTN MoMo, Moov, Carte bancaire | XOF, XAF | Checkout session, SoftPay USSD direct, Retraits Mobile Money (Payouts), soldes en direct, HMAC-SHA256 |
| **LomoPay** | Mobile Money | Wave, Orange Money, MTN MoMo, Moov Money | XOF, XAF | Encaissements rapides avec signature HMAC |
| **iKeePay** | Mobile Money & Cartes | Wave, Orange, MTN, Cartes Virtuelles | XOF, XAF, USD | Checkout Inline iframe/WebView, Payin H2H direct, Retraits Payouts, Création de Cartes Virtuelles Visa/Mastercard |
| **Whop** | Cartes & International | Visa, Mastercard, Amex, Apple Pay, Google Pay, Crypto, ACH | USD, EUR, XOF | Conversion automatique XOF/USD, sélection des moyens autorisés/bloqués, préremplissage et masque email |
| **Stripe** | Cartes Internationales | Visa, Mastercard, CB, etc. | Toutes devises | Session Stripe Checkout officielle hébergée |
| **DepiPay** | Crypto-monnaies | USDT, USDC, ETH, Polygon, BSC (Binance Smart Chain) | USD, Crypto | Signature cryptographique de session EIP-191 (secp256k1), scrutation automatique en tâche de fond (`DepiPayPollerService`) |
| **Chariow** | Mobile Money | Passerelle alternative Afrique | XOF | Paiements alternatifs intégrés |

---

## 🏗️ Architecture du Système

```text
┌─────────────────────────┐     ┌─────────────────────────┐     ┌─────────────────────────┐
│   SaaS 1 (ex: VerifSMS) │     │    SaaS 2 (ex: MonApp)  │     │   SaaS 3 (E-commerce)   │
└────────────┬────────────┘     └────────────┬────────────┘     └────────────┬────────────┘
             │                               │                               │
             └───────────────────────┬───────┴───────────────────────────────┘
                                     │  Appel API (POST /checkout/session)
                                     ▼
                       ┌─────────────────────────────┐
                       │      SaaS Payment Hub       │
                       │  (http://localhost:4000 ou  │
                       │   https://checkout....xyz)  │
                       └──────────────┬──────────────┘
                                      │
          ┌───────────────────────────┼───────────────────────────┐
          ▼                           ▼                           ▼
 ┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
 │ SasPay, LomoPay │         │  Whop & Stripe  │         │     DepiPay     │
 │    & iKeePay    │         │ (Cartes, AppleP)│         │ (Crypto USDT...)│
 └────────┬────────┘         └────────┬────────┘         └────────┬────────┘
          │                           │                           │
          └───────────────────────────┼───────────────────────────┘
                                      │ Webhook validé & vérifié
                                      ▼
                        ┌───────────────────────────┐
                        │   Dispatcher de Webhook   │
                        └─────────────┬─────────────┘
                                      │ Notification POST signée (X-Hub-Signature: sha256=...)
                                      ▼
                        [ Votre SaaS : Validation Automatique ]
```

---

## 🚀 Démarrage Rapide en 3 Minutes (Local)

### 1. Prérequis
- [Node.js](https://nodejs.org/) v18 ou supérieur
- npm ou pnpm

### 2. Installation
```bash
# 1. Cloner le projet
git clone https://github.com/Kansaye2020/saas-hub.git
cd saas-payment

# 2. Installer les dépendances
npm install

# 3. Créer votre fichier d'environnement local
cp .env.example .env
```

### 3. Lancer en Mode Développement
```bash
npm run dev
```

Le serveur démarre sur **`http://localhost:4000`** avec une base de données **SQLite locale prête à l'emploi** (aucun serveur SQL à installer !).

### 4. Liens Utiles Immédiats
- **Dashboard Administrateur** : [`http://localhost:4000/admin`](http://localhost:4000/admin)
  - Identifiants par défaut : Identifiant = `admin` / Mot de passe = `admin`
- **Page de Démonstration Pop-up** : [`http://localhost:4000/public/test-widget.html`](http://localhost:4000/public/test-widget.html)
- **Page de Démonstration Redirection** : [`http://localhost:4000/public/test-redirect.html`](http://localhost:4000/public/test-redirect.html)
- **Vérification de Santé** : [`http://localhost:4000/health`](http://localhost:4000/health)

---

## 🖥️ Guide du Dashboard d'Administration

Accédez à `http://localhost:4000/admin` (ou à l'URL de votre déploiement).

### 1. Deux Modes de Connexion
1. **Master Admin** : Renseignez votre `ADMIN_USERNAME` et `ADMIN_PASSWORD` (par défaut `admin` / `admin`). Vous accédez à la gestion de tous les sites.
2. **Accès Direct par Clé API** : Vous pouvez également entrer directement la clé `sk_hub_...` d'un site pour atterrir directement sur son tableau de bord dédié sans avoir besoin du mot de passe Master.

### 2. Créer un Site SaaS
1. Dans le menu **Tous les sites**, cliquez sur **"+ Ajouter un site"**.
2. Renseignez :
   - **ID Unique (Slug)** : ex: `mon-saas` (minuscules sans espaces).
   - **Nom de la boutique** : ex: `Mon SaaS Pro`.
   - **URL du Logo (optionnel)** : Image affichée sur le portail de paiement.
   - **URL de Webhook** : URL de votre backend où le Hub enverra les confirmations de paiement (ex: `https://monsaas.com/api/webhooks/payment`).
   - **Return URL & Cancel URL** : Vos pages de succès et d'abandon.

### 3. Configurer et Activer les Processeurs
1. Cliquez sur le site créé puis sur l'onglet **"Processeurs"**.
2. Cliquez sur **"+ Ajouter un processeur"** et choisissez la passerelle voulue (SasPay, Whop, LomoPay, iKeePay, Stripe, DepiPay, Chariow).
3. Renseignez vos clés API fournies par la passerelle.
4. Activez ou désactivez le processeur en un clic via l'interrupteur coulissant (**Switch Toggle**).

---

## 💻 Comment Intégrer le Hub dans votre SaaS

Pour connecter votre application au Hub, vous avez le choix entre 3 approches :

### Flux 1 : Page de Checkout Hébergée (Recommandé)

C'est la méthode la plus propre et la plus rapide : le client est redirigé vers une page hébergée par le Hub avec le logo de votre SaaS, où il choisit son moyen de paiement (Wave, Orange Money, Carte, Crypto).

#### 1. Créer la session depuis votre Backend SaaS :
```bash
curl -X POST http://localhost:4000/checkout/session \
  -H "Content-Type: application/json" \
  -H "X-Hub-Api-Key: sk_hub_votre_cle_api" \
  -d '{
    "amount": 5000,
    "currency": "FCFA",
    "orderId": "CMD_1001",
    "description": "Recharge 500 crédits",
    "customerEmail": "client@example.com",
    "customerName": "Amadou Traore",
    "returnUrl": "https://monsaas.com/paiement/succes",
    "cancelUrl": "https://monsaas.com/tarifs"
  }'
```

#### 2. Réponse reçue :
```json
{
  "success": true,
  "token": "a1b2c3d4e5f6789...",
  "checkoutUrl": "http://localhost:4000/checkout/a1b2c3d4e5f6789..."
}
```

Redirigez simplement le client vers `checkoutUrl`.

---

### Flux 2 : Widget Pop-up / Modale In-App

Offrez une expérience ultra-fluide où le client paie sans quitter votre site via une modale élégante.

```html
<!-- 1. Charger le script du Widget -->
<script src="http://localhost:4000/public/sdk/widget.js"></script>

<script>
// 2. Initialiser le widget avec l'URL de votre Hub
HubWidget.init({ hubUrl: 'http://localhost:4000' });

// 3. Ouvrir la modale
async function payerEnPopup() {
  await HubWidget.checkout({
    route: '/api/checkout', // Votre route backend qui appelle /checkout/session
    payload: {
      amount: 5000,
      customerEmail: 'client@example.com'
    },
    onSuccess: (event) => {
      console.log('✅ Paiement réussi !', event);
      // Mettre à jour l'UI ou afficher un message de succès instantané
      location.href = '/dashboard?success=1';
    },
    onClose: () => {
      console.log('Popup fermée par le client');
    }
  });
}
</script>
```

---

### Flux 3 : API Directe (Server-to-Server)

Si vous construisez votre propre interface de paiement sur mesure et souhaitez déclencher directement l'encaissement :

```bash
curl -X POST http://localhost:4000/api/v1/payments/create \
  -H "Content-Type: application/json" \
  -H "X-Hub-Api-Key: sk_hub_votre_cle_api" \
  -d '{
    "provider": "saspay",
    "amount": 2500,
    "currency": "XOF",
    "orderId": "CMD_8899",
    "description": "Achat direct",
    "customer": {
      "email": "client@example.com",
      "name": "Jean Dupont",
      "phone": "2250700000000"
    },
    "returnUrl": "https://monsaas.com/succes"
  }'
```

---

## 🔔 Réception et Sécurisation des Webhooks

Dès qu'un paiement est validé (Wave, Orange Money, Carte, Crypto), le Hub envoie une notification `POST` vers l'URL de Webhook que vous avez configurée dans le Dashboard.

### En-têtes HTTP Reçus
- `X-Hub-Signature`: `sha256=123456abcdef...` (Signature cryptographique HMAC-SHA256)
- `X-Hub-App-Id`: Identifiant de votre site (ex: `verifsms`)

### Format du Corps JSON (Payload Unifié)
```json
{
  "event": "payment.succeeded",
  "appId": "verifsms",
  "paymentId": "pay_987654321",
  "orderId": "CMD_1001",
  "provider": "saspay",
  "amount": 5000,
  "currency": "XOF",
  "customer": {
    "email": "client@example.com",
    "name": "Amadou Traore",
    "phone": "2250700000000"
  },
  "providerTransactionId": "sas_tx_998877",
  "timestamp": 1726870000000
}
```

### Exemple de Vérification en Node.js / Next.js
```typescript
import crypto from 'crypto';

export async function POST(req: Request) {
  const rawBody = await req.text();
  const signature = req.headers.get('x-hub-signature');
  const webhookSecret = process.env.PAYMENT_HUB_WEBHOOK_SECRET!; // whsec_...

  const expected = 'sha256=' + crypto
    .createHmac('sha256', webhookSecret)
    .update(rawBody)
    .digest('hex');

  if (signature !== expected) {
    return new Response('Signature invalide', { status: 401 });
  }

  const payload = JSON.parse(rawBody);

  if (payload.event === 'payment.succeeded') {
    const { orderId, amount, provider } = payload;
    console.log(`✅ Commande ${orderId} payée (${amount} FCFA via ${provider})`);
    // TODO : Activer le service ou créditer le compte client en BDD
  }

  return new Response(JSON.stringify({ received: true }), { status: 200 });
}
```

---

## 📦 SDK Client TypeScript

Un SDK prêt à l'emploi est disponible dans le dossier [`sdk/`](./sdk). Il fournit une classe `SaasPaymentClient` typée pour tous vos projets Node.js / Next.js :

```typescript
import { SaasPaymentClient } from "./sdk/client";

const client = new SaasPaymentClient({
  hubBaseUrl: "http://localhost:4000",
  apiKey: "sk_hub_votre_cle_api",
  webhookSecret: "whsec_votre_secret",
});

// Créer une session Checkout
const session = await client.createSession({
  amount: 5000,
  currency: "XOF",
  orderId: "CMD_123",
  customerEmail: "client@example.com"
});

// Effectuer un retrait Mobile Money SasPay (Payout)
const payout = await client.saspayPayout({
  amount: 10000,
  currency: "XOF",
  country: "CI",
  method: "orange_ci",
  phoneNumber: "2250700000000"
});

// Vérifier la signature d'un webhook
const isValid = client.verifyWebhook(rawBody, req.headers["x-hub-signature"]);
```

👉 Pour la documentation complète du SDK, consultez **[`sdk/README.md`](./sdk/README.md)**.

---

## 📁 Structure du Projet

```text
saas-payment/
├── package.json                # Dépendances Node.js (Express, TypeScript, EJS, DaisyUI)
├── tsconfig.json               # Configuration TypeScript
├── .env.example                # Modèle complet de variables d'environnement
├── README.md                   # Guide principal et démarrage rapide
├── INTEGRATION_GUIDE.md        # Guide pas-à-pas multi-langages (Next.js, PHP, Python)
├── Dockerfile                  # Déploiement conteneurisé multi-stage
├── docker-compose.yml          # Déploiement Docker en une commande
├── render.yaml                 # Fichier Blueprint pour déploiement sur Render
├── scripts/
│   └── migrate.js              # Script manuel de synchronisation et migration BDD
├── public/                     # Fichiers statiques publics
│   ├── sdk/widget.js           # SDK Pop-up Iframe avec écoute postMessage
│   ├── test-redirect.html      # Page de démonstration redirection Checkout
│   └── test-widget.html        # Page de démonstration Pop-up Widget
├── sdk/                        # SDK TypeScript Client pour vos SaaS
│   ├── client.ts               # Client API avec vérification cryptographique HMAC
│   └── README.md               # Guide d'utilisation du SDK
├── views/                      # Templates EJS (DaisyUI + TailwindCSS)
│   ├── admin/                  # Dashboard Admin, login, gestion des processeurs
│   └── checkout/               # Pages client de paiement, complétion et annulation
└── src/
    ├── server.ts               # Point d'entrée serveur Express
    ├── config/                 # Gestion des configs d'apps et résolveur d'URLs
    ├── database/               # Connecteur PostgreSQL (Neon/Render) et SQLite + auto-migrations
    ├── middleware/             # Authentification API SaaS et Session Admin
    ├── providers/              # Adaptateurs (SasPay, LomoPay, iKeePay, Whop, Stripe, DepiPay, Chariow)
    ├── routes/                 # Routes API (/checkout, /api/v1/payments, /admin, /webhooks)
    ├── services/               # Moteurs de paiement, signatures HMAC et Poller DepiPay
    ├── types/                  # Définitions TypeScript
    └── utils/                  # Chiffrement sécurisé AES-256-GCM
```

---

## ⚙️ Configuration (.env)

| Variable | Obligatoire | Valeur par défaut | Description |
| :--- | :--- | :--- | :--- |
| `PORT` | Non | `4000` | Port d'écoute du serveur HTTP |
| `NODE_ENV` | Non | `development` | Environnement (`development` ou `production`) |
| `HUB_BASE_URL` | **Oui** | `http://localhost:4000` | URL publique de base de votre Hub de paiement |
| `CHECKOUT_BASE_URL` | Non | *Vide* | URL dédiée au sous-domaine de paiement (ex: `https://checkout.monsite.com`) |
| `DATABASE_URL` | Non | *Vide* (SQLite local) | URL de connexion PostgreSQL (Neon.tech, Supabase, Render, Railway) |
| `DB_PATH` | Non | `./data/database.sqlite` | Emplacement du fichier SQLite en local |
| `ADMIN_USERNAME` | Non | `admin` | Identifiant du compte Master Admin |
| `ADMIN_PASSWORD` | Non | `admin` | Mot de passe du compte Master Admin |
| `ADMIN_JWT_SECRET` | Non | *Aléatoire* | Secret de signature des sessions du dashboard |
| `ENCRYPTION_KEY` | Non | *Dérivée* | Clé de chiffrement AES-256-GCM pour les secrets stockés en base |

---

## 🚢 Déploiement en Production

### Option 1 : Déploiement sur Render
1. Créez un compte sur [Render.com](https://render.com).
2. Créez une base de données PostgreSQL gratuite sur [Neon.tech](https://neon.tech) ou sur Render.
3. Liez votre dépôt GitHub à Render et choisissez **Web Service** (ou utilisez le blueprint [`render.yaml`](./render.yaml)).
4. Configurez :
   - **Build Command** : `npm run build`
   - **Start Command** : `npm start`
5. Ajoutez vos variables d'environnement (`HUB_BASE_URL`, `DATABASE_URL`, `ADMIN_PASSWORD`, `ADMIN_JWT_SECRET`).

### Option 2 : Déploiement sur Koyeb
1. Connectez votre dépôt GitHub sur [Koyeb.com](https://www.koyeb.com).
2. Type : **Node.js**
3. Build command : `npm run build`
4. Run command : `npm start`
5. Port : `4000`
6. Ajoutez vos variables dans l'onglet **Environment variables**.

### Option 3 : Déploiement Docker (VPS / Portainer)
```bash
docker-compose up -d --build
```

---

## 🛠️ FAQ & Dépannage

### 1. Comment exécuter une migration manuelle ?
Le serveur migre automatiquement les tables au démarrage. Si vous souhaitez forcer la synchronisation :
```bash
npm run build
npm run migrate
```

### 2. Comment tester les webhooks en local ?
Pour recevoir les webhooks des processeurs réels (LomoPay, Whop, SasPay, Stripe) sur votre machine locale en développement :
1. Lancez [ngrok](https://ngrok.com) : `ngrok http 4000`
2. Mettez à jour votre `HUB_BASE_URL` dans le `.env` avec l'URL HTTPS fournie par ngrok.
3. Configurez les webhooks dans les dashboards de vos passerelles pour pointer vers `https://votre-url-ngrok.ngrok-free.app/webhooks/<provider>` (ex: `/webhooks/saspay`).

### 3. Comment changer le mot de passe Master Admin ?
Modifiez simplement `ADMIN_PASSWORD` dans votre fichier `.env` et redémarrez le serveur.

---

## 📖 En Savoir Plus

Pour des guides pas-à-pas détaillés avec des exemples prêts à l'emploi en **Next.js**, **PHP/Laravel**, **Python/Django**, ainsi que les guides spécifiques à chaque passerelle (SasPay, iKeePay, DepiPay crypto, Whop, etc.), consultez :

👉 **[`INTEGRATION_GUIDE.md`](./INTEGRATION_GUIDE.md)**
