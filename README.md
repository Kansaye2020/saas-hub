# 💳 SaaS Payment Hub (Unificateur de Paiement Multi-SaaS)

**SaaS Payment Hub** est une passerelle et un microservice unifié de paiement doté d'une **interface d'administration Web intuitive** et conçu pour être auto-hébergé facilement sur **Render.com**, un VPS ou n'importe quel hébergeur Node.js/Docker.

Il centralise la gestion de vos passerelles de paiement (LomoPay, Whop, Stripe, Chariow, etc.) et permet à tous vos projets SaaS / No-Code (Make, n8n, Bubble, Next.js, etc.) de s'y connecter via une API unique et standardisée.

---

## 🌟 Avantages Clés

1. 🖥️ **Interface Web Interactive Intégrée** : Configurez vos SaaS, vos clés API et vos webhooks directement dans votre navigateur via un tableau de bord moderne et responsive.
2. 🚀 **Déploiement en 1 clic sur Render.com** : Fichier `render.yaml` et export de variables `.env` prêts à l'emploi.
3. 📱 **Multi-Passerelles Intégrées** :
   - 📱 **LomoPay** : Mobile Money pour l'Afrique de l'Ouest et Centrale (Wave, Orange Money, MTN MoMo, Moov Money, Djamo) en XOF / XAF.
   - 💳 **Whop** : Cartes bancaires internationales, Apple Pay, Google Pay, abonnements et checkout global.
   - ⚡ **Stripe** : Sessions Checkout directes par Carte / Prélèvements (EUR / USD).
   - 🔄 **Chariow** : Passerelle Mobile Money alternative.
4. 🏢 **Multi-Tenant (Multi-SaaS)** : Connectez autant d'applications SaaS et d'outils que vous voulez avec un système de clés API (`apiKey`) et de secrets de webhook dédiés.
5. 🔐 **Dispatcher de Webhooks Centralisé & Sécurisé** : Les passerelles envoient leurs notifications au Hub, qui valide leurs signatures, normalise les données, puis transmet un événement signé HMAC-SHA256 (`payment.succeeded`, `payment.failed`) à votre SaaS cible.
6. 🧪 **Simulateur de Paiements & Testeur de Webhooks** : Testez vos flux de paiement et validez vos récepteurs de webhooks en un clic depuis le dashboard.

---

## 🏗️ Architecture du Système

```text
  [ Vos Outils & SaaS (VerifSMS, Make, n8n, Bubble) ]
                          |
                          v (Requête HTTP unifiée avec X-Hub-Api-Key)
               +-----------------------+
               |   SaaS Payment Hub    | <=======> [ LomoPay / Whop / Stripe / Chariow ]
               |  (Dashboard & API)    |
               +-----------------------+
                          |
                          v (Webhook sécurisé signé HMAC-SHA256)
     [ Callback vers l'URL de votre SaaS / Outil ]
```

---

## ☁️ Déploiement sur Render.com (Recommandé)

### Méthode 1 : Déploiement Standard (Recommandé)
1. Créez un compte sur [Render.com](https://render.com).
2. Poussez ce dossier sur un dépôt Git (GitHub / GitLab).
3. Sur Render.com, cliquez sur **New +** &rarr; **Web Service** et connectez votre dépôt.
4. Renseignez les paramètres suivants :
   - **Environment** : `Node`
   - **Build Command** : `npm install && npm run build`
   - **Start Command** : `npm start`
5. Dans l'onglet **Environment**, ajoutez vos variables d'environnement (ou copiez-les depuis le bouton *Export Render.com* du Dashboard).

### Méthode 2 : Déploiement Blueprint (Render.yaml)
1. Sur Render.com, cliquez sur **New +** &rarr; **Blueprint**.
2. Sélectionnez votre dépôt : Render configurera automatiquement le service selon le fichier [`render.yaml`](file:///C:/saaa-payment/render.yaml).

---

## 🖥️ Utilisation du Dashboard Web

Une fois déployé (ou en local sur `http://localhost:4000`) :
1. Ouvrez l'URL dans votre navigateur.
2. Rendez-vous sur l'onglet **"Mes Outils & SaaS"** pour connecter vos applications et générer vos clés API.
3. Rendez-vous sur l'onglet **"Passerelles de Paiement"** pour renseigner vos clés LomoPay, Whop ou Stripe.
4. Copiez les URLs de Webhooks affichées sur le Dashboard et collez-les dans vos comptes LomoPay, Whop ou Stripe :
   - **LomoPay** : `https://votre-app.onrender.com/webhooks/lomopay`
   - **Whop** : `https://votre-app.onrender.com/webhooks/whop`
   - **Stripe** : `https://votre-app.onrender.com/webhooks/stripe`
   - **Chariow** : `https://votre-app.onrender.com/webhooks/chariow`
5. Utilisez l'onglet **"Simulateur & Tests"** pour créer un paiement test ou simuler un webhook vers votre SaaS.

---

## 📡 API & Code d'Intégration

### 1. Créer un paiement depuis votre SaaS
**Endpoint** : `POST /api/v1/payments/create`  
**Headers** :
- `Content-Type: application/json`
- `X-Hub-Api-Key: VOTRE_CLE_API_SAAS`

**Body JSON** :
```json
{
  "provider": "auto",
  "amount": 2000,
  "currency": "XOF",
  "orderId": "tx_123456",
  "description": "Recharge de solde",
  "returnUrl": "https://monsaas.com/success",
  "customer": {
    "email": "client@example.com",
    "name": "Jean Dupont"
  }
}
```

**Réponse JSON** :
```json
{
  "success": true,
  "paymentId": "pay_12345",
  "orderId": "tx_123456",
  "checkoutUrl": "https://lomopay.net/pay/checkout_...",
  "provider": "lomopay",
  "status": "pending"
}
```

---

### 2. Format du Webhook reçu par votre SaaS
Le Hub envoie cette requête à votre `webhookUrl` dès qu'un paiement est validé :

**Headers reçus** :
- `X-Hub-Signature: sha256=...` (Signature HMAC-SHA256 calculée avec votre `webhookSecret`)
- `X-Hub-App-Id: verifsms`

**Payload reçu** :
```json
{
  "event": "payment.succeeded",
  "appId": "verifsms",
  "paymentId": "pay_12345",
  "orderId": "tx_123456",
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

## 📁 Structure du Projet

```text
saas-payment-hub/
├── Dockerfile                  # Image Docker optimisée
├── docker-compose.yml          # Déploiement conteneurisé
├── render.yaml                 # Blueprint Render.com en 1 clic
├── package.json                # Dépendances Node.js & TypeScript
├── tsconfig.json               # Configuration TypeScript
├── .env.example                # Modèle de variables d'environnement
├── public/                     # Interface Web Dashboard
│   ├── index.html              # UI du tableau de bord
│   ├── style.css               # Styles & animations
│   └── app.js                  # Logique JavaScript interactive
├── sdk/                        # SDK TypeScript pour vos SaaS
│   ├── client.ts
│   └── README.md
└── src/
    ├── config/                 # Gestion dynamique et persistante de la config
    ├── controllers/            # Contrôleurs API, Webhooks et Administration
    ├── middleware/             # Authentification API Key
    ├── providers/              # Adaptateurs passerelles (LomoPay, Whop, Stripe, Chariow)
    ├── routes/                 # Routes Express (/api/v1/payments, /webhooks, /api/v1/admin)
    ├── services/               # Services métier (Paiement, Logger, Dispatcher)
    ├── types/                  # Types TypeScript
    └── server.ts               # Serveur Express & point d'entrée
```
