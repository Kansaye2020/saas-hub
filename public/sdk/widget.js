/**
 * SaaS Payment Hub Widget
 * Permet d'afficher la page de paiement dans un modal iframe.
 */
class HubWidgetClass {
    constructor() {
        this.iframe = null;
        this.container = null;
        this.overlay = null;
        this.hubUrl = 'http://localhost:4000'; // Par défaut, à remplacer par votre domaine en prod
    }

    init(options) {
        if (options.hubUrl) {
            this.hubUrl = options.hubUrl;
        }
        this._injectStyles();
    }

    _injectStyles() {
        if (document.getElementById('hub-widget-styles')) return;
        const style = document.createElement('style');
        style.id = 'hub-widget-styles';
        style.innerHTML = `
            .hub-widget-overlay {
                position: fixed;
                top: 0; left: 0; right: 0; bottom: 0;
                background: rgba(0,0,0,0.5);
                backdrop-filter: blur(4px);
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
                max-width: 420px;
                height: 90vh;
                max-height: 700px;
                background: transparent;
                z-index: 999999;
                opacity: 0;
                transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
                display: none;
                border-radius: 16px;
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
                border-radius: 16px;
                background: transparent;
            }
            .hub-widget-close {
                position: absolute;
                top: 10px;
                right: 10px;
                background: rgba(255,255,255,0.8);
                border: none;
                border-radius: 50%;
                width: 32px;
                height: 32px;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 20px;
                color: #333;
                z-index: 10;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
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

    open(sessionToken) {
        if (!sessionToken) {
            console.error('HubWidget: sessionToken is required');
            return;
        }

        this._createDOM();
        
        const url = `${this.hubUrl}/checkout/${sessionToken}?mode=widget`;
        this.iframe.src = url;

        // Show
        this.overlay.classList.add('active');
        this.container.classList.add('active');
        
        // Small delay for CSS transition
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

        // Overlay
        this.overlay = document.createElement('div');
        this.overlay.className = 'hub-widget-overlay';
        this.overlay.addEventListener('click', () => this.close());
        document.body.appendChild(this.overlay);

        // Container
        this.container = document.createElement('div');
        this.container.className = 'hub-widget-container';
        
        // Close button
        const closeBtn = document.createElement('button');
        closeBtn.className = 'hub-widget-close';
        closeBtn.innerHTML = '&times;';
        closeBtn.onclick = () => this.close();
        this.container.appendChild(closeBtn);

        // Iframe
        this.iframe = document.createElement('iframe');
        this.iframe.className = 'hub-widget-iframe';
        this.iframe.setAttribute('allow', 'payment *');
        this.container.appendChild(this.iframe);

        document.body.appendChild(this.container);
    }
}

window.HubWidget = new HubWidgetClass();
