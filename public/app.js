// SaaS Payment Hub Frontend Application Logic

let currentConfig = {
  baseUrl: window.location.origin,
  clientApps: [],
  gateways: {},
};

let currentLogs = [];
let currentFilter = "all";
let currentSelectedAppForInteg = null;

// Initialisation au chargement de la page
document.addEventListener("DOMContentLoaded", () => {
  refreshData();
  lucide.createIcons();
  
  // Auto-refresh des logs toutes les 15 secondes si l'onglet logs est actif
  setInterval(() => {
    const activeTab = document.querySelector(".nav-tab.active")?.dataset.target;
    if (activeTab === "tab-logs") {
      fetchLogs(false);
    }
  }, 15000);
});

// Toast Notifications
function showToast(message, type = "success") {
  const container = document.getElementById("toast-container");
  const toast = document.createElement("div");
  toast.className = `toast-item pointer-events-auto flex items-center gap-2.5 px-4 py-3 rounded-xl border text-xs font-medium shadow-2xl backdrop-blur-md transition ${
    type === "success"
      ? "bg-slate-900/90 border-emerald-500/30 text-emerald-300"
      : "bg-slate-900/90 border-rose-500/30 text-rose-300"
  }`;

  const iconName = type === "success" ? "check-circle" : "alert-circle";
  toast.innerHTML = `<i data-lucide="${iconName}" class="w-4 h-4 shrink-0"></i> <span>${message}</span>`;
  container.appendChild(toast);
  lucide.createIcons({ root: toast });

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(10px)";
    setTimeout(() => toast.remove(), 250);
  }, 3500);
}

// Copier dans le presse-papier
function copyToClipboard(text, successMsg = "Copié dans le presse-papier !") {
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    showToast(successMsg, "success");
  }).catch(() => {
    // Fallback pour anciens navigateurs
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    showToast(successMsg, "success");
  });
}

// Basculer d'onglet
function switchTab(tabId) {
  document.querySelectorAll(".tab-pane").forEach((p) => p.classList.add("hidden"));
  document.querySelectorAll(".nav-tab").forEach((b) => b.classList.remove("active"));

  const targetPane = document.getElementById(tabId);
  const targetBtn = document.querySelector(`.nav-tab[data-target="${tabId}"]`);

  if (targetPane) targetPane.classList.remove("hidden");
  if (targetBtn) targetBtn.classList.add("active");

  if (tabId === "tab-logs") {
    fetchLogs();
  } else if (tabId === "tab-render") {
    fetchEnvExport();
  }

  lucide.createIcons();
}

// Masquer/afficher mot de passe
function togglePasswordVisibility(inputId) {
  const input = document.getElementById(inputId);
  if (input) {
    input.type = input.type === "password" ? "text" : "password";
  }
}

// Détecter automatiquement l'URL de base
function autoDetectBaseUrl() {
  const detected = window.location.origin;
  document.getElementById("config-baseUrl").value = detected;
  updateWebhookUrlsDisplay(detected);
  showToast(`URL détectée : ${detected}`);
}

// Mettre à jour l'affichage des URLs de webhooks dans les cards
function updateWebhookUrlsDisplay(baseUrl) {
  const cleanBase = (baseUrl || window.location.origin).replace(/\/$/, "");
  
  const whLomo = document.getElementById("webhook-url-lomopay");
  const whWhop = document.getElementById("webhook-url-whop");
  const whStripe = document.getElementById("webhook-url-stripe");
  const whChariow = document.getElementById("webhook-url-chariow");

  if (whLomo) whLomo.innerText = `${cleanBase}/webhooks/lomopay`;
  if (whWhop) whWhop.innerText = `${cleanBase}/webhooks/whop`;
  if (whStripe) whStripe.innerText = `${cleanBase}/webhooks/stripe`;
  if (whChariow) whChariow.innerText = `${cleanBase}/webhooks/chariow`;

  const curlUrl = document.getElementById("docs-curl-url");
  if (curlUrl) curlUrl.innerText = `${cleanBase}/api/v1/payments/create`;
}

