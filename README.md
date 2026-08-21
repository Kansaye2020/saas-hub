# 💳 SaaS Payment Hub (Unificateur de Paiement Multi-SaaS)

**SaaS Payment Hub** est une passerelle et un microservice unifié de paiement conçu pour être auto-hébergé de manière totalement indépendante. Il centralise la gestion de vos passerelles de paiement (LomoPay, Whop, Stripe, Chariow, etc.) et permet à tous vos projets SaaS de s'y connecter via une API unique et standardisée.

---

## 🌟 Avantages Clés

1. **Isolation Complète** : Hébergez ce service sur son propre sous-domaine (ex: `https://pay.votredomaine.com` ou VPS/Docker) sans dépendre du code d'un SaaS particulier.
2. **Multi-Passerelles Intégrées** :
   - 📱 **LomoPay** : Mobile Money pour l'Afrique de l'Ouest et Centrale (Wave, Orange Money, MTN MoMo, Moov Money, Djamo) en XOF / XAF.
   - 💳 **Whop** : Cartes bancaires internationales, Apple Pay, Google Pay, abonnements et checkout global.
   - ⚡ **Stripe** : Sessions Checkout directes par Carte / Prélèvements (EUR / USD).
   - 🔄 **Chariow** : Passerelle Mobile Money alternative.
3. **Multi-Tenant (Multi-SaaS)** : Connectez autant d'applications SaaS que vous voulez avec un système de clés API (`apiKey`) et de secrets de webhook dédiés.
4. **Dispatcher de Webhooks Centralisé** : Les passerelles envoient leurs webhooks au Hub, qui valide leurs signatures, normalise les données, puis transmet un événement signé HMAC-SHA256 (`payment.succeeded`, `payment.failed`) à votre SaaS cible.
5. **Zéro Redondance** : Vous n'avez plus jamais besoin de réécrire l'intégration LomoPay ou Whop lorsque vous lancez un nouveau SaaS.

---

## 🏗️ Architecture du Système

```text
  [ Votre SaaS 1 (ex: VerifSMS) ] ----\
  [ Votre SaaS 2 (ex: MonApp)   ] ------> [ SaaS Payment Hub ] <======> [ LomoPay / Whop / Stripe / Chariow ]
  [ Votre SaaS 3 (ex: FuturSaas)] ----/          |
                                                 | Webhook unifié & signé HMAC
                                                 v
                                    [ Callback vers le SaaS émetteur ]
```

---

## 📁 Structure du Projet

```text
saas-payment-hub/
├── Dockerfile                  # Image Docker optimisée
├── docker-compose.yml          # Déploiement en 1 commande
├── package.json                # Dépendances Node.js & TypeScript
├── tsconfig.json               # Configuration TypeScript
├── .env.example                # Modèle de variables d'environnement
├── README.md                   # Guide complet d'hébergement & d'utilisation
├── sdk/
│   ├── client.ts               # SDK TypeScript prêt à l'emploi pour vos SaaS
│   └── README.md               # Guide d'utilisation du SDK
└── src/
    ├── config/                 # Gestion des configurations et SaaS connectés
    ├── controllers/            # Contrôleurs API et Webhooks
    ├── middleware/             # Authentification par clé API pour les SaaS
    ├── providers/              # Adaptateurs passerelles (LomoPay, Whop, Stripe, Chariow)
    ├── routes/                 # Définition des routes Express
    ├── services/               # Logique de paiement, signature et dispatch de webhooks
    ├── types/                  # Types et interfaces TypeScript
    └── server.ts               # Point d'entrée du serveur
```

---

## ⚙️ Configuration (`.env`)

Créez votre fichier `.env` à partir de `.env.example` :

```bash
cp .env.example .env
```

### 1. Enregistrement de vos SaaS (`CLIENT_APPS`)
Définissez la liste de vos applications clientes au format JSON :

```env
CLIENT_APPS='[
  {
    "id": "verifsms",
    "name": "VerifSMS",
    "apiKey": "vfs_live_sec_7a8b9c1d2e3f4g5h6j",
    "webhookUrl": "https://verifsms.relyx.xyz/api/webhooks/hub-payment",
    "webhookSecret": "whsec_vfs_998877665544332211"
  },
  {
    "id": "saas2",
    "name": "MonDeuxiemeSaas",
    "apiKey": "saas2_live_sec_8976543210fedcba",
    "webhookUrl": "https://mondeuxiemesaas.com/api/webhooks/payment",
    "webhookSecret": "whsec_saas2_1234567890abcdef"
  }
]'
```

