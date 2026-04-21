// Express server for Family Saga - Replit Deployment
// Serves static files and handles Stripe payment API endpoints

const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const DEFAULT_PORT = Number(process.env.PORT) || 3000;
const MAX_PORT_RETRIES = 20;

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIndex = line.indexOf('=');
    if (eqIndex <= 0) continue;
    const key = line.slice(0, eqIndex).trim();
    if (!key || process.env[key] !== undefined) continue;
    let value = line.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadEnvFile(path.join(__dirname, '.env'));

function getPublicConfig() {
  const defaults = {
    FS_APP_KEY: 'b00KBZ8PWGLG7SJ0A3U1',
    FS_ENVIRONMENT: 'production',
    FS_BASE_URL: 'https://ident.familysearch.org',
    FS_API_BASE_URL: 'https://api.familysearch.org',
    GETFORM_ENDPOINT: 'https://getform.io/f/bdrgewgb',
    TREE_BACKEND_BASE_URL: 'https://family-trees.replit.app'
  };
  const baseUrl = process.env.FS_BASE_URL || defaults.FS_BASE_URL;
  return {
    FS_APP_KEY: process.env.FS_APP_KEY || defaults.FS_APP_KEY,
    FS_ENVIRONMENT: process.env.FS_ENVIRONMENT || defaults.FS_ENVIRONMENT,
    FS_BASE_URL: baseUrl,
    FS_TOKEN_URL: process.env.FS_TOKEN_URL || `${baseUrl}/cis-web/oauth2/v3/token`,
    FS_API_BASE_URL: process.env.FS_API_BASE_URL || defaults.FS_API_BASE_URL,
    GETFORM_ENDPOINT: process.env.GETFORM_ENDPOINT || defaults.GETFORM_ENDPOINT,
    TREE_BACKEND_BASE_URL:
      process.env.TREE_BACKEND_BASE_URL || defaults.TREE_BACKEND_BASE_URL
  };
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes - Mount before static files to ensure they're handled first
app.get('/api/config', (req, res) => {
  const paymentFlow = (process.env.PAYMENT_FLOW || 'true').toLowerCase() === 'true';
  res.json({ paymentFlow });
});

app.get('/api/public-config.js', (req, res) => {
  const publicConfig = getPublicConfig();
  res.type('application/javascript');
  res.set('Cache-Control', 'no-store');
  res.send(`window.APP_CONFIG = Object.assign({}, window.APP_CONFIG || {}, ${JSON.stringify(publicConfig)});`);
});

// Note: These routes use their own body parsing as needed
app.use('/api/create-payment-session', require('./api/create-payment-session'));
app.use('/api/payment-status', require('./api/payment-status'));
// Webhook must be mounted with raw body parser - handled in the route file
app.use('/api/stripe-webhook', require('./api/stripe-webhook'));

// Serve static files (HTML, CSS, JS, images)
// This serves all files in the root directory as static files
app.use(express.static(__dirname, {
  extensions: ['html'], // Allows /page to serve page.html
  index: 'index.html'
}));

// Fallback for SPA-style routing - serve index.html for any non-API routes
app.get('*', (req, res) => {
  // Don't serve index for API routes
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }
  res.sendFile(path.join(__dirname, 'index.html'));
});

function logStartup(port) {
  console.log(`🚀 Family Saga server running on port ${port}`);
  console.log(`📍 Local: http://localhost:${port}`);
  if (process.env.REPL_SLUG && process.env.REPL_OWNER) {
    console.log(`🌐 Replit: https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`);
  }
  console.log(`\n📡 API Endpoints:`);
  console.log(`   POST /api/create-payment-session`);
  console.log(`   POST /api/stripe-webhook`);
  console.log(`   GET  /api/payment-status`);
  console.log(`\n✅ Ready to accept requests!`);
}

function startServer(port, retries = 0) {
  const server = app.listen(port, '0.0.0.0');

  server.on('listening', () => {
    logStartup(port);
  });

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      const hasFixedPort = Boolean(process.env.PORT);
      if (hasFixedPort || retries >= MAX_PORT_RETRIES) {
        console.error(`Port ${port} is already in use.`);
        console.error('Set a different port, for example: PORT=5001 npm run dev');
        process.exit(1);
      }
      const nextPort = port + 1;
      console.warn(`Port ${port} is in use, trying ${nextPort}...`);
      startServer(nextPort, retries + 1);
      return;
    }
    throw error;
  });
}

// Start server
startServer(DEFAULT_PORT);

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  process.exit(0);
});
