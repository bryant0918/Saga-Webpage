// Express server for Family Saga - Replit Deployment
// Serves static files and handles Stripe payment API endpoints

const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes - Mount before static files to ensure they're handled first
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

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Family Saga server running on port ${PORT}`);
  console.log(`📍 Local: http://localhost:${PORT}`);
  console.log(`🌐 Replit: https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`);
  console.log(`\n📡 API Endpoints:`);
  console.log(`   POST /api/create-payment-session`);
  console.log(`   POST /api/stripe-webhook`);
  console.log(`   GET  /api/payment-status`);
  console.log(`\n✅ Ready to accept requests!`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  process.exit(0);
});
