// Shared UI Components for SLDS 2.0 Redesign
// This module provides reusable components for app launcher, breadcrumbs, tabs, and toasts

class SharedUIComponents {
    constructor() {
        this.apps = [
            {
                name: 'Data Comparison',
                icon: 'data_mapping',
                url: '/data-comparison',
                description: 'Compare Salesforce CPQ configurations across multiple orgs'
            },
            {
                name: 'Permissions Analyser', 
                icon: 'user_role',
                url: '/permissions-analyser',
                description: 'Analyze and compare permission sets and profiles'
            }
        ];
    }

    // Render the complete header with app launcher, breadcrumbs, and tabs
    renderHeader(config = {}) {
        const {
            showAppLauncher = true,
            showBreadcrumbs = true,
            showTabs = false,
            breadcrumbs = [],
            tabs = [],
            activeTab = 'generate',
            pageTitle = 'Salesforce Comparison Toolset'
        } = config;

        return `
            <!-- Global Header with App Launcher -->
            <header class="slds-global-header_container">
                <div class="slds-global-header slds-grid slds-grid_align-spread">
                    <div class="slds-global-header__item">
                        ${showAppLauncher ? this.renderAppLauncher() : ''}
                    </div>
                    <div class="slds-global-header__item slds-global-header__item_search">
                        <div class="slds-text-align_center">
                            <div class="slds-text-heading_medium">${pageTitle}</div>
                            <div class="slds-text-body_small slds-text-color_weak">Built for Salesforce</div>
                        </div>
                    </div>
                    <div class="slds-global-header__item">
                        <!-- Empty for balance -->
                    </div>
                </div>
            </header>

            <!-- Breadcrumbs -->
            ${showBreadcrumbs && breadcrumbs.length > 0 ? this.renderBreadcrumbs(breadcrumbs) : ''}

            <!-- Tabs -->
            ${showTabs && tabs.length > 0 ? this.renderTabs(tabs, activeTab) : ''}
        `;
    }

