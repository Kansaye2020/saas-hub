/**
 * SaaS Payment Hub Widget & Popup SDK
 * Permet d'intégrer le tunnel de paiement directement en Pop-up / Modale in-app sans quitter votre site.
 * Support natif de Whop Embed, iKeePay et du portail hébergé avec crédit instantané.
 */
class HubWidgetClass {
    constructor() {
        this.iframe = null;
        this.container = null;
        this.overlay = null;
        this.loader = null;
        this.successOverlay = null;
        this.hubUrl = window.location.origin || 'https://checkout.inquart.xyz';
        this.onSuccessCallback = null;
        this.onCloseCallback = null;
        this._setupPostMessageListener();
    }

    init(options = {}) {
        if (options.hubUrl) {
            this.hubUrl = options.hubUrl.replace(/\/$/, '');
        }
        this._injectStyles();
    }

    _setupPostMessageListener() {
        window.addEventListener('message', (event) => {
            const data = event.data;
            if (!data) return;

            const isSuccess = 
                data === 'ikeepay-success' ||
                data === 'payment_success' ||
                data === 'whop:payment:success' ||
                data === 'whop:success' ||
                (typeof data === 'object' && (
                    data.type === 'HUB_PAYMENT_SUCCESS' || 
                    data.type === 'payment_success' || 
                    data.status === 'success' ||
                    data.event === 'payment.succeeded'
                ));

            if (isSuccess) {
                console.log('✅ HubWidget: Paiement confirmé reçu par postMessage:', data);
                this._handleSuccess(data);
            }

            const isCancelOrClose =
                data === 'ikeepay-close' ||
                data === 'payment_cancel' ||
                data === 'whop:payment:cancel' ||
                data === 'whop:close' ||
                (typeof data === 'object' && (
                    data.type === 'HUB_PAYMENT_CLOSE' ||
                    data.type === 'HUB_PAYMENT_CANCEL' ||
                    data.status === 'cancelled' ||
                    data.status === 'cancel'
                ));

            if (isCancelOrClose) {
                console.log('ℹ️ HubWidget: Fermeture ou annulation reçue par postMessage:', data);
                this.close();
            }
        });
    }

