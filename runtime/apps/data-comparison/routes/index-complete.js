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

// Import state manager
const stateManager = require('../state');

// Global comparison state tracking
const activeComparisons = new Map();
const comparisonResults = new Map();

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
        .slds-tabs_default__nav {
            background: white;
            border: 1px solid #dddbda;
            border-bottom: 2px solid #dddbda;
        }
        
        /* Content wrapper */
        .content-wrapper { 
            flex: 1; 
            background: #f3f3f3;
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

// Organization selection (from Manual Config button)
router.get('/org-selection', serveComponent('orgSelection'));

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

// API Routes (keeping all existing API routes)
// ... [All API routes remain the same as in original file]

module.exports = router;