// Actualiser les données
async function refreshData() {
  const icon = document.getElementById("refresh-icon");
  if (icon) icon.classList.add("animate-spin");

  try {
    const res = await fetch("/api/v1/admin/config");
    const data = await res.json();

    if (data.success) {
      currentConfig = data;
      renderAppHeader(data);
      renderClientApps(data.clientApps);
      populateGatewaysForm(data);
      populateSimulatorSelects(data.clientApps);
      fetchEnvExport();
      fetchLogs(false);
    }
  } catch (err) {
    console.error("Erreur lors de la récupération des données:", err);
    showToast("Impossible de contacter le serveur du Hub", "error");
  } finally {
    if (icon) {
      setTimeout(() => icon.classList.remove("animate-spin"), 500);
    }
  }
}

// Header info
function renderAppHeader(data) {
  const headerBaseUrl = document.getElementById("header-base-url");
  if (headerBaseUrl) {
    headerBaseUrl.innerText = data.baseUrl || window.location.origin;
  }

  const appsBadge = document.getElementById("apps-count-badge");
  if (appsBadge) {
    appsBadge.innerText = (data.clientApps || []).length;
  }

  // Count active gateways
  let activeCount = 0;
  if (data.gateways) {
    if (data.gateways.lomopay?.configured) activeCount++;
    if (data.gateways.whop?.configured) activeCount++;
    if (data.gateways.stripe?.configured) activeCount++;
    if (data.gateways.chariow?.configured) activeCount++;
  }

  const gwBadge = document.getElementById("gateways-active-badge");
  if (gwBadge) {
    gwBadge.innerText = `${activeCount}/4`;
  }
}