    _injectStyles() {
        if (document.getElementById('hub-widget-styles')) return;
        const style = document.createElement('style');
        style.id = 'hub-widget-styles';
        style.innerHTML = `
            .hub-widget-overlay {
                position: fixed;
                top: 0; left: 0; right: 0; bottom: 0;
                background: rgba(15, 23, 42, 0.7);
                backdrop-filter: blur(8px);
                -webkit-backdrop-filter: blur(8px);
                z-index: 999998;
                opacity: 0;
                transition: opacity 0.3s cubic-bezier(0.16, 1, 0.3, 1);
                display: none;
            }
            .hub-widget-container {
                position: fixed;
                top: 50%; left: 50%;
                transform: translate(-50%, -46%) scale(0.97);
                width: 95%;
                max-width: 460px;
                height: 90vh;
                max-height: 740px;
                background: #ffffff;
                z-index: 999999;
                opacity: 0;
                transition: all 0.35s cubic-bezier(0.16, 1, 0.3, 1);
                display: none;
                border-radius: 28px;
                overflow: hidden;
                box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(0, 0, 0, 0.08);
            }
            .hub-widget-container.active, .hub-widget-overlay.active {
                display: block;
            }
            .hub-widget-container.show {
                opacity: 1;
                transform: translate(-50%, -50%) scale(1);
            }
            .hub-widget-overlay.show {
                opacity: 1;
            }
            .hub-widget-iframe {
                width: 100%;
                height: 100%;
                border: none;
                border-radius: 28px;
                background: #ffffff;
                display: block;
            }
            .hub-widget-close {
                position: absolute;
                top: 16px;
                right: 16px;
                background: rgba(241, 245, 249, 0.9);
                border: 1px solid rgba(0, 0, 0, 0.08);
                border-radius: 50%;
                width: 34px;
                height: 34px;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 18px;
                font-weight: 700;
                color: #475569;
                z-index: 20;
                transition: all 0.2s ease;
                box-shadow: 0 2px 6px rgba(0,0,0,0.08);
            }
            .hub-widget-close:hover {
                background: #e2e8f0;
                color: #0f172a;
                transform: scale(1.08);
            }
            .hub-widget-loader {
                position: absolute;
                inset: 0;
                background: radial-gradient(circle at 50% 40%, #ffffff 0%, #f8fafc 100%);
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                padding: 24px;
                text-align: center;
                z-index: 10;
                transition: opacity 0.4s cubic-bezier(0.16, 1, 0.3, 1), transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);
            }
            .hub-anim-logo-container {
                position: relative;
                width: 96px;
                height: 96px;
                display: flex;
                align-items: center;
                justify-content: center;
                margin-bottom: 20px;
            }
            .hub-ripple-ring {
                position: absolute;
                inset: -10px;
                border-radius: 34px;
                border: 2px solid rgba(99, 102, 241, 0.35);
                animation: hub-ripple 2.4s cubic-bezier(0.16, 1, 0.3, 1) infinite;
                pointer-events: none;
            }
            .hub-ripple-ring.ring-2 {
                animation-delay: 0.8s;
            }
            .hub-orbit-spinner {
                position: absolute;
                inset: -5px;
                border-radius: 28px;
                padding: 2px;
                background: linear-gradient(135deg, #4f46e5, #06b6d4, #ec4899, #4f46e5);
                -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
                -webkit-mask-composite: xor;
                mask-composite: exclude;
                animation: hub-spin-grad 3s linear infinite;
            }
            .hub-anim-card-badge {
                position: relative;
                width: 72px;
                height: 72px;
                background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 50%, #2563eb 100%);
                border-radius: 22px;
                display: flex;
                align-items: center;
                justify-content: center;
                box-shadow: 0 14px 30px -6px rgba(79, 70, 229, 0.45), 0 0 0 1px rgba(255, 255, 255, 0.3) inset;
                animation: hub-float-pulse 2.8s ease-in-out infinite;
                overflow: hidden;
            }
            .hub-badge-shimmer {
                position: absolute;
                top: -50%;
                left: -50%;
                width: 200%;
                height: 200%;
                background: linear-gradient(
                    45deg,
                    transparent 40%,
                    rgba(255, 255, 255, 0.45) 50%,
                    transparent 60%
                );
                transform: rotate(25deg);
                animation: hub-shimmer-sweep 2.6s ease-in-out infinite;
            }
            .hub-brand-svg {
                width: 40px;
                height: 40px;
                color: #ffffff;
                filter: drop-shadow(0 2px 6px rgba(0,0,0,0.25));
                z-index: 2;
                animation: hub-card-heartbeat 2.8s ease-in-out infinite;
            }
            .hub-loader-title {
                font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                font-size: 16px;
                font-weight: 800;
                color: #0f172a;
                letter-spacing: -0.02em;
                margin-bottom: 4px;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 6px;
            }
            .hub-loader-subtitle {
                font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                font-size: 12px;
                font-weight: 500;
                color: #64748b;
                margin-bottom: 12px;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 2px;
            }
            .hub-dots span {
                display: inline-block;
                animation: hub-dot-blink 1.4s infinite;
                font-weight: 700;
            }
            .hub-dots span:nth-child(2) { animation-delay: 0.2s; }
            .hub-dots span:nth-child(3) { animation-delay: 0.4s; }
            .hub-loader-badge {
                display: inline-flex;
                align-items: center;
                gap: 5px;
                background: #f1f5f9;
                border: 1px solid #e2e8f0;
                border-radius: 9999px;
                padding: 4px 10px;
                font-size: 11px;
                font-weight: 600;
                color: #475569;
                font-family: system-ui, -apple-system, sans-serif;
            }
            .hub-loader-badge svg {
                width: 12px;
                height: 12px;
                color: #10b981;
            }
            .hub-widget-success-overlay {
                position: absolute;
                inset: 0;
                background: #ffffff;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                padding: 24px;
                text-align: center;
                z-index: 30;
                opacity: 0;
                pointer-events: none;
                transition: all 0.35s cubic-bezier(0.16, 1, 0.3, 1);
            }
            .hub-widget-success-overlay.show {
                opacity: 1;
                pointer-events: auto;
            }
            .hub-widget-check-icon {
                width: 68px;
                height: 68px;
                border-radius: 50%;
                background: #10b981;
                color: #ffffff;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 36px;
                font-weight: 900;
                margin-bottom: 16px;
                box-shadow: 0 10px 25px -5px rgba(16, 185, 129, 0.4);
                animation: hub-bounce 0.6s ease;
            }
            @keyframes hub-ripple {
                0% { transform: scale(0.85); opacity: 0.8; }
                50% { opacity: 0.4; }
                100% { transform: scale(1.6); opacity: 0; }
            }
            @keyframes hub-spin-grad {
                to { transform: rotate(360deg); }
            }
            @keyframes hub-float-pulse {
                0%, 100% {
                    transform: translateY(0) scale(1);
                    box-shadow: 0 14px 30px -6px rgba(79, 70, 229, 0.45), 0 0 0 1px rgba(255, 255, 255, 0.3) inset;
                }
                50% {
                    transform: translateY(-5px) scale(1.04);
                    box-shadow: 0 20px 38px -4px rgba(124, 58, 237, 0.65), 0 0 20px rgba(99, 102, 241, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.45) inset;
                }
            }
            @keyframes hub-card-heartbeat {
                0%, 100% { transform: scale(1); }
                50% { transform: scale(1.08); }
            }
            @keyframes hub-shimmer-sweep {
                0% { transform: translateX(-120%) rotate(25deg); }
                100% { transform: translateX(140%) rotate(25deg); }
            }
            @keyframes hub-dot-blink {
                0%, 20% { opacity: 0; }
                50% { opacity: 1; }
                100% { opacity: 0; }
            }
            @keyframes hub-spin {
                to { transform: rotate(360deg); }
            }
            @keyframes hub-bounce {
                0% { transform: scale(0.3); opacity: 0; }
                50% { transform: scale(1.1); }
                70% { transform: scale(0.95); }
                100% { transform: scale(1); opacity: 1; }
            }
            @media (max-width: 480px) {
                .hub-widget-container {
                    width: 100%;
                    height: 100%;
                    max-height: 100vh;
                    border-radius: 0;
                    top: 0; left: 0;
                    transform: none !important;
                }
                .hub-widget-iframe {
                    border-radius: 0;
                }
            }
        `;
        document.head.appendChild(style);
    }

