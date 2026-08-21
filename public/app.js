// Logique applicative simple et épurée pour SaaS Payment Hub

let currentConfig = {
  baseUrl: window.location.origin,
  clientApps: [],
  gateways: {},
};

document.addEventListener("DOMContentLoaded", () => {
  loadConfig();
  lucide.createIcons();
});

// Toast notification simple
function showToast(message, type = "success") {
  const container = document.getElementById("toast-container");
  const toast = document.createElement("div");
  toast.className = `toast-item pointer-events-auto flex items-center gap-2 px-4 py-2.5 rounded-xl border text-xs font-medium shadow-xl backdrop-blur transition mb-2 ${
    type === "success"
      ? "bg-[#121620]/95 border-emerald-500/30 text-emerald-300"
      : "bg-[#121620]/95 border-rose-500/30 text-rose-300"
  }`;

  const iconName = type === "success" ? "check" : "alert-circle";
  toast.innerHTML = `<i data-lucide="${iconName}" class="w-3.5 h-3.5 shrink-0"></i> <span>${message}</span>`;
  container.appendChild(toast);
  lucide.createIcons({ root: toast });

  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 200);
  }, 3000);
}

// Copier dans le presse-papier
function copyToClipboard(text, msg = "Copié !") {
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    showToast(msg, "success");
  }).catch(() => {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    showToast(msg, "success");
  });
}

// Charger la configuration
async function loadConfig() {
  try {
    const res = await fetch("/api/v1/admin/config");
    const data = await res.json();

    if (data.success) {
      currentConfig = data;
      renderBaseUrl(data.baseUrl);
      renderGateways(data.gateways);
      renderClientApps(data.clientApps);
    }
  } catch (err) {
    console.error("Erreur de chargement:", err);
  }
}

// Mettre à jour l'URL et les Webhooks
function renderBaseUrl(url) {
  const clean = (url || window.location.origin).replace(/\/$/, "");
  const input = document.getElementById("config-baseUrl");
  if (input && !input.value) {
    input.value = clean;
  }

  document.getElementById("wh-lomo").innerText = `${clean}/webhooks/lomopay`;
  document.getElementById("wh-whop").innerText = `${clean}/webhooks/whop`;
  document.getElementById("wh-stripe").innerText = `${clean}/webhooks/stripe`;
  document.getElementById("wh-chariow").innerText = `${clean}/webhooks/chariow`;
}

// Remplir les champs des passerelles
function renderGateways(gateways = {}) {
  // LomoPay
  const lomo = gateways.lomopay || {};
  document.getElementById("lomo-pub").value = lomo.publicKey || "";
  document.getElementById("lomo-sec").value = lomo.secretKey || "";
  updateBadge("badge-lomo", lomo.configured);

  // Whop
  const whop = gateways.whop || {};
  document.getElementById("whop-key").value = whop.apiKey || "";
  document.getElementById("whop-company").value = whop.companyId || "";
  updateBadge("badge-whop", whop.configured);

  // Stripe
  const stripe = gateways.stripe || {};
  document.getElementById("stripe-sec").value = stripe.secretKey || "";
  document.getElementById("stripe-whsec").value = stripe.webhookSecret || "";
  updateBadge("badge-stripe", stripe.configured);

  // Chariow
  const chariow = gateways.chariow || {};
  document.getElementById("chariow-sec").value = chariow.secretKey || "";
  document.getElementById("chariow-pub").value = chariow.publicKey || "";
  updateBadge("badge-chariow", chariow.configured);
}

function updateBadge(id, isConfigured) {
  const el = document.getElementById(id);
  if (!el) return;
  if (isConfigured) {
    el.innerText = "Configuré";
    el.className = "text-[11px] text-emerald-400 font-medium";
  } else {
    el.innerText = "Non configuré";
    el.className = "text-[11px] text-slate-500 font-medium";
  }
}

