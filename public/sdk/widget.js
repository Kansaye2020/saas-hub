/**
 * SaaS Payment Hub Widget & Popup SDK
 * Permet d'ouvrir le paiement dans un modal ou dans une popup indépendante.
 */
class HubWidgetClass {
    constructor() {
        this.iframe = null;
        this.container = null;
        this.overlay = null;
        this.hubUrl = window.location.origin || 'https://checkout.relyx.xyz';
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
            if (event.data && (event.data.type === 'HUB_PAYMENT_SUCCESS' || event.data.type === 'payment_success')) {
                console.log('✅ HubWidget: Paiement confirmé reçu par postMessage:', event.data);
                if (typeof this.onSuccessCallback === 'function') {
                    this.onSuccessCallback(event.data);
                }
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
                background: rgba(0,0,0,0.6);
                backdrop-filter: blur(5px);
                z-index: 999998;
                opacity: 0;
                transition: opacity 0.3s ease;
                display: none;
            }
            .hub-widget-container {
                position: fixed;
                top: 50%; left: 50%;
                transform: translate(-50%, -45%);
                width: 100%;
                max-width: 440px;
                height: 92vh;
                max-height: 720px;
                background: transparent;
                z-index: 999999;
                opacity: 0;
                transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
                display: none;
                border-radius: 24px;
                overflow: hidden;
            }
            .hub-widget-container.active, .hub-widget-overlay.active {
                display: block;
            }
            .hub-widget-container.show {
                opacity: 1;
                transform: translate(-50%, -50%);
            }
            .hub-widget-overlay.show {
                opacity: 1;
            }
            .hub-widget-iframe {
                width: 100%;
                height: 100%;
                border: none;
                border-radius: 24px;
                background: transparent;
            }
            .hub-widget-close {
                position: absolute;
                top: 14px;
                right: 14px;
                background: rgba(255,255,255,0.9);
                border: 1px solid rgba(0,0,0,0.1);
                border-radius: 50%;
                width: 32px;
                height: 32px;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 18px;
                font-weight: bold;
                color: #444;
                z-index: 10;
                box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
            }
            @media (max-width: 480px) {
                .hub-widget-container {
                    max-width: 100%;
                    height: 100%;
                    max-height: 100vh;
                    border-radius: 0;
                }
                .hub-widget-iframe {
                    border-radius: 0;
                }
            }
        `;
        document.head.appendChild(style);
    }

    /**
     * Ouvre le paiement dans une Popup indépendante (Recommandé pour les processeurs bancaires)
     * @param {string} sessionToken - Le token de session ou l'URL de checkout
     * @param {Function} onComplete - Callback optionnel appelé quand le paiement est validé
     */
    openPopup(sessionToken, onComplete) {
        if (!sessionToken) {
            console.error('HubWidget: sessionToken ou checkoutUrl est requis.');
            return;
        }

        if (typeof onComplete === 'function') {
            this.onSuccessCallback = onComplete;
        }

        let url = sessionToken;
        if (!url.startsWith('http')) {
            url = `${this.hubUrl}/checkout/${sessionToken}`;
        }

        const width = 480;
        const height = 750;
        const left = (window.screen.width / 2) - (width / 2);
        const top = (window.screen.height / 2) - (height / 2);

        const popup = window.open(
            url,
            'hub_payment_window',
            `width=${width},height=${height},top=${top},left=${left},scrollbars=yes,resizable=yes`
        );

        if (popup) {
            popup.focus();
        } else {
            // Si le bloqueur de popups bloque, rediriger en secours
            window.location.href = url;
        }
    }

    /**
     * Ouvre le paiement dans une modale iframe sur votre page
     */
    open(sessionToken, onComplete) {
        if (!sessionToken) {
            console.error('HubWidget: sessionToken is required');
            return;
        }

        if (typeof onComplete === 'function') {
            this.onSuccessCallback = onComplete;
        }

        this._createDOM();
        
        let url = sessionToken;
        if (!url.startsWith('http')) {
            url = `${this.hubUrl}/checkout/${sessionToken}?mode=widget`;
        }

        this.iframe.src = url;

        this.overlay.classList.add('active');
        this.container.classList.add('active');
        
        setTimeout(() => {
            this.overlay.classList.add('show');
            this.container.classList.add('show');
        }, 10);
    }

    close() {
        if (!this.container) return;
        
        this.container.classList.remove('show');
        this.overlay.classList.remove('show');
        
        setTimeout(() => {
            this.container.classList.remove('active');
            this.overlay.classList.remove('active');
            this.iframe.src = '';
        }, 300);
    }

    _createDOM() {
        if (this.container) return;

        this.overlay = document.createElement('div');
        this.overlay.className = 'hub-widget-overlay';
        this.overlay.addEventListener('click', () => this.close());
        document.body.appendChild(this.overlay);

        this.container = document.createElement('div');
        this.container.className = 'hub-widget-container';
        
        const closeBtn = document.createElement('button');
        closeBtn.className = 'hub-widget-close';
        closeBtn.innerHTML = '&times;';
        closeBtn.onclick = () => this.close();
        this.container.appendChild(closeBtn);

        this.iframe = document.createElement('iframe');
        this.iframe.className = 'hub-widget-iframe';
        this.iframe.setAttribute('allow', 'payment *; clipboard-write *');
        this.container.appendChild(this.iframe);

        document.body.appendChild(this.container);
    }
}

window.HubWidget = new HubWidgetClass();