// Rendu des SaaS Clients
function renderClientApps(apps) {
  const container = document.getElementById("apps-container");
  if (!container) return;

  if (!apps || apps.length === 0) {
    container.innerHTML = `
      <div class="col-span-full bg-slate-900/40 p-8 rounded-2xl border border-dashed border-slate-800 text-center space-y-3">
        <div class="w-12 h-12 rounded-2xl bg-indigo-500/10 text-indigo-400 mx-auto flex items-center justify-center">
          <i data-lucide="plug-zap" class="w-6 h-6"></i>
        </div>
        <h4 class="font-bold text-white text-sm">Aucun SaaS connecté</h4>
        <p class="text-xs text-slate-400 max-w-md mx-auto">
          Ajoutez votre première application cliente (ex: VerifSMS, Bubble, Make.com, etc.) pour générer vos clés de communication sécurisées.
        </p>
        <button onclick="openAppModal()" class="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition">
          <i data-lucide="plus" class="w-4 h-4"></i> Ajouter un SaaS
        </button>
      </div>
    `;
    lucide.createIcons({ root: container });
    return;
  }

  container.innerHTML = apps
    .map(
      (app) => `
    <div class="bg-slate-900 rounded-2xl border border-slate-800 p-6 flex flex-col justify-between space-y-5 hover:border-slate-700 transition">
      <div>
        <div class="flex items-start justify-between gap-3 mb-3">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/30 text-indigo-300 font-bold flex items-center justify-center uppercase">
              ${app.name ? app.name.slice(0, 2) : "AP"}
            </div>
            <div>
              <h3 class="font-bold text-white text-sm flex items-center gap-2">
                ${escapeHtml(app.name)}
                <span class="text-[11px] px-2 py-0.5 rounded-full bg-slate-800 text-indigo-400 border border-slate-700 font-mono">ID: ${escapeHtml(app.id)}</span>
              </h3>
              <p class="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                <i data-lucide="link" class="w-3 h-3 text-slate-500"></i>
                <span class="truncate max-w-[220px]" title="${escapeHtml(app.webhookUrl || "Aucune URL de webhook")}">${escapeHtml(app.webhookUrl || "Aucune URL configurée")}</span>
              </p>
            </div>
          </div>

          <div class="flex items-center gap-1">
            <button onclick='openAppModal(${JSON.stringify(app)})' class="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition" title="Modifier">
              <i data-lucide="edit-2" class="w-3.5 h-3.5"></i>
            </button>
            <button onclick="deleteApp('${app.id}')" class="p-1.5 hover:bg-rose-500/10 rounded-lg text-slate-400 hover:text-rose-400 transition" title="Supprimer">
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            </button>
          </div>
        </div>

        <!-- Clé API Box -->
        <div class="bg-slate-950 p-3 rounded-xl border border-slate-800/80 space-y-2 mt-4">
          <div>
            <div class="flex items-center justify-between text-[11px] font-medium text-slate-400 mb-1">
              <span>Clé API Client (X-Hub-Api-Key)</span>
              <button onclick="copyToClipboard('${app.apiKey}', 'Clé API copiée !')" class="text-indigo-400 hover:underline flex items-center gap-1">
                <i data-lucide="copy" class="w-3 h-3"></i> Copier
              </button>
            </div>
            <code class="text-xs font-mono text-emerald-400 break-all block bg-slate-900/60 p-1.5 rounded border border-slate-800/50">${escapeHtml(app.apiKey)}</code>
          </div>

          <div>
            <div class="flex items-center justify-between text-[11px] font-medium text-slate-400 mb-1">
              <span>Secret du Webhook (Signature HMAC-SHA256)</span>
              <button onclick="copyToClipboard('${app.webhookSecret}', 'Secret Webhook copié !')" class="text-indigo-400 hover:underline flex items-center gap-1">
                <i data-lucide="copy" class="w-3 h-3"></i> Copier
              </button>
            </div>
            <code class="text-xs font-mono text-violet-400 break-all block bg-slate-900/60 p-1.5 rounded border border-slate-800/50">${escapeHtml(app.webhookSecret)}</code>
          </div>
        </div>
      </div>

      <!-- Footer Buttons -->
      <div class="pt-2 border-t border-slate-800/60 flex items-center justify-between gap-2">
        <button onclick='openIntegrationModal(${JSON.stringify(app)})' class="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300 rounded-lg flex items-center gap-1.5 transition">
          <i data-lucide="code-2" class="w-3.5 h-3.5 text-indigo-400"></i>
          Intégrer dans mon SaaS
        </button>

        <button onclick="quickTestWebhookForApp('${app.id}')" class="px-3 py-1.5 bg-violet-600/10 hover:bg-violet-600/20 text-violet-300 border border-violet-500/20 text-xs font-medium rounded-lg flex items-center gap-1.5 transition">
          <i data-lucide="radio" class="w-3.5 h-3.5"></i>
          Tester Webhook
        </button>
      </div>
    </div>
  `
    )
    .join("");

  lucide.createIcons({ root: container });
}

