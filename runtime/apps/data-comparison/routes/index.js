// CPQ Toolset v3 - Data Comparison Routes with Complete UI Overhaul
const express = require('express');
const path = require('path');
const fs = require('fs');
const fsPromises = require('fs').promises;
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { getInstance: getPathResolver } = require('../../../shared/utils/pathResolver');
const { logger } = require('../../../shared/utils/logger');
const { getInstance: getSFDXRunner } = require('../../../shared/utils/sfdxRunner');
const { getInstance: getGraphQLRunner } = require('../../../shared/utils/graphqlRunner');
const { getInstance: getPythonRunner } = require('../../../shared/utils/pythonRunner');
const pkgReader = require('../../../shared/utils/pkgFileReader');

const router = express.Router();
const pathResolver = getPathResolver();

// Initialize utilities
const sfdxRunner = getSFDXRunner();
const graphqlRunner = getGraphQLRunner();
const pythonRunner = getPythonRunner();

// Import ParquetConverter (if available)
let ParquetConverter;
try {
  const workerPath = pathResolver.getWorkerPath('data-comparison', 'convertParquet');
  ParquetConverter = require(workerPath).ParquetConverter;
} catch (error) {
  logger.warn('ParquetConverter not available:', error.message);
}

// Import state manager
const stateManager = require('../state');

// Global comparison state tracking
const activeComparisons = new Map();
const comparisonResults = new Map();

// Make them globally accessible for other route modules
global.activeComparisons = activeComparisons;
global.comparisonResults = comparisonResults;

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = pathResolver.getStoragePath('data-comparison', 'uploads');
    if (!pkgReader.existsSync(uploadDir)) {
      pkgReader.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.json', '.csv', '.xlsx'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only JSON, CSV, and Excel files are allowed'), false);
    }
  }
});

// Component configuration builder
function getComponentConfig(componentName, req) {
  const config = {
    componentName,
    currentPath: req.path,
    queryParams: req.query,
    
    // Global settings
    showAppLauncher: true,
    showBreadcrumbs: true,
    showTabs: false,
    showPath: false,
    
    // Breadcrumb configuration
    breadcrumbs: [
      { label: 'Home', url: '/', active: false },
      { label: 'Data Comparison', url: '/data-comparison', active: false }
    ],
    
    // Tab configuration
    tabs: null,
    activeTab: req.query.tab || 'generate',
    
    // Path configuration for workflows
    pathSteps: null,
    currentStep: null
  };

  // Component-specific configurations based on UI requirements
  switch(componentName) {
    case 'welcome':
      // Tab 1: Generate Configuration, Tab 2: Upload Configuration
      config.showTabs = true;
      config.tabs = [
        { id: 'generate', label: 'Generate Configuration', icon: 'settings', active: config.activeTab === 'generate' },
        { id: 'upload', label: 'Upload Configuration', icon: 'upload', active: config.activeTab === 'upload' }
      ];
      break;
      
    case 'orgSelection':
      // Organization selection with button groups
      config.breadcrumbs.push({ label: 'Organization Selection', url: null, active: true });
      config.showTabs = true;
      config.tabs = [
        { id: 'generate', label: 'Generate Configuration', icon: 'settings', active: true },
        { id: 'upload', label: 'Upload Configuration', icon: 'upload', active: false }
      ];
      break;
      
    case 'modeSelection':
      // Mode selection after org selection
      config.breadcrumbs.push({ label: 'Mode Selection', url: null, active: true });
      config.showTabs = true;
      config.tabs = [
        { id: 'generate', label: 'Generate Configuration', icon: 'settings', active: true },
        { id: 'upload', label: 'Upload Configuration', icon: 'upload', active: false }
      ];
      break;
      
    case 'configGenerator':
      // Manual or SOQL configuration
      const mode = req.query.mode || 'manual';
      config.breadcrumbs.push({ 
        label: mode === 'soql' ? 'SOQL Config' : 'Manual Config', 
        url: null, 
        active: true 
      });
      config.showTabs = true;
      config.tabs = [
        { id: 'generate', label: 'Generate Configuration', icon: 'settings', active: true },
        { id: 'upload', label: 'Upload Configuration', icon: 'upload', active: false }
      ];
      
      if (mode === 'manual') {
        // Show path for manual configuration workflow
        config.showPath = true;
        config.pathSteps = [
          { id: 'objects', label: 'Objects & Fields', status: 'current' },
          { id: 'filters', label: 'Filters', status: 'incomplete' },
          { id: 'finalize', label: 'Finalize', status: 'incomplete' }
        ];
        config.currentStep = 'objects';
      }
      
      // Override component to show correct mode
      config.configMode = mode;
      break;
      
    case 'objectSelection':
      config.breadcrumbs.push({ label: 'Manual Config', url: '/data-comparison/config-generator?mode=manual', active: false });
      config.breadcrumbs.push({ label: 'Objects & Fields', url: null, active: true });
      config.showTabs = true;
      config.tabs = [
        { id: 'generate', label: 'Generate Configuration', icon: 'settings', active: true },
        { id: 'upload', label: 'Upload Configuration', icon: 'upload', active: false }
      ];
      config.showPath = true;
      config.pathSteps = [
        { id: 'objects', label: 'Objects & Fields', status: 'current' },
        { id: 'filters', label: 'Filters', status: 'incomplete' },
        { id: 'finalize', label: 'Finalize', status: 'incomplete' }
      ];
      config.currentStep = 'objects';
      break;
      
    case 'filterConfiguration':
      config.breadcrumbs.push({ label: 'Manual Config', url: '/data-comparison/config-generator?mode=manual', active: false });
      config.breadcrumbs.push({ label: 'Filters', url: null, active: true });
      config.showTabs = true;
      config.tabs = [
        { id: 'generate', label: 'Generate Configuration', icon: 'settings', active: true },
        { id: 'upload', label: 'Upload Configuration', icon: 'upload', active: false }
      ];
      config.showPath = true;
      config.pathSteps = [
        { id: 'objects', label: 'Objects & Fields', status: 'complete' },
        { id: 'filters', label: 'Filters', status: 'current' },
        { id: 'finalize', label: 'Finalize', status: 'incomplete' }
      ];
      config.currentStep = 'filters';
      break;
      
    case 'comparisonStatus':
      config.breadcrumbs.push({ label: 'Comparison Status', url: null, active: true });
      config.showTabs = true;
      config.tabs = [
        { id: 'generate', label: 'Generate Configuration', icon: 'settings', active: false },
        { id: 'upload', label: 'Upload Configuration', icon: 'upload', active: true }
      ];
      // No path, use progress indicator instead
      config.showProgressIndicator = true;
      break;
      
    case 'duplicateResolver':
      config.breadcrumbs.push({ label: 'Duplicate Resolver', url: null, active: true });
      config.showTabs = true;
      config.tabs = [
        { id: 'generate', label: 'Generate Configuration', icon: 'settings', active: false },
        { id: 'upload', label: 'Upload Configuration', icon: 'upload', active: true }
      ];
      config.showToast = true;
      config.toastMessage = 'Multiple records share the same foreign key value. Please resolve these duplicates before proceeding with the comparison.';
      config.toastType = 'warning';
      break;
      
    case 'comparisonViewer':
      config.breadcrumbs.push({ label: 'Results', url: null, active: true });
      break;
      
    case 'reportGenerator':
      config.breadcrumbs.push({ label: 'Report', url: null, active: true });
      break;
      
    case 'soqlEditor':
      config.breadcrumbs.push({ label: 'SOQL Configuration', url: null, active: true });
      config.showTabs = true;
      config.tabs = [
        { id: 'generate', label: 'Generate Configuration', icon: 'settings', active: true },
        { id: 'upload', label: 'Upload Configuration', icon: 'upload', active: false }
      ];
      break;
  }
  
  return config;
}