// Rendu des outils connectés
function renderClientApps(apps = []) {
  const container = document.getElementById("apps-list");
  if (!container) return;

  if (apps.length === 0) {
    container.innerHTML = `
      <div class="bg-[#121620] p-6 rounded-2xl border border-dashed border-white/[0.08] text-center">
        <p class="text-xs text-slate-400">Aucun outil connecté pour le moment.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = apps
    .map(
      (app) => `
    <div class="bg-[#121620] p-5 rounded-2xl border border-white/[0.06] space-y-3">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <span class="font-medium text-sm text-white">${escapeHtml(app.name)}</span>
          <span class="text-[11px] px-2 py-0.5 rounded-full bg-[#0c0e14] text-blue-400 border border-white/[0.05] font-mono">ID: ${escapeHtml(app.id)}</span>
        </div>
        <div class="flex items-center gap-2">
          <button onclick='editApp(${JSON.stringify(app)})' class="text-xs text-slate-400 hover:text-white transition">Modifier</button>
          <button onclick="deleteApp('${app.id}')" class="text-xs text-rose-400 hover:text-rose-300 transition">Supprimer</button>
        </div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
        <div class="bg-[#0c0e14] p-2.5 rounded-xl border border-white/[0.05] space-y-1">
          <div class="flex items-center justify-between text-slate-400 text-[11px]">
            <span>Clé API (à mettre dans votre outil)</span>
            <button onclick="copyToClipboard('${app.apiKey}', 'Clé API copiée !')" class="text-blue-400 hover:underline">Copier</button>
          </div>
          <code class="text-emerald-400 font-mono block truncate">${escapeHtml(app.apiKey)}</code>
        </div>

        <div class="bg-[#0c0e14] p-2.5 rounded-xl border border-white/[0.05] space-y-1">
          <div class="flex items-center justify-between text-slate-400 text-[11px]">
            <span>Webhook destination (votre outil)</span>
          </div>
          <code class="text-slate-300 font-mono block truncate">${escapeHtml(app.webhookUrl || "Aucun webhook configuré")}</code>
        </div>
      </div>
    </div>
  `
    )
    .join("");

  lucide.createIcons({ root: container });
}

// Enregistrer toutes les passerelles et l'URL
async function saveAllSettings() {
  const btn = document.getElementById("btn-top-save");
  if (btn) btn.disabled = true;

  const baseUrl = document.getElementById("config-baseUrl")?.value || "";

  const lomopay = {
    publicKey: document.getElementById("lomo-pub")?.value || "",
    secretKey: document.getElementById("lomo-sec")?.value || "",
  };

  const whop = {
    apiKey: document.getElementById("whop-key")?.value || "",
    companyId: document.getElementById("whop-company")?.value || "",
  };

  const stripe = {
    secretKey: document.getElementById("stripe-sec")?.value || "",
    webhookSecret: document.getElementById("stripe-whsec")?.value || "",
  };

  const chariow = {
    secretKey: document.getElementById("chariow-sec")?.value || "",
    publicKey: document.getElementById("chariow-pub")?.value || "",
  };

  try {
    const res = await fetch("/api/v1/admin/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ baseUrl, lomopay, whop, stripe, chariow }),
    });

    const data = await res.json();
    if (data.success) {
      showToast("Toutes les modifications ont été enregistrées !", "success");
      loadConfig();
    } else {
      showToast(data.error || "Erreur", "error");
    }
  } catch (err) {
    showToast("Erreur de connexion", "error");
  } finally {
    if (btn) btn.disabled = false;
  }
}

// Modal Outil
function openAddAppModal() {
  document.getElementById("modal-title").innerText = "Connecter un outil";
  document.getElementById("app-id").value = "";
  document.getElementById("app-id").readOnly = false;
  document.getElementById("app-name").value = "";
  document.getElementById("app-webhookUrl").value = "";
  document.getElementById("modal-app").classList.remove("hidden");
  lucide.createIcons();
}

function editApp(app) {
  document.getElementById("modal-title").innerText = "Modifier l'outil";
  document.getElementById("app-id").value = app.id || "";
  document.getElementById("app-id").readOnly = true;
  document.getElementById("app-name").value = app.name || "";
  document.getElementById("app-webhookUrl").value = app.webhookUrl || "";
  document.getElementById("modal-app").classList.remove("hidden");
  lucide.createIcons();
}

function closeAppModal() {
  document.getElementById("modal-app").classList.add("hidden");
}

async function handleSaveApp(e) {
  e.preventDefault();

  const id = document.getElementById("app-id").value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "_");
  const name = document.getElementById("app-name").value.trim();
  const webhookUrl = document.getElementById("app-webhookUrl").value.trim();

  // Recherche clé existante ou création
  const existing = currentConfig.clientApps.find((a) => a.id === id);
  const apiKey = existing?.apiKey || `sec_live_${Array.from(crypto.getRandomValues(new Uint8Array(12))).map(b => b.toString(16).padStart(2, '0')).join('')}`;
  const webhookSecret = existing?.webhookSecret || `whsec_${Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b => b.toString(16).padStart(2, '0')).join('')}`;

  try {
    const res = await fetch("/api/v1/admin/client-apps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, name, apiKey, webhookUrl, webhookSecret }),
    });

    const data = await res.json();
    if (data.success) {
      showToast(`Outil "${name}" enregistré !`, "success");
      closeAppModal();
      loadConfig();
    } else {
      showToast(data.error || "Erreur", "error");
    }
  } catch (err) {
    showToast("Erreur lors de l'enregistrement", "error");
  }
}

async function deleteApp(appId) {
  if (!confirm(`Supprimer l'outil "${appId}" ?`)) return;

  try {
    const res = await fetch(`/api/v1/admin/client-apps/${appId}`, { method: "DELETE" });
    const data = await res.json();
    if (data.success) {
      showToast("Outil supprimé", "success");
      loadConfig();
    }
  } catch (err) {
    showToast("Erreur", "error");
  }
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