// Remplir le formulaire des passerelles
function populateGatewaysForm(data) {
  const baseUrlInput = document.getElementById("config-baseUrl");
  if (baseUrlInput) {
    baseUrlInput.value = data.baseUrl || window.location.origin;
  }

  updateWebhookUrlsDisplay(data.baseUrl);

  // LomoPay
  const lomo = data.gateways?.lomopay;
  if (lomo) {
    document.getElementById("lomopay-publicKey").value = lomo.publicKey || "";
    document.getElementById("lomopay-secretKey").value = lomo.secretKey || "";
    document.getElementById("lomopay-apiUrl").value = lomo.apiUrl || "https://lomopay.net/api/v1/payments.php";
    
    const badge = document.getElementById("badge-lomopay");
    if (badge) {
      badge.innerText = lomo.configured ? "Configuré" : "En attente";
      badge.className = `text-xs px-2 py-0.5 rounded-full font-medium ${
        lomo.configured
          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
          : "bg-slate-800 text-slate-400 border border-slate-700"
      }`;
    }
  }

  // Whop
  const whop = data.gateways?.whop;
  if (whop) {
    document.getElementById("whop-apiKey").value = whop.apiKey || "";
    document.getElementById("whop-companyId").value = whop.companyId || "";
    document.getElementById("whop-isSandbox").checked = Boolean(whop.isSandbox);

    const badge = document.getElementById("badge-whop");
    if (badge) {
      badge.innerText = whop.configured ? "Configuré" : "En attente";
      badge.className = `text-xs px-2 py-0.5 rounded-full font-medium ${
        whop.configured
          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
          : "bg-slate-800 text-slate-400 border border-slate-700"
      }`;
    }
  }

  // Stripe
  const stripe = data.gateways?.stripe;
  if (stripe) {
    document.getElementById("stripe-secretKey").value = stripe.secretKey || "";
    document.getElementById("stripe-webhookSecret").value = stripe.webhookSecret || "";

    const badge = document.getElementById("badge-stripe");
    if (badge) {
      badge.innerText = stripe.configured ? "Configuré" : "Optionnel";
      badge.className = `text-xs px-2 py-0.5 rounded-full font-medium ${
        stripe.configured
          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
          : "bg-slate-800 text-slate-400 border border-slate-700"
      }`;
    }
  }

  // Chariow
  const chariow = data.gateways?.chariow;
  if (chariow) {
    document.getElementById("chariow-secretKey").value = chariow.secretKey || "";
    document.getElementById("chariow-publicKey").value = chariow.publicKey || "";

    const badge = document.getElementById("badge-chariow");
    if (badge) {
      badge.innerText = chariow.configured ? "Configuré" : "Optionnel";
      badge.className = `text-xs px-2 py-0.5 rounded-full font-medium ${
        chariow.configured
          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
          : "bg-slate-800 text-slate-400 border border-slate-700"
      }`;
    }
  }
}

// Sauvegarder la configuration des passerelles
async function saveGatewaysConfig() {
  const baseUrl = document.getElementById("config-baseUrl")?.value || "";

  const lomopay = {
    publicKey: document.getElementById("lomopay-publicKey")?.value || "",
    secretKey: document.getElementById("lomopay-secretKey")?.value || "",
    apiUrl: document.getElementById("lomopay-apiUrl")?.value || "https://lomopay.net/api/v1/payments.php",
  };

  const whop = {
    apiKey: document.getElementById("whop-apiKey")?.value || "",
    companyId: document.getElementById("whop-companyId")?.value || "",
    isSandbox: document.getElementById("whop-isSandbox")?.checked || false,
  };

  const stripe = {
    secretKey: document.getElementById("stripe-secretKey")?.value || "",
    webhookSecret: document.getElementById("stripe-webhookSecret")?.value || "",
  };

  const chariow = {
    secretKey: document.getElementById("chariow-secretKey")?.value || "",
    publicKey: document.getElementById("chariow-publicKey")?.value || "",
  };

  try {
    const res = await fetch("/api/v1/admin/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ baseUrl, lomopay, whop, stripe, chariow }),
    });

    const data = await res.json();
    if (data.success) {
      showToast("Configuration des clés enregistrée avec succès !", "success");
      refreshData();
    } else {
      showToast(data.error || "Erreur lors de l'enregistrement", "error");
    }
  } catch (err) {
    showToast("Erreur de connexion au serveur", "error");
  }
}