    // Render App Launcher with Waffle Icon
    renderAppLauncher() {
        return `
            <div class="app-launcher-trigger" id="appLauncherTrigger">
                <button class="slds-button slds-button_icon slds-button_icon-container slds-button_icon-small slds-global-header__button_icon" 
                        title="App Launcher" aria-label="App Launcher">
                    <span class="slds-icon-waffle">
                        <span class="slds-r1"></span>
                        <span class="slds-r2"></span>
                        <span class="slds-r3"></span>
                        <span class="slds-r4"></span>
                        <span class="slds-r5"></span>
                        <span class="slds-r6"></span>
                        <span class="slds-r7"></span>
                        <span class="slds-r8"></span>
                        <span class="slds-r9"></span>
                    </span>
                    <span class="slds-assistive-text">App Launcher</span>
                </button>
                
                <!-- App Launcher Dropdown Menu -->
                <div class="app-launcher-menu" id="appLauncherMenu">
                    <section class="slds-dropdown slds-dropdown_left slds-dropdown_large">
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
                                        <span class="slds-text-body_small slds-text-color_weak slds-p-left_xx-large">
                                            ${app.description}
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

    // Render Breadcrumbs
    renderBreadcrumbs(breadcrumbs = []) {
        if (breadcrumbs.length === 0) return '';

        return `
            <nav role="navigation" aria-label="Breadcrumbs" class="slds-p-around_medium">
                <ol class="slds-breadcrumb slds-list_horizontal slds-wrap">
                    ${breadcrumbs.map((crumb, index) => {
                        const isLast = index === breadcrumbs.length - 1;
                        if (isLast) {
                            return `
                                <li class="slds-breadcrumb__item">
                                    <span>${crumb.label}</span>
                                </li>
                            `;
                        } else {
                            return `
                                <li class="slds-breadcrumb__item">
                                    <a href="${crumb.url || '#'}">${crumb.label}</a>
                                </li>
                            `;
                        }
                    }).join('')}
                </ol>
            </nav>
        `;
    }

    // Render Tabs
    renderTabs(tabs = [], activeTab = '') {
        if (tabs.length === 0) return '';

        return `
            <div class="slds-tabs_default slds-p-horizontal_medium">
                <ul class="slds-tabs_default__nav" role="tablist">
                    ${tabs.map(tab => `
                        <li class="slds-tabs_default__item ${tab.active || tab.id === activeTab ? 'slds-is-active' : ''}" 
                            title="${tab.label}" role="presentation">
                            <a class="slds-tabs_default__link" href="javascript:void(0);" 
                               role="tab" tabindex="${tab.active || tab.id === activeTab ? '0' : '-1'}"
                               aria-selected="${tab.active || tab.id === activeTab ? 'true' : 'false'}"
                               data-tab-id="${tab.id}">
                                ${tab.icon ? `
                                    <span class="slds-icon_container slds-icon-utility-${tab.icon} slds-m-right_x-small">
                                        <svg class="slds-icon slds-icon_x-small slds-icon-text-default">
                                            <use xlink:href="/shared/assets/slds/icons/utility-sprite/svg/symbols.svg#${tab.icon}"></use>
                                        </svg>
                                    </span>
                                ` : ''}
                                ${tab.label}
                            </a>
                        </li>
                    `).join('')}
                </ul>
            </div>
        `;
    }

    // Render Toast Notification
    renderToast(message, type = 'info', dismissible = true) {
        const icons = {
            info: 'info',
            success: 'success',
            warning: 'warning',
            error: 'error'
        };

        const themes = {
            info: '',
            success: 'slds-theme_success',
            warning: 'slds-theme_warning',
            error: 'slds-theme_error'
        };

        return `
            <div class="slds-notify_container slds-is-relative" id="toastContainer">
                <div class="slds-notify slds-notify_toast ${themes[type]}" role="status">
                    <span class="slds-assistive-text">${type}</span>
                    <span class="slds-icon_container slds-icon-utility-${icons[type]} slds-m-right_small slds-no-flex slds-align-top">
                        <svg class="slds-icon slds-icon_small">
                            <use xlink:href="/shared/assets/slds/icons/utility-sprite/svg/symbols.svg#${icons[type]}"></use>
                        </svg>
                    </span>
                    <div class="slds-notify__content">
                        <h2 class="slds-text-heading_small">${message}</h2>
                    </div>
                    ${dismissible ? `
                        <div class="slds-notify__close">
                            <button class="slds-button slds-button_icon slds-button_icon-inverse" 
                                    title="Close" onclick="this.closest('.slds-notify_container').remove()">
                                <svg class="slds-button__icon slds-button__icon_large">
                                    <use xlink:href="/shared/assets/slds/icons/utility-sprite/svg/symbols.svg#close"></use>
                                </svg>
                                <span class="slds-assistive-text">Close</span>
                            </button>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }

    // Render Progress Indicator (for comparison status)
    renderProgressIndicator(steps = [], currentStep = 0) {
        return `
            <div class="slds-progress slds-p-around_medium">
                <ol class="slds-progress__list">
                    ${steps.map((step, index) => {
                        let status = 'slds-is-incomplete';
                        if (index < currentStep) status = 'slds-is-complete';
                        if (index === currentStep) status = 'slds-is-active';

                        return `
                            <li class="slds-progress__item ${status}">
                                <button class="slds-button slds-progress__marker" 
                                        aria-describedby="step-${index}-tooltip">
                                    <span class="slds-assistive-text">Step ${index + 1}: ${step.label}</span>
                                </button>
                                <div class="slds-progress__item_content slds-grid slds-grid_align-spread">
                                    <span>${step.label}</span>
                                </div>
                            </li>
                        `;
                    }).join('')}
                </ol>
                <div class="slds-progress-bar slds-progress-bar_x-small" aria-valuemin="0" aria-valuemax="100" 
                     aria-valuenow="${(currentStep / (steps.length - 1)) * 100}" role="progressbar">
                    <span class="slds-progress-bar__value" 
                          style="width: ${(currentStep / (steps.length - 1)) * 100}%">
                        <span class="slds-assistive-text">Progress: ${(currentStep / (steps.length - 1)) * 100}%</span>
                    </span>
                </div>
            </div>
        `;
    }

    // Render File Selector (for upload configuration)
    renderFileSelector(acceptedFormats = '.json') {
        return `
            <div class="slds-form-element">
                <div class="slds-form-element__control">
                    <div class="slds-file-selector slds-file-selector_files" id="fileSelector">
                        <div class="slds-file-selector__dropzone">
                            <input type="file" class="slds-file-selector__input slds-assistive-text" 
                                   accept="${acceptedFormats}" id="file-upload-input" />
                            <label class="slds-file-selector__body" for="file-upload-input">
                                <span class="slds-file-selector__button slds-button slds-button_neutral">
                                    <svg class="slds-button__icon slds-button__icon_left">
                                        <use xlink:href="/shared/assets/slds/icons/utility-sprite/svg/symbols.svg#upload"></use>
                                    </svg>
                                    Upload Configuration
                                </span>
                                <span class="slds-file-selector__text slds-medium-show">
                                    or Drop File Here
                                </span>
                            </label>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    // Initialize event listeners
    attachEventListeners() {
        // App Launcher
        const trigger = document.getElementById('appLauncherTrigger');
        const menu = document.getElementById('appLauncherMenu');

        if (trigger && menu) {
            trigger.addEventListener('click', (e) => {
                e.stopPropagation();
                menu.classList.toggle('slds-is-open');
            });

            document.addEventListener('click', () => {
                if (menu.classList.contains('slds-is-open')) {
                    menu.classList.remove('slds-is-open');
                }
            });

            menu.addEventListener('click', (e) => {
                e.stopPropagation();
            });
        }

        // Tab switching
        const tabLinks = document.querySelectorAll('[data-tab-id]');
        tabLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const tabId = e.currentTarget.dataset.tabId;
                this.switchTab(tabId);
            });
        });
    }

    // Switch tabs
    switchTab(tabId) {
        // Update tab UI
        const tabs = document.querySelectorAll('.slds-tabs_default__item');
        const tabPanels = document.querySelectorAll('[role="tabpanel"]');
        
        tabs.forEach(tab => {
            const link = tab.querySelector('[data-tab-id]');
            if (link && link.dataset.tabId === tabId) {
                tab.classList.add('slds-is-active');
                link.setAttribute('aria-selected', 'true');
                link.setAttribute('tabindex', '0');
            } else {
                tab.classList.remove('slds-is-active');
                if (link) {
                    link.setAttribute('aria-selected', 'false');
                    link.setAttribute('tabindex', '-1');
                }
            }
        });

        // Update tab panels
        tabPanels.forEach(panel => {
            if (panel.dataset.tabContent === tabId) {
                panel.classList.remove('slds-hide');
                panel.classList.add('slds-show');
            } else {
                panel.classList.add('slds-hide');
                panel.classList.remove('slds-show');
            }
        });

        // Trigger custom event
        window.dispatchEvent(new CustomEvent('tabChanged', { detail: { tabId } }));
    }

    // Show toast notification
    showToast(message, type = 'info', duration = 5000) {
        const toastHtml = this.renderToast(message, type);
        const container = document.createElement('div');
        container.innerHTML = toastHtml;
        document.body.appendChild(container.firstElementChild);

        if (duration > 0) {
            setTimeout(() => {
                const toast = document.getElementById('toastContainer');
                if (toast) toast.remove();
            }, duration);
        }
    }
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SharedUIComponents;
}