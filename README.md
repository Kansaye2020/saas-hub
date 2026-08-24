# 💳 SaaS Payment Hub (Unificateur de Paiement Multi-SaaS)

**SaaS Payment Hub** est une infrastructure de paiement unifiée, auto-hébergée et multi-tenant. Elle centralise la gestion de toutes vos passerelles de paiement (**LomoPay, iKeePay, Whop, Stripe, Chariow**) et permet à l'ensemble de vos projets SaaS et sites e-commerce de s'y connecter via une API unique, unifiée et standardisée.

---

## 🌟 Avantages & Fonctionnalités Clés

1. **Isolation Multi-Tenant Complète** :
   - Connectez autant de sites et de SaaS que vous le souhaitez.
   - Chaque site possède son propre Dashboard dédié (`/admin/app/:appId`), ses propres passerelles configurées avec leurs clés API indépendantes chiffrées (AES-256-GCM), ses statistiques de chiffre d'affaires isolées et ses propres URLs de Webhook et de redirection.

2. **Multi-Passerelles Intégrées aux Normes Officielles** :
   - 📱 **LomoPay** : Mobile Money pour l'Afrique de l'Ouest et Centrale (Wave, Orange Money, MTN MoMo, Moov Money) en **XOF** et **XAF** avec confirmation par Webhook signé HMAC-SHA256.
   - ⚡ **iKeePay** :
     - **Checkout Inline** : Tunnel de paiement iframe / WebView (Flutter, React Native, iOS, Android) ultra-fluide sans flash blanc avec écoute des signaux postMessage (`ikeepay-ready`, `ikeepay-success`, `ikeepay-close`).
     - **Encaissement Direct H2H (Payin)** : Prélèvement direct Mobile Money via API.
     - **Retrait Direct H2H (Payout)** : Virement de fonds vers un compte Mobile Money client (`POST /api/v1/payments/ikeepay/payout`).
     - **Cartes Virtuelles (iKeeCard)** : Création et gestion complète de cartes Visa / Mastercard virtuelles (`POST /api/v1/payments/ikeepay/card`).
   - 💳 **Whop** : Cartes bancaires internationales (Visa, Mastercard, Amex), Apple Pay, Google Pay, avec conversion intelligente USD/XOF, transmission des métadonnées et pré-remplissage automatique de l'email client.
   - 💳 **Stripe** : Cartes bancaires internationales directes avec session Checkout officielle.
   - 🔄 **Chariow** : Passerelle Mobile Money alternative.

3. **Dashboard d'Administration Moderne & Réactif** :
   - **Interrupteurs coulissants (Switch Toggles)** : Activez ou désactivez une passerelle pour un site en un clic avec mise à jour en temps réel (AJAX).
   - **Popups Toast Dynamiques (5 secondes)** : Notifications flottantes temporaires adaptatives (🟢 Vert pour Actif / Succès, 🟠 Orange pour Inactif / Désactivé, 🔴 Rouge pour Erreur).
   - **Gestion sécurisée des secrets** : Les clés privées sont masquées (`••••••••`) et chiffrées en base de données.

4. **Expérience Checkout Mobile-First & Marque Blanche** :
   - Page de paiement hébergée responsive ultra-rapide (`/checkout/:token`).
   - **Personnalisation de marque** : Affichez le logo officiel et le nom de chaque site ou entreprise sur le portail de paiement et le dashboard.
   - Support des widgets Pop-up modale et redirection in-app avec logo animé.
   - Pré-remplissage et validation automatique de l'email client pour l'émission des reçus.

5. **Dispatcher de Webhooks Sécurisé** :
   - Les passerelles notifient le Hub, qui vérifie les signatures cryptographiques, met à jour la base de données et transmet un webhook unifié signé HMAC-SHA256 (`x-hub-signature`) à votre SaaS cible.

6. **Base de Données Hybride & Migrations Automatiques** :
   - Support natif de **PostgreSQL (Neon.tech / Supabase / Render / Railway / Koyeb)** en production et de **SQLite** en local, avec auto-migration des tables et colonnes au démarrage.

---

## 🏗️ Architecture du Système

```text
┌─────────────────────────┐     ┌─────────────────────────┐     ┌─────────────────────────┐
│   SaaS 1 (ex: VerifSMS) │     │    SaaS 2 (ex: MonApp)  │     │   SaaS 3 (Futur SaaS)   │
└────────────┬────────────┘     └────────────┬────────────┘     └────────────┬────────────┘
             │                               │                               │
             └───────────────────────┬───────┴───────────────────────────────┘
                                     │  Appel API (POST /checkout/session)
                                     ▼
                      ┌─────────────────────────────┐
                      │      SaaS Payment Hub       │
                      │  (https://checkout....xyz)  │
                      └──────────────┬──────────────┘
                                     │
         ┌───────────────────────────┼───────────────────────────┐
         ▼                           ▼                           ▼
┌──────────────────┐       ┌──────────────────┐       ┌──────────────────┐
│ LomoPay / iKeePay│       │       Whop       │       │      Stripe      │
│ (Wave, OM, MTN)  │       │ (Cartes, AppleP) │       │ (Cartes Directes)│
└────────┬─────────┘       └────────┬─────────┘       └────────┬─────────┘
         │                          │                          │
         └──────────────────────────┼──────────────────────────┘
                                    │ Webhook Validé (HMAC-SHA256)
                                    ▼
                      ┌─────────────────────────────┐
                      │    Dispatcher de Webhooks   │
                      └─────────────┬───────────────┘
                                    │ Notification POST sécurisée (x-hub-signature)
                                    ▼
                      [ Callback vers le SaaS émetteur ]
```

