// Express Route: Create Stripe Payment Session
// This endpoint creates a Stripe Checkout session for family tree purchases

const express = require('express');
const router = express.Router();
const Stripe = require('stripe');
const { PRICE_MAP } = require('./stripe-pricing');

// Initialize Stripe with secret key from environment
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// JSON body parser for this route
router.use(express.json());

const PRICE_AMOUNT_MAP = {
  ancestry_4: 149,
  ancestry_5: 198,
  descendant_3: 169,
  descendant_4: 218,
};
const ALLOWED_THEME_SLUGS = new Set([
  'royal-heritage',
  'rustic-roots',
  'vintage-botanical',
  'ancestral-stone',
]);

function normalizeThemeSlug(theme) {
  if (typeof theme !== 'string') {
    return 'royal-heritage';
  }

  const normalized = theme.trim().toLowerCase();
  return ALLOWED_THEME_SLUGS.has(normalized) ? normalized : 'royal-heritage';
}

function getProductKey(treeType, generations) {
  const normalizedTreeType = treeType === 'ancestor' ? 'ancestry' : treeType;
  return `${normalizedTreeType}_${generations}`;
}

function getSafeReturnPath(returnPath) {
  const defaultPath = '/familysearch-config.html';

  if (typeof returnPath !== 'string') {
    return defaultPath;
  }

  const trimmed = returnPath.trim();
  if (!trimmed) {
    return defaultPath;
  }

  // Only allow local paths.
  if (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('//')
  ) {
    return defaultPath;
  }

  const normalizedPath = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  const pathWithoutQuery = normalizedPath.split('?')[0].split('#')[0];

  if (pathWithoutQuery.includes('..')) {
    return defaultPath;
  }

  return pathWithoutQuery || defaultPath;
}

// POST /api/create-payment-session
router.post('/', async (req, res) => {
  try {
    // Parse request body
    const {
      requestId,
      treeType,
      generations,
      familyName,
      contactEmail,
      contactName,
      contactPhone,
      startingPerson,
      theme,
      userId,
      returnPath,
    } = req.body;

    // Validate required fields
    if (!requestId) {
      return res.status(400).json({ error: 'requestId is required' });
    }

    if (!treeType || !generations) {
      return res.status(400).json({ error: 'Tree configuration is required' });
    }

    if (!contactEmail || !contactName) {
      return res.status(400).json({ error: 'Contact information is required' });
    }

    const productKey = getProductKey(treeType, generations);
    const priceId = PRICE_MAP[productKey];
    const priceInDollars = PRICE_AMOUNT_MAP[productKey];
    const normalizedTheme = normalizeThemeSlug(theme);

    if (!priceId || !priceInDollars) {
      return res.status(400).json({
        error: `Unsupported product selection: treeType=${treeType}, generations=${generations}`
      });
    }

    // Get the base URL for success/cancel redirects.
    // Priority:
    // 1) Explicit app URL env var (recommended for production)
    // 2) Incoming request origin
    // 3) Host header fallback
    const configuredBaseUrl =
      process.env.PUBLIC_BASE_URL || process.env.APP_URL || process.env.BASE_URL;
    const baseUrl = configuredBaseUrl || req.headers.origin || `https://${req.headers.host}`;
    const safeReturnPath = getSafeReturnPath(returnPath);

    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'payment',
      allow_promotion_codes: true, // ✅ Enable promo code input field
      success_url: `${baseUrl}${safeReturnPath}?payment=success&request_id=${requestId}`,
      cancel_url: `${baseUrl}${safeReturnPath}?payment=cancelled`,
      customer_email: contactEmail,
      // Store all relevant data in metadata for webhook processing
      metadata: {
        request_id: requestId,
        user_id: userId || 'unknown',
        contact_email: contactEmail,
        contact_name: contactName,
        contact_phone: contactPhone || 'not provided',
        starting_person: startingPerson || 'not specified',
        family_name: familyName || 'Unknown',
        tree_type: treeType,
        generations: generations.toString(),
        product_key: productKey,
        price_id: priceId,
        return_path: safeReturnPath,
        theme: normalizedTheme,
        submission_time: new Date().toISOString(),
      },
    });

    // Return the checkout session URL and requestId
    return res.status(200).json({
      sessionUrl: session.url,
      sessionId: session.id,
      requestId: requestId,
      priceId: priceId,
      amount: priceInDollars,
    });

  } catch (error) {
    console.error('Error creating payment session:', error);
    return res.status(500).json({ 
      error: 'Failed to create payment session',
      message: error.message 
    });
  }
});

module.exports = router;