// Modal SaaS: Ouvrir / Fermer
function openAppModal(app = null) {
  const modal = document.getElementById("modal-app");
  const title = document.getElementById("modal-app-title");
  
  if (app) {
    title.innerText = "Modifier le SaaS";
    document.getElementById("app-id").value = app.id || "";
    document.getElementById("app-id").readOnly = true;
    document.getElementById("app-name").value = app.name || "";
    document.getElementById("app-apiKey").value = app.apiKey || "";
    document.getElementById("app-webhookUrl").value = app.webhookUrl || "";
    document.getElementById("app-webhookSecret").value = app.webhookSecret || "";
  } else {
    title.innerText = "Connecter un nouvel outil / SaaS";
    document.getElementById("app-id").value = "";
    document.getElementById("app-id").readOnly = false;
    document.getElementById("app-name").value = "";
    document.getElementById("app-webhookUrl").value = "";
    generateNewApiKey();
    generateNewWebhookSecret();
  }

  modal.classList.remove("hidden");
  lucide.createIcons();
}

function closeAppModal() {
  document.getElementById("modal-app").classList.add("hidden");
}

// Générer Clé API
function generateNewApiKey() {
  const random = "sec_live_" + Array.from(crypto.getRandomValues(new Uint8Array(12)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  document.getElementById("app-apiKey").value = random;
}

// Générer Secret Webhook
function generateNewWebhookSecret() {
  const random = "whsec_" + Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  document.getElementById("app-webhookSecret").value = random;
}

// Sauvegarder Application SaaS
async function handleSaveApp(e) {
  e.preventDefault();

  const id = document.getElementById("app-id").value.trim();
  const name = document.getElementById("app-name").value.trim();
  const apiKey = document.getElementById("app-apiKey").value.trim();
  const webhookUrl = document.getElementById("app-webhookUrl").value.trim();
  const webhookSecret = document.getElementById("app-webhookSecret").value.trim();

  if (!id || !name) {
    showToast("Veuillez renseigner un ID et un nom pour le SaaS", "error");
    return;
  }

  try {
    const res = await fetch("/api/v1/admin/client-apps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, name, apiKey, webhookUrl, webhookSecret }),
    });

    const data = await res.json();
    if (data.success) {
      showToast(`SaaS "${name}" enregistré avec succès !`, "success");
      closeAppModal();
      refreshData();
    } else {
      showToast(data.error || "Erreur lors de la sauvegarde", "error");
    }
  } catch (err) {
    showToast("Erreur de communication", "error");
  }
}

// Supprimer un SaaS
async function deleteApp(appId) {
  if (!confirm(`Êtes-vous sûr de vouloir supprimer l'application "${appId}" ?`)) return;

  try {
    const res = await fetch(`/api/v1/admin/client-apps/${appId}`, {
      method: "DELETE",
    });
    const data = await res.json();
    if (data.success) {
      showToast(`Application "${appId}" supprimée`, "success");
      refreshData();
    } else {
      showToast(data.error || "Erreur de suppression", "error");
    }
  } catch (err) {
    showToast("Erreur lors de la suppression", "error");
  }
}

// Modal Snippets d'Intégration
function openIntegrationModal(app) {
  currentSelectedAppForInteg = app;
  const modal = document.getElementById("modal-integration");
  document.getElementById("modal-integ-title").innerText = `Intégration de "${app.name}" (${app.id})`;
  switchIntegLang("curl");
  modal.classList.remove("hidden");
  lucide.createIcons();
}

function closeIntegrationModal() {
  document.getElementById("modal-integration").classList.add("hidden");
}

function switchIntegLang(lang) {
  document.querySelectorAll(".integ-lang-btn").forEach((b) => {
    b.classList.remove("bg-indigo-600", "text-white");
    b.classList.add("bg-slate-800", "text-slate-400");
  });
  const activeBtn = document.querySelector(`.integ-lang-btn[data-lang="${lang}"]`);
  if (activeBtn) {
    activeBtn.classList.remove("bg-slate-800", "text-slate-400");
    activeBtn.classList.add("bg-indigo-600", "text-white");
  }

  const app = currentSelectedAppForInteg || {
    id: "verifsms",
    apiKey: "VOTRE_CLE_API",
    webhookSecret: "VOTRE_WEBHOOK_SECRET",
  };

  const hubUrl = (currentConfig.baseUrl || window.location.origin).replace(/\/$/, "");
  const codeEl = document.getElementById("integ-code-content");

  if (lang === "curl") {
    codeEl.innerText = `# 1. Initier un paiement depuis votre serveur
curl -X POST ${hubUrl}/api/v1/payments/create \\
  -H "Content-Type: application/json" \\
  -H "X-Hub-Api-Key: ${app.apiKey}" \\
  -d '{
    "provider": "auto",
    "amount": 2000,
    "currency": "XOF",
    "orderId": "order_${Date.now()}",
    "description": "Recharge de solde",
    "returnUrl": "https://monsaas.com/dashboard/billing",
    "customer": {
      "email": "client@example.com",
      "name": "Jean Dupont"
    }
  }'`;
  } else if (lang === "js") {
    codeEl.innerText = `// Node.js (Fetch / TypeScript / Next.js API Route)
async function createPayment() {
  const response = await fetch("${hubUrl}/api/v1/payments/create", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Hub-Api-Key": "${app.apiKey}",
    },
    body: JSON.stringify({
      provider: "auto", // ou "lomopay", "whop", "stripe"
      amount: 2000,
      currency: "XOF",
      orderId: "order_123456",
      description: "Abonnement Pro",
      returnUrl: "https://monsaas.com/success",
      customer: {
        email: "client@example.com",
        name: "Jean Dupont",
      },
    }),
  });

  const result = await response.json();
  if (result.success) {
    // Redirigez l'utilisateur vers checkoutUrl
    console.log("Lien de paiement:", result.checkoutUrl);
  }
}`;
  } else if (lang === "python") {
    codeEl.innerText = `import requests

url = "${hubUrl}/api/v1/payments/create"
headers = {
    "Content-Type": "application/json",
    "X-Hub-Api-Key": "${app.apiKey}"
}
payload = {
    "provider": "auto",
    "amount": 2000,
    "currency": "XOF",
    "orderId": "order_12345",
    "description": "Paiement en ligne",
    "returnUrl": "https://monsaas.com/success",
    "customer": {
        "email": "client@example.com",
        "name": "Jean Dupont"
    }
}

response = requests.post(url, json=payload, headers=headers)
data = response.json()
print("Lien de paiement:", data.get("checkoutUrl"))`;
  } else if (lang === "php") {
    codeEl.innerText = `<?php
$curl = curl_init();

$payload = [
  "provider" => "auto",
  "amount" => 2000,
  "currency" => "XOF",
  "orderId" => "order_" . time(),
  "description" => "Abonnement",
  "returnUrl" => "https://monsaas.com/success",
  "customer" => [
    "email" => "client@example.com",
    "name" => "Jean Dupont"
  ]
];

curl_setopt_array($curl, [
  CURLOPT_URL => "${hubUrl}/api/v1/payments/create",
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_POST => true,
  CURLOPT_POSTFIELDS => json_encode($payload),
  CURLOPT_HTTPHEADER => [
    "Content-Type: application/json",
    "X-Hub-Api-Key: ${app.apiKey}"
  ],
]);

$response = curl_exec($curl);
curl_close($curl);

$result = json_decode($response, true);
if ($result['success']) {
  header('Location: ' . $result['checkoutUrl']);
  exit;
}`;
  }
}

// Remplir les sélecteurs du simulateur
function populateSimulatorSelects(apps) {
  const paySelect = document.getElementById("test-pay-appId");
  const whSelect = document.getElementById("test-wh-appId");

  if (!apps || apps.length === 0) {
    if (paySelect) paySelect.innerHTML = `<option value="">Aucun SaaS disponible</option>`;
    if (whSelect) whSelect.innerHTML = `<option value="">Aucun SaaS disponible</option>`;
    return;
  }

  const options = apps.map((a) => `<option value="${a.id}">${escapeHtml(a.name)} (${a.id})</option>`).join("");
  if (paySelect) paySelect.innerHTML = options;
  if (whSelect) whSelect.innerHTML = options;
}

// Exécuter un test de paiement
async function handleTestPayment(e) {
  e.preventDefault();

  const appId = document.getElementById("test-pay-appId").value;
  const provider = document.getElementById("test-pay-provider").value;
  const amount = Number(document.getElementById("test-pay-amount").value);
  const currency = document.getElementById("test-pay-currency").value;
  const email = document.getElementById("test-pay-email").value;

  const btn = document.getElementById("btn-submit-pay-test");
  btn.disabled = true;
  btn.innerText = "Génération du paiement...";

  const resultBox = document.getElementById("test-pay-result");
  const badge = document.getElementById("test-pay-status-badge");
  const jsonPre = document.getElementById("test-pay-json");
  const checkoutBox = document.getElementById("test-pay-checkout-box");
  const checkoutLink = document.getElementById("test-pay-checkout-link");

  try {
    const res = await fetch("/api/v1/admin/test-payment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appId, provider, amount, currency, email }),
    });

    const data = await res.json();
    resultBox.classList.remove("hidden");
    jsonPre.innerText = JSON.stringify(data, null, 2);

    if (data.success) {
      badge.innerText = "SUCCÈS";
      badge.className = "text-xs px-2 py-0.5 rounded-full font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20";
      if (data.checkoutUrl) {
        checkoutBox.classList.remove("hidden");
        checkoutLink.href = data.checkoutUrl;
      } else {
        checkoutBox.classList.add("hidden");
      }
      showToast("Lien de paiement généré !", "success");
    } else {
      badge.innerText = "ÉCHEC";
      badge.className = "text-xs px-2 py-0.5 rounded-full font-mono bg-rose-500/10 text-rose-400 border border-rose-500/20";
      checkoutBox.classList.add("hidden");
      showToast(data.error || "Erreur lors de la création du paiement", "error");
    }
  } catch (err) {
    showToast("Erreur de communication", "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i data-lucide="zap" class="w-4 h-4"></i> Générer le lien de paiement`;
    lucide.createIcons({ root: btn });
  }
}

// Exécuter un test de webhook
async function handleTestWebhook(e) {
  e.preventDefault();

  const appId = document.getElementById("test-wh-appId").value;
  const event = document.getElementById("test-wh-event").value;
  const provider = document.getElementById("test-wh-provider").value;
  const amount = Number(document.getElementById("test-wh-amount").value);

  const btn = document.getElementById("btn-submit-wh-test");
  btn.disabled = true;
  btn.innerText = "Envoi du webhook HMAC...";

  const resultBox = document.getElementById("test-wh-result");
  const badge = document.getElementById("test-wh-status-badge");
  const msgEl = document.getElementById("test-wh-message");
  const jsonPre = document.getElementById("test-wh-json");

  try {
    const res = await fetch("/api/v1/admin/test-webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appId, event, provider, amount }),
    });

    const data = await res.json();
    resultBox.classList.remove("hidden");
    msgEl.innerText = data.message || "";
    jsonPre.innerText = JSON.stringify(data.payload, null, 2);

    if (data.success) {
      badge.innerText = "200 OK (VALIDÉ)";
      badge.className = "text-xs px-2 py-0.5 rounded-full font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20";
      showToast("Webhook validé par votre SaaS !", "success");
    } else {
      badge.innerText = "ÉCHEC DE TRANSMISSION";
      badge.className = "text-xs px-2 py-0.5 rounded-full font-mono bg-rose-500/10 text-rose-400 border border-rose-500/20";
      showToast("Le SaaS n'a pas validé le webhook", "error");
    }
  } catch (err) {
    showToast("Erreur d'envoi", "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i data-lucide="radio" class="w-4 h-4"></i> Envoyer le Webhook signé HMAC au SaaS`;
    lucide.createIcons({ root: btn });
  }
}

// Test rapide de webhook depuis la carte SaaS
function quickTestWebhookForApp(appId) {
  switchTab("tab-simulator");
  const select = document.getElementById("test-wh-appId");
  if (select) select.value = appId;
}

// Logs en direct
async function fetchLogs(notify = false) {
  try {
    const res = await fetch(`/api/v1/admin/logs?type=${currentFilter}`);
    const data = await res.json();

    if (data.success) {
      currentLogs = data.logs || [];
      renderLogs(currentLogs);
      const countEl = document.getElementById("logs-count-badge");
      if (countEl) countEl.innerText = currentLogs.length;
      if (notify) showToast("Journal actualisé", "success");
    }
  } catch (err) {
    console.error("Erreur logs:", err);
  }
}

function filterLogs(type) {
  currentFilter = type;
  document.querySelectorAll(".log-filter-btn").forEach((b) => {
    if (b.dataset.filter === type) {
      b.className = "log-filter-btn active px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 text-white transition";
    } else {
      b.className = "log-filter-btn px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-900 hover:bg-slate-800 text-slate-400 transition";
    }
  });
  fetchLogs();
}

function renderLogs(logs) {
  const container = document.getElementById("logs-container");
  if (!container) return;

  if (!logs || logs.length === 0) {
    container.innerHTML = `
      <div class="bg-slate-900/40 p-8 rounded-2xl border border-dashed border-slate-800 text-center space-y-2">
        <i data-lucide="inbox" class="w-8 h-8 text-slate-600 mx-auto"></i>
        <p class="text-xs text-slate-400">Aucun événement enregistré pour le moment.</p>
      </div>
    `;
    lucide.createIcons({ root: container });
    return;
  }

  container.innerHTML = logs
    .map((log) => {
      const levelColors = {
        success: "border-emerald-500/20 bg-emerald-500/5 text-emerald-400",
        error: "border-rose-500/20 bg-rose-500/5 text-rose-400",
        warn: "border-amber-500/20 bg-amber-500/5 text-amber-400",
        info: "border-slate-800 bg-slate-900 text-slate-300",
      };

      const dateStr = new Date(log.timestamp).toLocaleTimeString("fr-FR", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });

      return `
      <div class="p-4 rounded-xl border ${levelColors[log.level] || levelColors.info} flex items-start justify-between gap-3 text-xs">
        <div class="space-y-1">
          <div class="flex items-center gap-2">
            <span class="font-bold text-white">${escapeHtml(log.title)}</span>
            ${log.appId ? `<span class="px-1.5 py-0.5 rounded bg-slate-800 text-indigo-300 font-mono text-[10px]">${escapeHtml(log.appId)}</span>` : ""}
            ${log.amount ? `<span class="px-1.5 py-0.5 rounded bg-slate-800 text-emerald-300 font-mono text-[10px]">${log.amount} ${log.currency || "XOF"}</span>` : ""}
          </div>
          ${log.message ? `<p class="text-slate-400 text-[11px] font-mono break-all">${escapeHtml(log.message)}</p>` : ""}
        </div>
        <span class="text-[10px] text-slate-500 font-mono shrink-0">${dateStr}</span>
      </div>
    `;
    })
    .join("");

  lucide.createIcons({ root: container });
}

async function clearLogs() {
  if (!confirm("Voulez-vous effacer tous les logs ?")) return;
  try {
    await fetch("/api/v1/admin/logs/clear", { method: "POST" });
    showToast("Logs effacés", "success");
    fetchLogs();
  } catch (e) {
    showToast("Erreur lors de l'effacement des logs", "error");
  }
}

// Export pour Render.com
async function fetchEnvExport() {
  try {
    const res = await fetch("/api/v1/admin/env-export");
    const data = await res.json();
    if (data.success) {
      const textarea = document.getElementById("render-env-text");
      if (textarea) textarea.value = data.env;
    }
  } catch (err) {
    console.error("Erreur export env:", err);
  }
}

function openEnvExportModal() {
  switchTab("tab-render");
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
