// CPQ Toolset v3 - Express Server
const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const compression = require('compression');
const multer = require('multer');
const { getInstance: getPathResolver } = require('./shared/utils/pathResolver');
const { logger } = require('./shared/utils/logger');
const pkgReader = require('./shared/utils/pkgFileReader');
const { getInstance: getSfdxRunner } = require('./shared/utils/sfdxRunner');

const app = express();
const PORT = process.env.PORT || 3030;
const pathResolver = getPathResolver();

// Global caches for improved performance
global.orgCache = {
  data: [],
  lastFetched: null,
  isLoading: false
};

global.objectCache = {
  // orgIds (sorted, joined by ',') -> { data, lastFetched }
  commonObjects: new Map(),
  // orgId + objectName -> { data, lastFetched }
  objectFields: new Map()
};

// Log startup info
logger.info('Starting CPQ Toolset v3...', {
  nodeVersion: process.version,
  platform: process.platform,
  isBundled: pathResolver.isBundled,
  extensionRoot: pathResolver.extensionRoot,
  runtimeDir: pathResolver.runtimeDir
});

// Middleware
app.use(compression());
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Request logging middleware
app.use(logger.middleware());

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = pathResolver.resolveRuntime('tmp', 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
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
    const allowedTypes = ['.json', '.csv', '.xlsx', '.xls'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JSON, CSV, and Excel files are allowed.'));
    }
  }
});

// Static file serving
app.use('/shared/assets', (req, res, next) => {
  try {
    const assetPath = pathResolver.resolveRuntime('shared', 'assets', req.path.slice(1));
    
    // Determine if this is a binary file
    const ext = path.extname(req.path).toLowerCase();
    const binaryExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.ico', '.woff', '.woff2', '.ttf', '.otf'];
    const encoding = binaryExtensions.includes(ext) ? null : 'utf8';
    
    const content = pkgReader.readFileSync(assetPath, encoding);
    
    // Set appropriate content type
    const contentTypes = {
      '.css': 'text/css',
      '.js': 'application/javascript',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.html': 'text/html',
      '.woff': 'font/woff',
      '.woff2': 'font/woff2',
      '.ttf': 'font/ttf',
      '.otf': 'font/otf'
    };
    
    if (contentTypes[ext]) {
      res.setHeader('Content-Type', contentTypes[ext]);
    }
    
    // Set cache headers for assets
    res.setHeader('Cache-Control', 'public, max-age=3600');
    
    res.send(content);
  } catch (error) {
    // File not found, continue to next middleware
    next();
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    version: '3.0.0',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: {
      isBundled: pathResolver.isBundled,
      nodeVersion: process.version,
      platform: process.platform
    }
  });
});

// Debug info endpoint
app.get('/debug', (req, res) => {
  const apps = pathResolver.getAvailableApps();
  res.json({
    paths: {
      extensionRoot: pathResolver.extensionRoot,
      runtimeDir: pathResolver.runtimeDir,
      isBundled: pathResolver.isBundled
    },
    availableApps: apps,
    environment: process.env,
    process: {
      cwd: process.cwd(),
      argv: process.argv,
      execPath: process.execPath
    }
  });
});

// Root route is now handled by shared routes

// Utility endpoints
app.get('/utils/get-apps', (req, res) => {
  const apps = pathResolver.getAvailableApps();
  res.json({
    apps: apps.map(appName => {
      try {
        const appModule = require(path.join(pathResolver.getAppPath(appName), 'index.js'));
        return {
          name: appName,
          title: appModule.title || appName,
          description: appModule.description || 'No description available',
          version: appModule.version || '1.0.0',
          active: true
        };
      } catch (error) {
        return {
          name: appName,
          title: appName,
          description: 'App configuration error',
          version: 'Unknown',
          active: false,
          error: error.message
        };
      }
    })
  });
});

