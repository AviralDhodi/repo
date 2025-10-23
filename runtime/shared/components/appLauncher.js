// Shared App Launcher Component for SLDS 2.0
class AppLauncher {
    constructor() {
        this.apps = [
            {
                name: 'Data Comparison',
                icon: 'data_mapping',
                url: '/data-comparison',
                description: 'Compare Salesforce data'
            },
            {
                name: 'Permissions Analyser',
                icon: 'user_role',
                url: '/permissions-analyser',
                description: 'Analyze permissions'
            }
        ];
    }

    render() {
        return `
            <div class="app-launcher-trigger" id="appLauncherTrigger">
                <button class="slds-button slds-button_icon slds-button_icon-container slds-button_icon-small slds-global-header__button_icon" title="App Launcher">
                    <svg class="slds-button__icon slds-global-header__icon" aria-hidden="true">
                        <use xlink:href="/shared/assets/slds/icons/utility-sprite/svg/symbols.svg#apps"></use>
                    </svg>
                    <span class="slds-assistive-text">App Launcher</span>
                </button>
                
                <div class="app-launcher-menu" id="appLauncherMenu">
                    <section class="slds-dropdown slds-dropdown_right slds-dropdown_large">
                        <div class="slds-dropdown__header">
                            <span class="slds-text-heading_small">App Launcher</span>
                        </div>
                        <ul class="slds-dropdown__list" role="menu">
                            ${this.apps.map((app, index) => `
                                <li class="slds-dropdown__item" role="presentation">
                                    <a href="${app.url}" role="menuitem" tabindex="${index === 0 ? '0' : '-1'}">
                                        <span class="slds-truncate">
                                            <span class="slds-icon_container slds-icon-standard-${app.icon} slds-m-right_x-small">
                                                <svg class="slds-icon slds-icon_x-small">
                                                    <use xlink:href="/shared/assets/slds/icons/standard-sprite/svg/symbols.svg#${app.icon}"></use>
                                                </svg>
                                            </span>
                                            ${app.name}
                                        </span>
                                    </a>
                                </li>
                            `).join('')}
                        </ul>
                    </section>
                </div>
            </div>
        `;
    }

    attachEventListeners() {
        const trigger = document.getElementById('appLauncherTrigger');
        const menu = document.getElementById('appLauncherMenu');

        if (trigger && menu) {
            // Toggle menu on click
            trigger.addEventListener('click', (e) => {
                e.stopPropagation();
                menu.classList.toggle('slds-is-open');
            });

            // Close menu when clicking outside
            document.addEventListener('click', () => {
                if (menu.classList.contains('slds-is-open')) {
                    menu.classList.remove('slds-is-open');
                }
            });

            // Prevent menu clicks from closing the menu
            menu.addEventListener('click', (e) => {
                e.stopPropagation();
            });
        }
    }

    init(containerId) {
        const container = document.getElementById(containerId);
        if (container) {
            container.innerHTML = this.render();
            this.attachEventListeners();
        }
    }
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AppLauncher;
}