---

## 📁 Structure du Projet

```text
saas-payment-hub/
├── package.json                # Dépendances Node.js & TypeScript
├── tsconfig.json               # Configuration TypeScript
├── render.yaml                 # Fichier Blueprint pour déploiement Render
├── .env.example                # Modèle de variables d'environnement
├── README.md                   # Présentation générale du Hub
├── INTEGRATION_GUIDE.md        # Guide pas-à-pas d'intégration SaaS (Node, PHP, Python)
├── public/                     # Fichiers statiques, pages de test et widget SDK
│   ├── sdk/widget.js           # SDK Pop-up Iframe pour intégration in-app
│   ├── test-redirect.html      # Page de démonstration redirection
│   └── test-widget.html        # Page de démonstration modal pop-up
├── sdk/                        # SDK Client TypeScript pour projets Next.js / Node.js
│   ├── client.ts               # Client API TypeScript et vérification HMAC
│   └── README.md               # Guide d'utilisation du SDK Client
├── views/                      # Vues EJS (Dashboard Admin & Checkout)
│   ├── admin/                  # Login, liste des sites, dashboard site & processeurs
│   └── checkout/               # Page de paiement client mobile-first
└── src/
    ├── config/                 # Gestion des configurations dynamiques
    ├── controllers/            # Contrôleurs de paiement et actions passerelles
    ├── database/               # Connecteur Neon PostgreSQL / SQLite & migrations
    ├── middleware/             # Authentification API SaaS et Session Admin
    ├── providers/              # Adaptateurs (LomoPay, iKeePay, Whop, Stripe, Chariow)
    ├── routes/                 # Routes API, Admin, Webhooks et Checkout
    ├── services/               # Moteurs de paiement et dispatcher de webhooks
    └── server.ts               # Point d'entrée Express
```

---

## ⚙️ Configuration (`.env`)

Créez un fichier `.env` à la racine :

```env
PORT=4000
NODE_ENV=production

# URL publique de votre Hub de paiement
HUB_BASE_URL=https://checkout.votredomaine.com

# Base de données PostgreSQL (ex: Neon.tech / Render / Railway) ou laisser vide pour SQLite
DATABASE_URL=postgresql://user:password@ep-xyz.neon.tech/neondb?sslmode=require

# Identifiants du Master Admin
ADMIN_USERNAME=admin
ADMIN_PASSWORD=votre_mot_de_passe_robuste
ADMIN_JWT_SECRET=un_secret_jwt_tres_long_et_securise
```

---

## 🚀 Déploiement

### Déploiement en 1 Clic (Render / Koyeb / Railway / VPS)

1. Connectez votre dépôt GitHub à votre plateforme d'hébergement.
2. Configurez les commandes de build et démarrage :
   - **Build Command :** `npm run build`
   - **Start Command :** `npm start`
3. Ajoutez vos variables d'environnement (`DATABASE_URL`, `ADMIN_PASSWORD`, `HUB_BASE_URL`).
4. Dans **Settings > Custom Domains**, ajoutez votre sous-domaine (ex: `checkout.inquart.xyz`) et configurez le `CNAME` chez votre registraire DNS.

---

## 💻 Intégration Rapide dans votre SaaS

Pour connecter votre site ou votre SaaS au Hub en 2 minutes :

### 1. Créer une session de paiement (`POST /checkout/session`)

```bash
curl -X POST https://checkout.inquart.xyz/checkout/session \
  -H "Content-Type: application/json" \
  -H "X-Hub-Api-Key: sk_hub_votre_cle_api" \
  -d '{
    "amount": 5000,
    "currency": "FCFA",
    "orderId": "CMD_987654",
    "description": "Recharge de crédits",
    "customerEmail": "client@example.com",
    "returnUrl": "https://monsite.com/merci?orderId=CMD_987654",
    "cancelUrl": "https://monsite.com/tarifs"
  }'
```

**Réponse reçue :**
```json
{
  "success": true,
  "token": "7a8b9c1d2e3f4g5h6j...",
  "checkoutUrl": "https://checkout.inquart.xyz/checkout/7a8b9c1d2e3f4g5h6j..."
}
```

Redirigez simplement le client vers `checkoutUrl`.

---

### 2. Valider la commande via le Webhook

Lorsque le client finalise son paiement (Wave, Orange Money, MTN ou Carte bancaire), votre serveur reçoit une notification instantanée :

```javascript
// Exemple en Node.js / Express
app.post('/api/webhooks/hub-payment', (req, res) => {
  const event = req.body;

  if (event.event === 'payment.succeeded') {
    const orderId = event.orderId;
    const amount = event.amount;

    console.log(`✅ Paiement reçu pour la commande ${orderId} (${amount} FCFA)`);
    // TODO : Valider la commande dans votre base de données
  }

  res.status(200).json({ received: true });
});
```

---

## 📚 Documentation Détaillée

Consultez le guide complet : **[`INTEGRATION_GUIDE.md`](./INTEGRATION_GUIDE.md)** contenant :
* Des exemples complets prêts à copier-coller pour **Next.js (App & Pages Router)**, **PHP / Laravel / WordPress**, **Python (FastAPI / Django)**.
* La vérification de la signature cryptographique **HMAC-SHA256** pour sécuriser vos webhooks.
* L'intégration en mode **Pop-up / Widget Iframe** sur votre site.