    /**
     * Flux tout-en-un : Appel à route.ts -> Ouverture Pop-up -> Crédit instantané & Auto-close
     * @param {Object} options
     * @param {string} options.route - URL de votre endpoint Next.js/Node (ex: '/api/checkout')
     * @param {Object} options.payload - Données de la commande { amount, orderId, customerEmail, ... }
     * @param {Function} options.onSuccess - Callback appelé immédiatement à la validation du paiement
     * @param {Function} options.onError - Callback en cas d'erreur de création de session
     * @param {Function} options.onClose - Callback quand la modale est fermée
     */
    async checkout({ route = '/api/checkout', payload = {}, onSuccess, onError, onClose } = {}) {
        this._injectStyles();
        this.onSuccessCallback = onSuccess;
        this.onCloseCallback = onClose;

        try {
            const response = await fetch(route, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await response.json();

            const targetUrl = data.checkoutUrl || (data.token ? `${this.hubUrl}/checkout/${data.token}?mode=widget` : null);

            if (!targetUrl) {
                const errorMsg = data.error || "Impossible d'initialiser la session de paiement.";
                if (typeof onError === 'function') onError(new Error(errorMsg));
                else alert(errorMsg);
                return;
            }

            this.open(targetUrl, { onSuccess, onClose });
        } catch (err) {
            console.error('[HubWidget] Erreur checkout:', err);
            if (typeof onError === 'function') onError(err);
            else alert("Erreur de connexion au serveur de paiement.");
        }
    }

    /**
     * Ouvre le paiement dans une modale iframe sur votre page
     * @param {string} sessionTokenOrUrl - Token de session ou URL directe (Whop, iKeePay, Hub)
     * @param {Function|Object} optionsOrCallback - Callback onSuccess ou objet { onSuccess, onClose }
     */
    open(sessionTokenOrUrl, optionsOrCallback) {
        if (!sessionTokenOrUrl) {
            console.error('HubWidget: sessionToken ou checkoutUrl est requis');
            return;
        }

        if (typeof optionsOrCallback === 'function') {
            this.onSuccessCallback = optionsOrCallback;
        } else if (typeof optionsOrCallback === 'object' && optionsOrCallback !== null) {
            this.onSuccessCallback = optionsOrCallback.onSuccess || null;
            this.onCloseCallback = optionsOrCallback.onClose || null;
        }

        this._createDOM();

        let url = sessionTokenOrUrl;
        if (!url.startsWith('http')) {
            url = `${this.hubUrl}/checkout/${sessionTokenOrUrl}?mode=widget`;
        }

        // Afficher le loader pendant le chargement de l'iframe
        if (this.loader) {
            this.loader.style.opacity = '1';
            this.loader.style.display = 'flex';
        }
        if (this.successOverlay) {
            this.successOverlay.classList.remove('show');
        }

        this.iframe.onload = () => {
            if (this.loader) {
                this.loader.style.opacity = '0';
                setTimeout(() => {
                    if (this.loader) this.loader.style.display = 'none';
                }, 300);
            }
        };

        this.iframe.src = url;

        this.overlay.classList.add('active');
        this.container.classList.add('active');
        
        requestAnimationFrame(() => {
            this.overlay.classList.add('show');
            this.container.classList.add('show');
        });
    }

    /**
     * Gestion du succès : Animation checkmark + notification callback + fermeture automatique
     */
    _handleSuccess(data) {
        if (this.successOverlay) {
            this.successOverlay.classList.add('show');
        }

        // 1. Notifier immédiatement le site client (pour recharger le solde / créditer sans délai)
        if (typeof this.onSuccessCallback === 'function') {
            try {
                this.onSuccessCallback(data);
            } catch (err) {
                console.error('[HubWidget] Erreur dans onSuccessCallback:', err);
            }
        }

        // 2. Fermer automatiquement la modale après 1.4s
        setTimeout(() => {
            this.close();
        }, 1400);
    }

    close() {
        if (!this.container) return;
        
        this.container.classList.remove('show');
        this.overlay.classList.remove('show');
        
        setTimeout(() => {
            this.container.classList.remove('active');
            this.overlay.classList.remove('active');
            if (this.iframe) this.iframe.src = 'about:blank';
            if (this.successOverlay) this.successOverlay.classList.remove('show');
            if (typeof this.onCloseCallback === 'function') {
                this.onCloseCallback();
            }
        }, 300);
    }

    _createDOM() {
        this._injectStyles();
        if (this.container) return;

        this.overlay = document.createElement('div');
        this.overlay.className = 'hub-widget-overlay';
        this.overlay.addEventListener('click', () => this.close());
        document.body.appendChild(this.overlay);

        this.container = document.createElement('div');
        this.container.className = 'hub-widget-container';
        
        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'hub-widget-close';
        closeBtn.innerHTML = '✕';
        closeBtn.setAttribute('aria-label', 'Fermer');
        closeBtn.onclick = () => this.close();
        this.container.appendChild(closeBtn);

        // Loader de chargement élégant avec logo animé SaaS Payment Hub
        this.loader = document.createElement('div');
        this.loader.className = 'hub-widget-loader';
        this.loader.innerHTML = `
            <div class="hub-anim-logo-container">
                <div class="hub-ripple-ring ring-1"></div>
                <div class="hub-ripple-ring ring-2"></div>
                <div class="hub-orbit-spinner"></div>
                <div class="hub-anim-card-badge">
                    <div class="hub-badge-shimmer"></div>
                    <svg class="hub-brand-svg" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <rect x="2" y="5" width="20" height="14" rx="3" fill="currentColor" fill-opacity="0.15" stroke="currentColor" stroke-width="2"/>
                        <path d="M2 10H22" stroke="currentColor" stroke-width="2" stroke-opacity="0.7"/>
                        <rect x="5" y="13" width="4" height="3" rx="0.75" fill="#FDE047"/>
                        <circle cx="17" cy="14.5" r="1.5" fill="#38BDF8"/>
                        <circle cx="14.5" cy="14.5" r="1.5" fill="#F472B6" fill-opacity="0.8"/>
                    </svg>
                </div>
            </div>
            <div class="hub-loader-title">
                <span>SaaS Payment Hub</span>
            </div>
            <div class="hub-loader-subtitle">
                <span>Initialisation sécurisée</span>
                <span class="hub-dots"><span>.</span><span>.</span><span>.</span></span>
            </div>
            <div class="hub-loader-badge">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                    <path d="M9 12l2 2 4-4"/>
                </svg>
                <span>Paiement crypté SSL 256-bit</span>
            </div>
        `;
        this.container.appendChild(this.loader);

        // Écran de succès animé
        this.successOverlay = document.createElement('div');
        this.successOverlay.className = 'hub-widget-success-overlay';
        this.successOverlay.innerHTML = `
            <div class="hub-widget-check-icon">✓</div>
            <h3 style="font-family: system-ui, sans-serif; font-size: 20px; font-weight: 800; color: #0f172a; margin: 0 0 6px 0;">Paiement Confirmé !</h3>
            <p style="font-family: system-ui, sans-serif; font-size: 13px; color: #64748b; margin: 0;">Votre compte a été crédité avec succès.</p>
        `;
        this.container.appendChild(this.successOverlay);

        // Iframe sécurisée avec permissions étendues
        this.iframe = document.createElement('iframe');
        this.iframe.className = 'hub-widget-iframe';
        this.iframe.setAttribute('allow', 'payment *; clipboard-write *; camera *; geolocation *');
        this.container.appendChild(this.iframe);

        document.body.appendChild(this.container);
    }
}

window.HubWidget = new HubWidgetClass();