// Enhanced serveComponent function with complete UI
function serveComponent(componentName, additionalData = {}) {
  return (req, res) => {
    try {
      // Get component configuration
      const config = getComponentConfig(componentName, req);
      
      // Merge additional data
      const data = { ...config, ...additionalData };
      
      // Load component files
      let htmlPath = pathResolver.getComponentPath('data-comparison', componentName, 'index.html');
      let cssPath = pathResolver.getComponentPath('data-comparison', componentName, 'index.css');
      let jsPath = pathResolver.getComponentPath('data-comparison', componentName, 'index.js');

      // Handle special cases
      if (componentName === 'comparisonViewer' && !pkgReader.existsSync(htmlPath)) {
        htmlPath = pathResolver.getComponentPath('data-comparison', componentName, 'slds-index.html');
        cssPath = pathResolver.getComponentPath('data-comparison', componentName, 'slds-index.css');
      }
      
      if (componentName === 'configGenerator' && !pkgReader.existsSync(htmlPath)) {
        htmlPath = pathResolver.getComponentPath('data-comparison', componentName, 'improved-index.html');
        cssPath = pathResolver.getComponentPath('data-comparison', componentName, 'index.css');
        const improvedJsPath = pathResolver.getComponentPath('data-comparison', componentName, 'improved-index.js');
        if (pkgReader.existsSync(improvedJsPath)) {
          jsPath = improvedJsPath;
        }
      }

      if (!pkgReader.existsSync(htmlPath)) {
        throw new Error(`Component ${componentName} not found`);
      }

      // Read component content
      let componentHtml = pkgReader.readFileSync(htmlPath, 'utf8');
      let componentCss = pkgReader.existsSync(cssPath) ? pkgReader.readFileSync(cssPath, 'utf8') : '';
      let componentJs = pkgReader.existsSync(jsPath) ? pkgReader.readFileSync(jsPath, 'utf8') : '';

      // Extract body content if full HTML
      const bodyMatch = componentHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
      if (bodyMatch) {
        componentHtml = bodyMatch[1];
      }
      
      // Remove any slds-scope divs from component as we'll add it at the page level
      componentHtml = componentHtml.replace(/<div\s+class="slds-scope"[^>]*>|<\/div>\s*$/gi, '');

      // Build the complete page
      const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${data.breadcrumbs[data.breadcrumbs.length - 1].label} - Data Comparison</title>
    <link rel="stylesheet" href="/shared/assets/slds/styles/salesforce-lightning-design-system.min.css">
    <style>
        /* Global styles */
        html, body { height: 100%; margin: 0; }
        body { background-color: #f3f3f3; }
        .slds-scope { min-height: 100vh; display: flex; flex-direction: column; }
        
        /* App Launcher styles */
        .app-launcher-trigger { cursor: pointer; position: relative; }
        .app-launcher-menu { 
            position: absolute; 
            top: 100%; 
            left: 0; 
            z-index: 9000; 
            min-width: 320px; 
            display: none; 
            margin-top: 0.125rem;
        }
        .app-launcher-menu.slds-is-open { display: block; }
        
        /* Dynamic waffle icon */
        .slds-icon-waffle {
            width: 1.25rem;
            height: 1.25rem;
            display: inline-block;
            position: relative;
        }
        .slds-icon-waffle span {
            width: 0.25rem;
            height: 0.25rem;
            background: #5e5e5e;
            border-radius: 0.125rem;
            position: absolute;
            transition: all 0.3s;
        }
        .slds-icon-waffle .slds-r1 { top: 0; left: 0; }
        .slds-icon-waffle .slds-r2 { top: 0; left: 0.5rem; }
        .slds-icon-waffle .slds-r3 { top: 0; left: 1rem; }
        .slds-icon-waffle .slds-r4 { top: 0.5rem; left: 0; }
        .slds-icon-waffle .slds-r5 { top: 0.5rem; left: 0.5rem; }
        .slds-icon-waffle .slds-r6 { top: 0.5rem; left: 1rem; }
        .slds-icon-waffle .slds-r7 { top: 1rem; left: 0; }
        .slds-icon-waffle .slds-r8 { top: 1rem; left: 0.5rem; }
        .slds-icon-waffle .slds-r9 { top: 1rem; left: 1rem; }
        
        .slds-button:hover .slds-icon-waffle span {
            background: #0070d2;
        }
        
        /* Tab fixes */
        .slds-tabs_default {
            position: relative;
            z-index: 1;
        }
        .slds-tabs_default__nav {
            background: white;
            border: 1px solid #dddbda;
            border-bottom: 2px solid #dddbda;
            margin-top: 0.5rem;
        }
        
        /* Content wrapper */
        .content-wrapper { 
            flex: 1; 
            background: #f3f3f3;
            display: flex;
            flex-direction: column;
        }
        
        /* Fix header z-index */
        .slds-global-header_container {
            position: relative;
            z-index: 100;
        }
        
        /* Component styles */
        ${componentCss}
    </style>
    <script>window.componentData = ${JSON.stringify(data)};</script>
</head>
<body>
    <div class="slds-scope">
        ${data.showAppLauncher ? `
        <!-- Global Header with App Launcher -->
        <header class="slds-global-header_container">
            <div class="slds-global-header slds-grid slds-grid_align-spread">
                <div class="slds-global-header__item">
                    <!-- App Launcher Dynamic Waffle -->
                    <div class="app-launcher-trigger" id="appLauncherTrigger">
                        <button class="slds-button slds-button_icon slds-button_icon-container slds-button_icon-small slds-global-header__button_icon" title="App Launcher">
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
                        
                        <div class="app-launcher-menu" id="appLauncherMenu">
                            <section class="slds-dropdown slds-dropdown_left slds-dropdown_large">
                                <div class="slds-dropdown__header">
                                    <span class="slds-text-heading_small">App Launcher</span>
                                </div>
                                <ul class="slds-dropdown__list" role="menu">
                                    <li class="slds-dropdown__item" role="presentation">
                                        <a href="/data-comparison" role="menuitem">
                                            <span class="slds-truncate">
                                                <span class="slds-icon_container slds-icon-standard-data-mapping slds-m-right_x-small">
                                                    <svg class="slds-icon slds-icon_x-small">
                                                        <use xlink:href="/shared/assets/slds/icons/standard-sprite/svg/symbols.svg#data_mapping"></use>
                                                    </svg>
                                                </span>
                                                Data Comparison
                                            </span>
                                        </a>
                                    </li>
                                    <li class="slds-dropdown__item" role="presentation">
                                        <a href="/permissions-analyser" role="menuitem">
                                            <span class="slds-truncate">
                                                <span class="slds-icon_container slds-icon-standard-user-role slds-m-right_x-small">
                                                    <svg class="slds-icon slds-icon_x-small">
                                                        <use xlink:href="/shared/assets/slds/icons/standard-sprite/svg/symbols.svg#user_role"></use>
                                                    </svg>
                                                </span>
                                                Permissions Analyser
                                            </span>
                                        </a>
                                    </li>
                                </ul>
                            </section>
                        </div>
                    </div>
                </div>
                <div class="slds-global-header__item slds-global-header__item_search">
                    <div class="slds-text-heading_medium">Data Comparison</div>
                </div>
                <div class="slds-global-header__item"></div>
            </div>
        </header>
        ` : ''}
        
        ${data.showBreadcrumbs ? `
        <!-- Breadcrumbs -->
        <nav role="navigation" aria-label="Breadcrumbs" class="slds-p-horizontal_large slds-p-vertical_x-small">
            <ol class="slds-breadcrumb slds-list_horizontal">
                ${data.breadcrumbs.map(crumb => `
                    <li class="slds-breadcrumb__item">
                        ${crumb.url ? `<a href="${crumb.url}">${crumb.label}</a>` : `<span>${crumb.label}</span>`}
                    </li>
                `).join('')}
            </ol>
        </nav>
        ` : ''}
        
        ${data.showTabs ? `
        <!-- Tabs -->
        <div class="slds-p-horizontal_large slds-p-bottom_x-small">
            <div class="slds-tabs_default">
                <ul class="slds-tabs_default__nav" role="tablist">
                    ${data.tabs.map(tab => `
                        <li class="slds-tabs_default__item ${tab.active ? 'slds-is-active' : ''}" role="presentation">
                            <a class="slds-tabs_default__link" href="javascript:void(0);" role="tab" 
                               aria-selected="${tab.active}" data-tab-id="${tab.id}">
                                <span class="slds-tabs__left-icon">
                                    <svg class="slds-icon slds-icon_small slds-icon-text-default">
                                        <use xlink:href="/shared/assets/slds/icons/utility-sprite/svg/symbols.svg#${tab.icon}"></use>
                                    </svg>
                                </span>
                                ${tab.label}
                            </a>
                        </li>
                    `).join('')}
                </ul>
            </div>
        </div>
        ` : ''}
        
        ${data.showPath ? `
        <!-- Path Component for Workflows -->
        <div class="slds-p-horizontal_large slds-p-vertical_small">
            <div class="slds-path">
                <div class="slds-grid slds-path__track">
                    <div class="slds-grid slds-path__scroller-container">
                        <div class="slds-path__scroller">
                            <div class="slds-path__scroller_inner">
                                <ul class="slds-path__nav" role="listbox">
                                    ${data.pathSteps.map(step => `
                                        <li class="slds-path__item ${step.status === 'current' ? 'slds-is-current slds-is-active' : step.status === 'complete' ? 'slds-is-complete' : 'slds-is-incomplete'}" role="presentation">
                                            <a class="slds-path__link" href="javascript:void(0);" role="option" data-step="${step.id}">
                                                <span class="slds-path__stage">
                                                    <svg class="slds-icon slds-icon_x-small" aria-hidden="true">
                                                        <use xlink:href="/shared/assets/slds/icons/utility-sprite/svg/symbols.svg#check"></use>
                                                    </svg>
                                                </span>
                                                <span class="slds-path__title">${step.label}</span>
                                            </a>
                                        </li>
                                    `).join('')}
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        ` : ''}
        
        ${data.showProgressIndicator ? `
        <!-- Progress Indicator for Status -->
        <div class="slds-p-horizontal_large slds-p-vertical_small">
            <div class="slds-progress">
                <ol class="slds-progress__list">
                    <li class="slds-progress__item slds-is-active">
                        <div class="slds-progress__marker"></div>
                        <div class="slds-progress__item_content slds-grid slds-grid_align-spread">
                            <span class="slds-text-title">Data Extraction</span>
                        </div>
                    </li>
                    <li class="slds-progress__item">
                        <div class="slds-progress__marker"></div>
                        <div class="slds-progress__item_content slds-grid slds-grid_align-spread">
                            <span class="slds-text-title">Processing</span>
                        </div>
                    </li>
                    <li class="slds-progress__item">
                        <div class="slds-progress__marker"></div>
                        <div class="slds-progress__item_content slds-grid slds-grid_align-spread">
                            <span class="slds-text-title">Comparison</span>
                        </div>
                    </li>
                    <li class="slds-progress__item">
                        <div class="slds-progress__marker"></div>
                        <div class="slds-progress__item_content slds-grid slds-grid_align-spread">
                            <span class="slds-text-title">Complete</span>
                        </div>
                    </li>
                </ol>
                <div class="slds-progress-bar">
                    <span class="slds-progress-bar__value" style="width: 25%;">
                        <span class="slds-assistive-text">Progress: 25%</span>
                    </span>
                </div>
            </div>
        </div>
        ` : ''}
        
        ${data.showToast ? `
        <!-- Toast Notification -->
        <div class="slds-notify_container slds-is-relative">
            <div class="slds-notify slds-notify_toast slds-theme_${data.toastType}" role="status">
                <span class="slds-assistive-text">${data.toastType}</span>
                <span class="slds-icon_container slds-icon-utility-${data.toastType} slds-m-right_small slds-no-flex slds-align-top">
                    <svg class="slds-icon slds-icon_small">
                        <use xlink:href="/shared/assets/slds/icons/utility-sprite/svg/symbols.svg#${data.toastType}"></use>
                    </svg>
                </span>
                <div class="slds-notify__content">
                    <h2 class="slds-text-heading_small">${data.toastMessage}</h2>
                </div>
            </div>
        </div>
        ` : ''}
        
        <!-- Component Content -->
        <div class="content-wrapper">
            ${componentHtml}
        </div>
    </div>
    
    <script>
        // App Launcher functionality
        if (document.getElementById('appLauncherTrigger')) {
            document.getElementById('appLauncherTrigger').addEventListener('click', function(e) {
                e.stopPropagation();
                const menu = document.getElementById('appLauncherMenu');
                menu.classList.toggle('slds-is-open');
            });
            
            document.addEventListener('click', function() {
                const menu = document.getElementById('appLauncherMenu');
                if (menu && menu.classList.contains('slds-is-open')) {
                    menu.classList.remove('slds-is-open');
                }
            });
            
            const menu = document.getElementById('appLauncherMenu');
            if (menu) {
                menu.addEventListener('click', function(e) {
                    e.stopPropagation();
                });
            }
        }
        
        // Tab functionality with content switching
        const tabLinks = document.querySelectorAll('.slds-tabs_default__link');
        const tabItems = document.querySelectorAll('.slds-tabs_default__item');
        
        tabLinks.forEach((link, index) => {
            link.addEventListener('click', function(e) {
                e.preventDefault();
                const tabId = this.dataset.tabId;
                
                // Update tab states
                tabItems.forEach(item => item.classList.remove('slds-is-active'));
                tabLinks.forEach(l => l.setAttribute('aria-selected', 'false'));
                
                this.parentElement.classList.add('slds-is-active');
                this.setAttribute('aria-selected', 'true');
                
                // Handle tab content switching
                const allTabContents = document.querySelectorAll('.slds-tabs_default__content');
                allTabContents.forEach(content => {
                    if (content.id === 'tab-' + tabId) {
                        content.classList.remove('slds-hide');
                    } else {
                        content.classList.add('slds-hide');
                    }
                });
                
                // Update URL without reload
                const currentPath = window.location.pathname;
                window.history.pushState({tab: tabId}, '', currentPath + '?tab=' + tabId);
            });
        });
        
        // Path navigation
        const pathLinks = document.querySelectorAll('.slds-path__link');
        pathLinks.forEach(link => {
            link.addEventListener('click', function(e) {
                const step = this.dataset.step;
                const currentPath = window.location.pathname;
                
                // Navigate based on step
                if (step === 'objects') {
                    window.location.href = '/data-comparison/object-selection';
                } else if (step === 'filters') {
                    window.location.href = '/data-comparison/filter-configuration';
                } else if (step === 'finalize') {
                    window.location.href = '/data-comparison/finalize-config';
                }
            });
        });
        
        // Component JavaScript
        ${componentJs}
    </script>
</body>
</html>`;

      res.send(fullHtml);
    } catch (error) {
      logger.error(`Error serving component ${componentName}:`, error);
      res.status(500).json({ error: error.message });
    }
  };
}

// Routes

// Main data comparison page with tabs
router.get('/', (req, res) => {
  const activeTab = req.query.tab || 'generate';
  serveComponent('welcome', { activeTab })(req, res);
});

// Organization selection
router.get('/org-selection', serveComponent('orgSelection'));

// Mode selection (after selecting orgs)
router.get('/mode-selection', serveComponent('modeSelection'));

// Config generator (Manual or SOQL)
router.get('/config-generator', serveComponent('configGenerator'));

// Object and field selection
router.get('/object-selection', serveComponent('objectSelection'));

// Filter configuration
router.get('/filter-configuration', serveComponent('filterConfiguration'));

// Finalize configuration
router.get('/finalize-config', serveComponent('finalizeConfig'));

// Comparison status
router.get('/comparison-status', serveComponent('comparisonStatus'));

// Duplicate resolver
router.get('/duplicate-resolver', serveComponent('duplicateResolver'));

// Comparison viewer (results)
router.get('/comparison-viewer', serveComponent('comparisonViewer'));

// Report generator
router.get('/report-generator', serveComponent('reportGenerator'));

// SOQL Editor route
router.get('/soql-editor', serveComponent('soqlEditor'));

// Serve component HTML files directly
router.get('/components/:component/index.html', (req, res) => {
  const { component } = req.params;
  const filePath = pathResolver.getComponentPath('data-comparison', component, 'index.html');
  
  if (pkgReader.existsSync(filePath)) {
    const content = pkgReader.readFileSync(filePath, 'utf8');
    res.setHeader('Content-Type', 'text/html');
    res.send(content);
  } else {
    res.status(404).send('Component not found');
  }
});

// Component static file serving for JavaScript files
router.get('/components/:component/:file', (req, res, next) => {
  const { component, file } = req.params;
  const filePath = pathResolver.getComponentPath('data-comparison', component, file);
  
  try {
    if (pkgReader.existsSync(filePath)) {
      const content = pkgReader.readFileSync(filePath, 'utf8');
      
      // Set content type based on file extension
      const ext = path.extname(file).toLowerCase();
      const contentTypes = {
        '.js': 'application/javascript',
        '.css': 'text/css',
        '.html': 'text/html',
        '.json': 'application/json'
      };
      
      if (contentTypes[ext]) {
        res.setHeader('Content-Type', contentTypes[ext]);
      }
      
      res.send(content);
    } else {
      next();
    }
  } catch (error) {
    logger.error(`Error serving component file ${component}/${file}:`, error);
    next();
  }
});

// API Routes

// Include SOQL API routes
const soqlApiRoutes = require('./soql-api');
router.use('/api/soql', soqlApiRoutes);

// Include missing API routes
const { router: missingApiRouter } = require('./missing-apis');
router.use('/api', missingApiRouter);

// Get authenticated organizations (uses cache if available)
router.get('/api/orgs', async (req, res) => {
  try {
    logger.info('Fetching authenticated organizations');

    // Check if cache is available and fresh (less than 5 minutes old)
    const cacheAge = global.orgCache.lastFetched
      ? (new Date() - global.orgCache.lastFetched) / 1000
      : Infinity;

    if (global.orgCache.data.length > 0 && cacheAge < 300) {
      // Cache hit - use cached data
      logger.info(`Using cached organizations (${global.orgCache.data.length} orgs, ${Math.round(cacheAge)}s old)`);
      return res.json({ orgs: global.orgCache.data, cached: true });
    }

    // Cache miss or stale - fetch fresh data
    logger.info('Cache miss or stale, fetching fresh organizations...');
    const orgs = await sfdxRunner.getAuthenticatedOrgs();

    // Update cache
    global.orgCache.data = orgs;
    global.orgCache.lastFetched = new Date();

    res.json({ orgs, cached: false });
  } catch (error) {
    logger.error('Failed to fetch organizations:', error);
    res.status(500).json({ error: error.message });
  }
});

// Validate organizations
router.post('/api/orgs/validate', async (req, res) => {
  try {
    logger.info('Org validation request received:', req.body);
    const { selectedOrgs } = req.body;
    
    logger.info(`Selected orgs: ${selectedOrgs ? selectedOrgs.length : 0} orgs`, selectedOrgs);
    
    if (!selectedOrgs || selectedOrgs.length < 2) {
      logger.warn('Validation failed: Not enough orgs selected');
      return res.status(400).json({ error: 'At least 2 organizations must be selected' });
    }

    logger.info(`Validating ${selectedOrgs.length} organizations`);
    
    // Validate each org connection
    const validationResults = await Promise.all(
      selectedOrgs.map(async (org) => {
        try {
          // Handle both old format (string) and new format (object with username/alias)
          const orgAlias = typeof org === 'string' ? org : org.alias;
          const result = await sfdxRunner.validateOrg(orgAlias);
          return { orgAlias, isValid: result.valid === true, error: null };
        } catch (error) {
          return { orgAlias, isValid: false, error: error.message };
        }
      })
    );

    const invalidOrgs = validationResults.filter(r => !r.isValid);
    if (invalidOrgs.length > 0) {
      return res.status(400).json({
        error: 'Some organizations failed validation',
        details: invalidOrgs
      });
    }

    res.json({ 
      valid: true, 
      message: 'All organizations validated successfully',
      orgs: selectedOrgs
    });
  } catch (error) {
    logger.error('Organization validation failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get common objects across organizations
router.post('/api/objects/common', async (req, res) => {
  try {
    const { orgs } = req.body;
    
    if (!orgs || orgs.length < 2) {
      return res.status(400).json({ error: 'At least 2 organizations required' });
    }

    logger.info(`Finding common objects across ${orgs.length} organizations`);

    // Get objects from each org with timing
    const startTime = Date.now();
    const orgObjects = await Promise.all(
      orgs.map(async (org) => {
        const orgStart = Date.now();
        // Handle both old format (string) and new format (object with username/alias)
        const orgAlias = typeof org === 'string' ? org : org.alias;
        logger.info(`Fetching objects for ${orgAlias}...`);
        const objects = await sfdxRunner.getObjects(orgAlias);
        logger.info(`Fetched ${objects.length} objects from ${orgAlias} in ${Date.now() - orgStart}ms`);
        return { orgAlias, objects };
      })
    );
    logger.info(`All objects fetched in ${Date.now() - startTime}ms`);

    // Find common objects
    const commonObjects = findCommonObjects(orgObjects);

    res.json({ 
      commonObjects,
      totalCount: commonObjects.length,
      orgCount: orgs.length
    });
  } catch (error) {
    logger.error('Failed to get common objects:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get fields for a specific object
router.post('/api/objects/:objectName/fields', async (req, res) => {
  try {
    const { objectName } = req.params;
    const { orgs } = req.body;

    if (!orgs || orgs.length === 0) {
      return res.status(400).json({ error: 'Organizations required' });
    }

    logger.info(`Getting fields for ${objectName} across ${orgs.length} organizations`);

    // Get fields from each org
    const orgFields = await Promise.all(
      orgs.map(async (org) => {
        const orgAlias = typeof org === 'string' ? org : org.alias;
        const fields = await sfdxRunner.getObjectFields(objectName, orgAlias);
        return { orgAlias, fields };
      })
    );

    // Find common fields across all orgs
    const commonFields = findCommonFields(orgFields);

    res.json({ 
      commonFields,
      fieldCount: commonFields.length,
      objectName
    });
  } catch (error) {
    logger.error('Failed to get object fields:', error);
    res.status(500).json({ error: error.message });
  }
});

// Helper to find common fields
function findCommonFields(orgFields) {
  if (orgFields.length === 0) return [];
  
  // Get fields from first org as baseline
  const firstOrgFields = orgFields[0].fields.map(field => field.name);
  
  // Find fields that exist in all other orgs
  const commonFields = firstOrgFields.filter(fieldName => {
    return orgFields.every(org => 
      org.fields.some(field => field.name === fieldName)
    );
  });
  
  // Get details for common fields from first org
  return commonFields.map(fieldName => 
    orgFields[0].fields.find(field => field.name === fieldName)
  ).filter(field => field != null);
}

// Helper to find common objects
function findCommonObjects(orgObjects) {
  if (orgObjects.length === 0) return [];
  
  // Get objects from first org as baseline
  const firstOrgObjects = orgObjects[0].objects.map(obj => obj.name);
  
  // Find objects that exist in all other orgs
  const commonObjects = firstOrgObjects.filter(objName => {
    return orgObjects.every(org => 
      org.objects.some(obj => obj.name === objName)
    );
  });
  
  // Get details for common objects from first org
  return commonObjects.map(objName => 
    orgObjects[0].objects.find(obj => obj.name === objName)
  ).filter(obj => obj != null);
}

// Upload configuration
router.post('/api/config/upload', upload.single('configFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const configId = uuidv4();
    const configPath = req.file.path;

    // Parse and validate the configuration
    const configContent = await fsPromises.readFile(configPath, 'utf8');
    const config = JSON.parse(configContent);

    logger.info(`Config uploaded: ${configId}, orgs: ${config.orgs?.length}, objects: ${Object.keys(config.objects || {}).length}`);

    res.json({
      success: true,
      configId,
      config: config,
      configPath: configPath,
      message: 'Configuration uploaded successfully'
    });
  } catch (error) {
    logger.error('Failed to upload configuration:', error);
    res.status(500).json({ error: error.message });
  }
});

// Start comparison
router.post('/api/comparison/start', async (req, res) => {
  try {
    const { config } = req.body;

    if (!config) {
      return res.status(400).json({ error: 'Configuration required' });
    }

    // Validate config has required fields
    if (!config.orgs || config.orgs.length < 2) {
      return res.status(400).json({ error: 'At least 2 organizations required' });
    }

    if (!config.objects || Object.keys(config.objects).length === 0) {
      return res.status(400).json({ error: 'At least one object configuration required' });
    }

    const comparisonId = uuidv4();

    logger.info(`Starting comparison ${comparisonId} with ${config.orgs.length} orgs and ${Object.keys(config.objects).length} objects`);

    // Start the comparison process
    activeComparisons.set(comparisonId, {
      config: config,
      status: 'initializing',
      progress: 0,
      startTime: new Date().toISOString(),
      phases: []
    });

    // Process comparison asynchronously
    processComparison(comparisonId, config).catch(error => {
      logger.error(`Comparison ${comparisonId} failed:`, error);
      const comparison = activeComparisons.get(comparisonId);
      if (comparison) {
        comparison.status = 'failed';
        comparison.error = error.message;
        activeComparisons.set(comparisonId, comparison);
      }
    });

    res.json({
      success: true,
      comparisonId,
      message: 'Comparison started'
    });
  } catch (error) {
    logger.error('Failed to start comparison:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get comparison status
router.get('/api/comparison/status/:comparisonId', (req, res) => {
  try {
    const { comparisonId } = req.params;

    const comparison = activeComparisons.get(comparisonId);
    if (!comparison) {
      return res.status(404).json({ error: 'Comparison not found' });
    }

    res.json({
      success: true,
      status: comparison.status,
      progress: comparison.progress || 0,
      startTime: comparison.startTime,
      phases: comparison.phases || [],
      config: comparison.config,
      warnings: comparison.warnings || [],
      error: comparison.error
    });
  } catch (error) {
    logger.error('Failed to get comparison status:', error);
    res.status(500).json({ error: error.message });
  }
});

// Download comparison results
router.get('/api/comparison/:id/download', (req, res) => {
  const { id } = req.params;
  const comparison = activeComparisons.get(id) || comparisonResults.get(id);

  if (!comparison || !comparison.resultPath) {
    return res.status(404).json({ error: 'Results not found' });
  }

  if (!pkgReader.existsSync(comparison.resultPath)) {
    return res.status(404).json({ error: 'Result file not found' });
  }

  // Determine the filename based on the actual file extension
  const ext = path.extname(comparison.resultPath);
  const filename = `comparison_${id}${ext || '.csv'}`;
  res.download(comparison.resultPath, filename);
});

// Async comparison processor
async function processComparison(comparisonId, config) {
  const comparison = activeComparisons.get(comparisonId);

  try {
    // Phase 1: Data Fetching
    logger.info(`Starting data fetch for comparison ${comparisonId}`);
    comparison.status = 'fetching_data';
    comparison.phases.push({ name: 'Data Fetching', status: 'in_progress', progress: 0 });

    // Create data extraction directory
    const dataDir = pathResolver.getStoragePath('data-comparison', 'data-extract', comparisonId);
    if (!pkgReader.existsSync(dataDir)) {
      pkgReader.mkdirSync(dataDir, { recursive: true });
    }

    // Save config to data directory
    const configPath = path.join(dataDir, `config_${comparisonId}.json`);
    pkgReader.writeFileSync(configPath, JSON.stringify(config, null, 2));
    logger.info(`Saved config to: ${configPath}`);

    // Always use GraphQL fetcher for unlimited record support
    logger.info(`Using GraphQL fetcher for comparison ${comparisonId}`);

    // Update config to include dataDir for GraphQL fetcher
    const graphqlConfig = { ...config, dataDir };

    const { spawnGraphQLFetchers } = require(pathResolver.getWorkerPath('data-comparison', 'spawnGraphQLFetchers.js'));

    // Create a progress callback to update the comparison state
    const progressCallback = (progressData) => {
      if (progressData && progressData.percentage !== undefined) {
        comparison.phases[comparison.phases.length - 1].progress = Math.min(progressData.percentage, 99);
        comparison.progress = Math.floor(30 * (progressData.percentage / 100)); // Data fetch is 30% of total

        if (progressData.currentObject) {
          comparison.phases[comparison.phases.length - 1].currentObject = progressData.currentObject;
        }

        logger.info(`Data fetch progress: ${progressData.percentage}% for comparison ${comparisonId}`);
      }
    };

    await spawnGraphQLFetchers(graphqlConfig, comparisonId, null, progressCallback);

    comparison.phases[comparison.phases.length - 1].status = 'completed';
    comparison.phases[comparison.phases.length - 1].progress = 100;
    comparison.progress = 30; // Data fetch complete

    // Phase 2: Duplicate Foreign Key Detection (MUST happen before parquet conversion)
    logger.info(`Running duplicate foreign key detection for ${comparisonId}`);
    comparison.status = 'detecting_duplicates';
    comparison.phases.push({ name: 'Duplicate Detection', status: 'in_progress', progress: 0 });

    // Run duplicate FK detector on JSONL files
    const duplicateDetectorPath = pathResolver.getPythonScript('data-comparison', 'duplicate_fk_detector_jsonl.py');

    const duplicateResult = await pythonRunner.runScriptFile(duplicateDetectorPath, [
      dataDir,
      configPath
    ], { mode: 'exit_code' });

    // Log the stderr (which contains INFO/WARNING messages)
    if (duplicateResult.stderr) {
      logger.info(`Duplicate detection output: ${duplicateResult.stderr}`);
    }

    if (duplicateResult.exitCode === 1) {
      // Duplicates found - load the report
      const reportPath = path.join(dataDir, 'duplicate_fk_report.json');
      if (pkgReader.existsSync(reportPath)) {
        const report = JSON.parse(pkgReader.readFileSync(reportPath, 'utf8'));
        const summary = report.summary;

        // Only require resolution if there are actually duplicates
        if (summary.total_duplicate_fks > 0) {
          logger.warn(`Duplicate foreign keys found: ${summary.total_duplicate_fks} duplicates across ${summary.total_objects_with_duplicates} objects`);

          comparison.duplicatesDetected = true;
          comparison.duplicateDetails = report;
          comparison.status = 'requires_duplicate_resolution';
          comparison.duplicateReportPath = reportPath;
          comparison.warnings = comparison.warnings || [];
          comparison.warnings.push({
            type: 'duplicate_foreign_keys',
            message: `Found ${summary.total_duplicate_fks} duplicate foreign keys across ${summary.total_objects_with_duplicates} objects`,
            severity: 'high',
            requires_resolution: true,
            details: report
          });

          // Stop here and require resolution
          comparison.metadata = comparison.metadata || {};
          comparison.metadata.has_duplicate_fks = true;
          comparison.metadata.duplicate_fk_report = reportPath;

          // Save state and return early
          activeComparisons.set(comparisonId, comparison);
          return;
        } else {
          logger.info('Duplicate detection completed but no duplicates found');
          comparison.duplicatesDetected = false;
        }
      } else {
        logger.error('Duplicates detected but report file not found');
      }
    } else if (duplicateResult.exitCode === 0) {
      logger.info('No duplicate foreign keys found');
      comparison.duplicatesDetected = false;
    } else {
      logger.error(`Duplicate detection returned unexpected exit code: ${duplicateResult.exitCode}`);
      // Continue anyway but log the warning
      comparison.warnings = comparison.warnings || [];
      comparison.warnings.push({
        type: 'duplicate_detection_warning',
        message: 'Duplicate detection completed with warnings',
        severity: 'low'
      });
    }

    comparison.phases[comparison.phases.length - 1].status = 'completed';
    comparison.phases[comparison.phases.length - 1].progress = 100;

    // Phase 2.5: Data Preparation (Convert to Parquet) - AFTER duplicate resolution
    logger.info(`Starting data preparation (parquet conversion) for comparison ${comparisonId}`);
    comparison.status = 'preparing_data';
    comparison.phases.push({ name: 'Parquet Conversion', status: 'in_progress', progress: 0 });

    if (ParquetConverter) {
      const converter = new ParquetConverter();

      // Convert all JSONL files to Parquet
      const conversionResult = await converter.autoConvert(dataDir, {
        recursive: true,
        cleanup: false
      });

      logger.info(`Converted ${conversionResult.converted} JSONL files to Parquet`);
    } else {
      logger.warn('ParquetConverter not available, skipping parquet conversion');
    }

    comparison.phases[comparison.phases.length - 1].progress = 100;
    comparison.progress = 60; // Data prep complete
    comparison.phases[comparison.phases.length - 1].status = 'completed';

    // Phase 3: Run Comparison
    logger.info(`Starting comparison analysis for ${comparisonId}`);
    comparison.status = 'comparing';
    comparison.phases.push({ name: 'Comparison Analysis', status: 'in_progress', progress: 0 });

    // Run comparison using Python script
    const comparisonScriptPath = pathResolver.getPythonScript('data-comparison', 'multi_org_comparison_optimized.py');
    logger.info(`Running multi-org comparison: ${comparisonId}`);

    // Ensure comparison_results directory exists within dataDir
    const comparisonResultsDir = path.join(dataDir, 'comparison_results');
    if (!pkgReader.existsSync(comparisonResultsDir)) {
      pkgReader.mkdirSync(comparisonResultsDir, { recursive: true });
    }

    const comparisonResult = await pythonRunner.runScriptFile(comparisonScriptPath, [dataDir, '--output-dir', comparisonResultsDir], {
      mode: 'text',
      callback: (data) => {
        // Update progress based on output
        const progressMatch = data.match(/Progress: (\d+)%/);
        if (progressMatch) {
          const progress = parseInt(progressMatch[1]);
          comparison.phases[comparison.phases.length - 1].progress = progress;
          comparison.progress = 60 + (progress / 2.5); // Comparison is 40% of total (60-100%)
        }
      }
    });

    comparison.phases[comparison.phases.length - 1].status = 'completed';
    comparison.phases[comparison.phases.length - 1].progress = 100;

    // Phase 4: Generate Results
    logger.info(`Generating results for comparison ${comparisonId}`);
    comparison.status = 'completed';
    comparison.progress = 100;
    comparison.endTime = new Date().toISOString();

    // The optimized script writes results to data-extract/{id}/comparison_results/all_differences.csv
    const sourceResultPath = path.join(dataDir, 'comparison_results', 'all_differences.csv');
    const outputPath = pathResolver.getStoragePath('data-comparison', 'results', `${comparisonId}_results.csv`);

    if (pkgReader.existsSync(sourceResultPath)) {
      // Ensure results directory exists
      const resultsDir = pathResolver.getStoragePath('data-comparison', 'results');
      if (!pkgReader.existsSync(resultsDir)) {
        pkgReader.mkdirSync(resultsDir, { recursive: true });
      }
      // Copy the CSV result to the expected location
      pkgReader.copyFileSync(sourceResultPath, outputPath);
      comparison.resultPath = outputPath;
      logger.info(`Copied results from ${sourceResultPath} to ${outputPath}`);
    } else {
      logger.warn(`Result file not found at expected location: ${sourceResultPath}`);
      // Set to expected path anyway
      comparison.resultPath = outputPath;
    }

    // Move to completed comparisons
    comparisonResults.set(comparisonId, comparison);
    activeComparisons.set(comparisonId, comparison);

    logger.info(`Comparison ${comparisonId} completed successfully`);

  } catch (error) {
    logger.error(`Comparison ${comparisonId} failed:`, error);
    comparison.status = 'failed';
    comparison.error = error.message;
    comparison.endTime = new Date().toISOString();
    activeComparisons.set(comparisonId, comparison);
  }
}

module.exports = router;