// Add root route directly
app.get('/', (req, res) => {
  // For pkg compatibility, serve HTML directly
  const rootHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Salesforce Comparison Toolset</title>
    <link rel="stylesheet" href="/shared/assets/slds/styles/salesforce-lightning-design-system.min.css">
    <link rel="stylesheet" href="/shared/assets/spinner-fix.css">
    <style>
        html, body { 
            height: 100%; 
            margin: 0;
            background-color: #f3f3f3; 
        }
        .slds-scope { 
            height: 100%;
            display: flex;
            flex-direction: column;
        }
        .app-launcher-trigger { 
            cursor: pointer; 
            position: relative; 
        }
        .app-launcher-menu { 
            position: absolute; 
            top: 100%; 
            left: 0; 
            z-index: 9000; 
            min-width: 320px; 
            display: none; 
        }
        .app-launcher-menu.slds-is-open { 
            display: block; 
        }
        .main-content {
            flex: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-direction: column;
            padding: 2rem;
        }
        .slds-illustration__svg { 
            width: 100%; 
            max-width: 400px; 
            height: auto; 
        }
    </style>
</head>
<body>
    <div class="slds-scope">
        <!-- Global Header with App Launcher -->
        <header class="slds-global-header_container">
            <div class="slds-global-header slds-grid slds-grid_align-spread">
                <div class="slds-global-header__item">
                    <!-- App Launcher Dynamic Waffle Icon on Left -->
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
                        
                        <!-- App Launcher Dropdown Menu -->
                        <div class="app-launcher-menu" id="appLauncherMenu">
                            <section class="slds-dropdown slds-dropdown_left slds-dropdown_large">
                                <div class="slds-dropdown__header">
                                    <span class="slds-text-heading_small">App Launcher</span>
                                </div>
                                <ul class="slds-dropdown__list" role="menu">
                                    <li class="slds-dropdown__item" role="presentation">
                                        <a href="/data-comparison" role="menuitem" tabindex="0">
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
                                        <a href="/permissions-analyser" role="menuitem" tabindex="-1">
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
                    <div class="slds-text-align_center">
                        <div class="slds-text-heading_medium">Salesforce Comparison Toolset</div>
                        <div class="slds-text-body_small slds-text-color_weak">Built for Salesforce</div>
                    </div>
                </div>
                <div class="slds-global-header__item">
                    <!-- Empty for balance -->
                </div>
            </div>
        </header>

        <!-- Full Screen Main Content -->
        <main class="main-content" role="main">
            <!-- Illustration Section -->
            <div class="slds-illustration slds-illustration_large">
                <svg class="slds-illustration__svg" viewBox="0 0 454 271" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
                    <g stroke="none" stroke-width="1" fill="none" fill-rule="evenodd">
                        <g transform="translate(-64.000000, -71.000000)">
                            <g>
                                <g transform="translate(77.000000, 82.000000)" class="slds-illustration__stroke-secondary" stroke-linecap="round" stroke-width="3">
                                    <path vector-effect="non-scaling-stroke" d="M44,17.5 L63,17.5 C62.2789714,12.0723971 64.081543,7.53186978 68.4077148,3.87841797 C73.3754883,-0.195556641 79.2734375,0.717773438 82.440918,2.12353516 C85.6083984,3.52929687 87.9606934,5.46069336 89.5913086,9.10524041 C90.2822266,10.6397351 90.7517904,11.9379883 91,13"></path>
                                    <path vector-effect="non-scaling-stroke" d="M83,20.5 C84.0558105,16.8461914 86.2227783,14.4572754 89.5007324,13.333252 C94.4177246,11.6472168 99.0800781,13.8925781 100.942383,16.1518555 C102.804687,18.4111328 103.39502,20.2260742 103.746582,22.1201172 C103.980957,23.3828125 104.06543,24.8427734 104,26.5 C108.141764,26.3313802 110.918945,27.1647135 112.331543,29 C114.040039,31.1936035 114.215332,33.817627 113.593018,35.75 C112.970703,37.682373 110.894531,40.5 107,40.5 L28,40.5"></path>
                                    <path vector-effect="non-scaling-stroke" d="M18,27.5 L83.0004985,27.5"></path>
                                    <path vector-effect="non-scaling-stroke" d="M0,27.5 L8,27.5"></path>
                                </g>
                                <g transform="translate(135.000000, 152.000000)" class="slds-illustration__stroke-secondary" stroke-linecap="round" stroke-width="3">
                                    <path vector-effect="non-scaling-stroke" d="M44,17.5 L63,17.5 C62.2789714,12.0723971 64.081543,7.53186978 68.4077148,3.87841797 C73.3754883,-0.195556641 79.2734375,0.717773438 82.440918,2.12353516 C85.6083984,3.52929687 87.9606934,5.46069336 89.5913086,9.10524041 C90.2822266,10.6397351 90.7517904,11.9379883 91,13"></path>
                                    <path vector-effect="non-scaling-stroke" d="M83,20.5 C84.0558105,16.8461914 86.2227783,14.4572754 89.5007324,13.333252 C94.4177246,11.6472168 99.0800781,13.8925781 100.942383,16.1518555 C102.804687,18.4111328 103.39502,20.2260742 103.746582,22.1201172 C103.980957,23.3828125 104.06543,24.8427734 104,26.5 C108.141764,26.3313802 110.918945,27.1647135 112.331543,29 C114.040039,31.1936035 114.215332,33.817627 113.593018,35.75 C112.970703,37.682373 110.894531,40.5 107,40.5 L28,40.5"></path>
                                    <path vector-effect="non-scaling-stroke" d="M18,27.5 L83.0004985,27.5"></path>
                                    <path vector-effect="non-scaling-stroke" d="M0,27.5 L8,27.5"></path>
                                </g>
                                <g transform="translate(69.000000, 256.000000)" class="slds-illustration__stroke-secondary" stroke-linecap="round" stroke-width="3">
                                    <path vector-effect="non-scaling-stroke" d="M14,36.5 L464,36.5"></path>
                                    <path vector-effect="non-scaling-stroke" d="M0,36.5 L6,36.5"></path>
                                    <polyline vector-effect="non-scaling-stroke" stroke-linejoin="round" points="234.5 36 234.5 0 319.5 0 319.5 36"></polyline>
                                    <polyline vector-effect="non-scaling-stroke" stroke-linejoin="round" points="289.5 36 289.5 0 374.5 0 374.5 36"></polyline>
                                    <polyline vector-effect="non-scaling-stroke" stroke-linejoin="round" points="124.5 36 124.5 0 209.5 0 209.5 36"></polyline>
                                    <polyline vector-effect="non-scaling-stroke" stroke-linejoin="round" points="344.5 36 344.5 0 429.5 0 429.5 36"></polyline>
                                    <polyline vector-effect="non-scaling-stroke" stroke-linejoin="round" points="179.5 36 179.5 0 264.5 0 264.5 36"></polyline>
                                    <polyline vector-effect="non-scaling-stroke" stroke-linejoin="round" points="69.5 36 69.5 0 154.5 0 154.5 36"></polyline>
                                </g>
                                <g transform="translate(113.000000, 178.000000)">
                                    <g transform="translate(30.000000, 8.000000)" fill="#FFFFFF">
                                        <circle vector-effect="non-scaling-stroke" cx="64" cy="64" r="23"></circle>
                                        <circle vector-effect="non-scaling-stroke" cx="120" cy="11" r="11"></circle>
                                        <circle vector-effect="non-scaling-stroke" cx="4" cy="11" r="4"></circle>
                                        <circle vector-effect="non-scaling-stroke" cx="95" cy="23" r="3"></circle>
                                        <circle vector-effect="non-scaling-stroke" cx="25" cy="23" r="3"></circle>
                                        <circle vector-effect="non-scaling-stroke" cx="14" cy="11" r="2"></circle>
                                        <circle vector-effect="non-scaling-stroke" cx="108" cy="11" r="2"></circle>
                                    </g>
                                </g>
                            </g>
                        </g>
                    </g>
                </svg>
                <div class="slds-text-longform slds-text-align_center">
                    <h3 class="slds-text-heading_large">Choose An App</h3>
                </div>
            </div>
        </main>
    </div>

    <script>
        // App Launcher Toggle
        document.getElementById('appLauncherTrigger').addEventListener('click', function(e) {
            e.stopPropagation();
            const menu = document.getElementById('appLauncherMenu');
            menu.classList.toggle('slds-is-open');
        });

        // Close menu when clicking outside
        document.addEventListener('click', function() {
            const menu = document.getElementById('appLauncherMenu');
            if (menu.classList.contains('slds-is-open')) {
                menu.classList.remove('slds-is-open');
            }
        });

        // Prevent menu clicks from closing the menu
        document.getElementById('appLauncherMenu').addEventListener('click', function(e) {
            e.stopPropagation();
        });
    </script>
</body>
</html>`;
  
  res.send(rootHtml);
});

// Load shared routes for other common routes
try {
  const sharedRoutesPath = pathResolver.getSharedModule('routes', 'index.js');
  if (pkgReader.existsSync(sharedRoutesPath)) {
    const sharedRoutes = require(sharedRoutesPath);
    app.use(sharedRoutes);
    logger.info('Loaded shared routes');
  } else {
    logger.warn('Shared routes not found at:', sharedRoutesPath);
  }
} catch (error) {
  logger.error('Failed to load shared routes', {
    error: error.message,
    stack: error.stack.split('\n').slice(0, 5).join('\n')
  });
}

// Load app routes dynamically
const loadAppRoutes = () => {
  const apps = pathResolver.getAvailableApps();
  
  logger.info(`Loading routes for ${apps.length} apps: ${apps.join(', ')}`);
  
  apps.forEach(appName => {
    try {
      const appPath = pathResolver.getAppPath(appName);
      const routesPath = path.join(appPath, 'routes', 'index.js');
      
      logger.info(`Checking routes for ${appName}:`, {
        appPath,
        routesPath,
        exists: pkgReader.existsSync(routesPath)
      });
      
      if (pkgReader.existsSync(routesPath)) {
        const appRoutes = require(routesPath);
        app.use(`/${appName}`, appRoutes);
        logger.info(`Successfully loaded routes for app: ${appName}`);
      } else {
        logger.warn(`No routes found for app: ${appName} at: ${routesPath}`);
      }
    } catch (error) {
      logger.error(`Failed to load routes for app: ${appName}`, { 
        error: error.message,
        stack: error.stack.split('\n').slice(0, 5).join('\n')
      });
    }
  });
};

// Load apps
loadAppRoutes();

// 404 handler
app.use('*', (req, res) => {
  logger.warn(`404 Not Found: ${req.originalUrl}`);
  res.status(404).json({
    error: 'Not Found',
    path: req.originalUrl,
    timestamp: new Date().toISOString(),
    suggestion: 'Check available endpoints at /utils/get-apps'
  });
});

// Error handler
app.use((error, req, res, next) => {
  logger.error('Server Error:', error);
  
  // Handle multer errors
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        error: 'File too large',
        message: 'File size exceeds the 10MB limit',
        timestamp: new Date().toISOString()
      });
    }
  }
  
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'An error occurred',
    timestamp: new Date().toISOString()
  });
});

// Debug endpoint to check loaded routes
app.get('/debug/routes', (req, res) => {
  const routes = [];
  app._router.stack.forEach(middleware => {
    if (middleware.route) {
      routes.push({
        path: middleware.route.path,
        methods: Object.keys(middleware.route.methods)
      });
    } else if (middleware.name === 'router') {
      routes.push({
        path: middleware.regexp.toString(),
        type: 'router'
      });
    }
  });
  
  res.json({
    routes,
    apps: pathResolver.getAvailableApps(),
    pathResolver: {
      isBundled: pathResolver.isBundled,
      extensionRoot: pathResolver.extensionRoot,
      runtimeDir: pathResolver.runtimeDir
    }
  });
});

// 404 handler - must be last
app.use((req, res) => {
  logger.warn(`404 Not Found: ${req.method} ${req.path}`, {
    headers: req.headers,
    query: req.query
  });
  
  res.status(404).json({
    error: 'Not Found',
    path: req.path,
    method: req.method,
    availableApps: pathResolver.getAvailableApps(),
    message: 'The requested route was not found. Available apps: ' + pathResolver.getAvailableApps().join(', ')
  });
});

// Pre-fetch organizations before starting server
async function preFetchOrganizations() {
  try {
    logger.info('[Startup] Pre-fetching authenticated organizations...');
    global.orgCache.isLoading = true;

    const sfdxRunner = getSfdxRunner();
    const orgs = await sfdxRunner.getAuthenticatedOrgs();

    global.orgCache.data = orgs;
    global.orgCache.lastFetched = new Date();
    global.orgCache.isLoading = false;

    logger.info(`[Startup] Successfully cached ${orgs.length} organizations`);

    if (orgs.length === 0) {
      logger.warn('[Startup] No authenticated organizations found. Users will need to authenticate via Salesforce CLI.');
    } else {
      orgs.forEach(org => {
        logger.info(`  - ${org.alias || org.username} (${org.username})`);
      });
    }
  } catch (error) {
    global.orgCache.isLoading = false;
    logger.warn('[Startup] Failed to pre-fetch organizations (will retry on-demand):', error.message);
    // Don't fail startup if org fetching fails - it will be retried when user requests
  }
}

// Start server and pre-fetch organizations
const server = app.listen(PORT, async () => {
  logger.info(`CPQ Toolset v3 running on http://localhost:${PORT}`);
  logger.info(`Extension root: ${pathResolver.extensionRoot}`);
  logger.info(`Runtime directory: ${pathResolver.runtimeDir}`);
  logger.info(`Bundled mode: ${pathResolver.isBundled}`);

  // Pre-fetch organizations asynchronously after server starts
  // This doesn't block the server from being ready
  await preFetchOrganizations();
});

// Graceful shutdown
const gracefulShutdown = (signal) => {
  logger.info(`${signal} received, starting graceful shutdown...`);
  
  server.close(() => {
    logger.info('HTTP server closed');
    
    // Close database connections, file streams, etc.
    process.exit(0);
  });
  
  // Force shutdown after 10 seconds
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Export for testing
module.exports = app;