### 2. Clés des Passerelles de Paiement

```env
# LomoPay (Mobile Money)
LOMOPAY_PUBLIC_KEY=votre_cle_publique_lomopay
LOMOPAY_SECRET_KEY=votre_cle_secrete_lomopay
LOMOPAY_API_URL=https://lomopay.net/api/v1/payments.php

# Whop (Cartes bancaires)
WHOP_API_KEY=votre_cle_api_whop
WHOP_COMPANY_ID=votre_company_id_whop
WHOP_SANDBOX=false

# Stripe (Optionnel)
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

---

## 🚀 Déploiement et Hébergement Indépendant

### Option A : Déploiement avec Docker (Recommandé)

Sur votre VPS (Ubuntu, Debian, etc.) :

```bash
# 1. Cloner ou transférer le dossier saas-payment-hub sur votre serveur
cd saas-payment-hub

# 2. Configurer le .env
nano .env

# 3. Démarrer avec Docker Compose
docker compose up -d --build
```

Votre hub est instantanément opérationnel sur le port `4000`.

---

### Option B : Déploiement Node.js / PM2 sur VPS

```bash
cd saas-payment-hub
npm install
npm run build
pm2 start dist/server.js --name "payment-hub"
```

---

### Option C : Hébergement Cloud (Railway, Render, Coolify, Fly.io)

1. Créez un nouveau service sur votre hébergeur à partir de ce dossier / repository.
2. Ajoutez les variables d'environnement listées dans `.env.example`.
3. Commande de build : `npm run build`
4. Commande de démarrage : `npm start`

---

## 🔗 Configuration des Webhooks sur les Passerelles

Sur vos tableaux de bord de paiement, configurez les URLs de notification suivantes pointant vers votre Hub hébergé :

| Passerelle | URL de Webhook à renseigner sur le tableau de bord |
|---|---|
| **LomoPay** | `https://pay.votredomaine.com/webhooks/lomopay` |
| **Whop** | `https://pay.votredomaine.com/webhooks/whop` |
| **Stripe** | `https://pay.votredomaine.com/webhooks/stripe` |
| **Chariow** | `https://pay.votredomaine.com/webhooks/chariow` |

---

## 📡 Utilisation de l'API

### 1. Créer un paiement
**Endpoint** : `POST /api/v1/payments/create`  
**Headers** :
- `Content-Type: application/json`
- `X-Hub-Api-Key: votre_cle_api_saas`

**Body JSON** :
```json
{
  "provider": "lomopay",
  "amount": 2000,
  "currency": "XOF",
  "orderId": "tx_987654321",
  "description": "Recharge 2000 FCFA",
  "returnUrl": "https://monsaas.com/dashboard/billing?status=success",
  "customer": {
    "email": "client@example.com",
    "name": "Jean Dupont"
  },
  "metadata": {
    "packId": "pack_2000"
  }
}
```

**Réponse JSON** :
```json
{
  "success": true,
  "paymentId": "pay_lomopay_12345",
  "orderId": "tx_987654321",
  "checkoutUrl": "https://lomopay.net/pay/checkout_abc123",
  "provider": "lomopay",
  "status": "pending"
}
```

---

### 2. Format du Webhook reçu par votre SaaS

Lorsque le client paie, le Hub transmet cette charge utile à l'URL `webhookUrl` configurée pour votre SaaS :

**Headers reçus** :
- `X-Hub-Signature: sha256=a1b2c3d4...` (Signature HMAC-SHA256 pour vérifier l'authenticité)
- `X-Hub-App-Id: verifsms`

**Payload reçu** :
```json
{
  "event": "payment.succeeded",
  "appId": "verifsms",
  "paymentId": "pay_lomopay_12345",
  "orderId": "tx_987654321",
  "provider": "lomopay",
  "amount": 2000,
  "currency": "XOF",
  "customer": {
    "email": "client@example.com",
    "name": "Jean Dupont"
  },
  "providerTransactionId": "lomo_tx_998877",
  "timestamp": 1724238000000
}
```

---

## 🛡️ Sécurité & Bonnes Pratiques

- **Clés API distinctes** : Chaque SaaS possède sa propre clé API et son secret de webhook.
- **Vérification cryptographique en temps constant** : Protection contre les attaques temporelles (*timing attacks*).
- **Pas de stockage de données bancaires** : Aucune donnée sensible de carte n'est stockée par le Hub ; tout passe par les passerelles certifiées PCI-DSS.
