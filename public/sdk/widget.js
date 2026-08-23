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

            if (data === 'ikeepay-close' || (typeof data === 'object' && data.type === 'HUB_PAYMENT_CLOSE')) {
                console.log('ℹ️ HubWidget: Fermeture demandée');
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
                background: #ffffff;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                gap: 12px;
                z-index: 10;
                transition: opacity 0.3s ease;
            }
            .hub-widget-loader-spinner {
                width: 40px;
                height: 40px;
                border: 3.5px solid #e2e8f0;
                border-top-color: #3b82f6;
                border-radius: 50%;
                animation: hub-spin 0.8s linear infinite;
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

        // Loader de chargement élégant
        this.loader = document.createElement('div');
        this.loader.className = 'hub-widget-loader';
        this.loader.innerHTML = `
            <div class="hub-widget-loader-spinner"></div>
            <div style="font-family: system-ui, sans-serif; font-size: 13px; font-weight: 600; color: #64748b;">
                Chargement du paiement sécurisé...
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

