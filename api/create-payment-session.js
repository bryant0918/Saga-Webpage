// Express Route: Create Stripe Payment Session
// This endpoint creates a Stripe Checkout session for family tree purchases

const express = require('express');
const router = express.Router();
const Stripe = require('stripe');
const { PRICE_MAP, describeModeMismatch } = require('./stripe-pricing');
const { fetchOrderForCheckout } = require('./notify-backend');

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

// The backend stores a theme by its own name; the frontend sells slugs. The
// dashboard buys from a stored order, so it sends the backend name, and
// accepting only slugs silently collapsed every checkout to royal-heritage.
const BACKEND_THEME_TO_SLUG = {
  black: 'royal-heritage',
  rustic: 'rustic-roots',
  green: 'vintage-botanical',
  stone: 'ancestral-stone',
};

function normalizeThemeSlug(theme) {
  if (typeof theme !== 'string') {
    return 'royal-heritage';
  }

  const normalized = theme.trim().toLowerCase();
  if (ALLOWED_THEME_SLUGS.has(normalized)) {
    return normalized;
  }
  return BACKEND_THEME_TO_SLUG[normalized] || 'royal-heritage';
}

function getProductKey(treeType, generations) {
  const normalizedTreeType = treeType === 'ancestor' ? 'ancestry' : treeType;
  return `${normalizedTreeType}_${generations}`;
}

function getSafeReturnPath(returnPath) {
  // The dashboard is the only place a customer returns to now.
  const defaultPath = '/dashboard';

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
      orderId,
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

    // The order ID is what the webhook uses to unlock the chart's print file.
    // Without it a customer can pay and never receive anything, so refuse the
    // checkout rather than take money we cannot fulfil.
    if (!orderId) {
      return res.status(400).json({ error: 'orderId is required' });
    }

    if (!treeType || !generations) {
      return res.status(400).json({ error: 'Tree configuration is required' });
    }

    if (!contactEmail || !contactName) {
      return res.status(400).json({ error: 'Contact information is required' });
    }

    // Price from the stored order, NOT from the client's treeType/generations.
    // Those arrive in the request body and an attacker can set them freely, so
    // trusting them would let someone check out a $149 product and unlock a
    // $218 chart.
    const lookup = await fetchOrderForCheckout(orderId);
    if (!lookup.ok) {
      console.error(`Could not price order ${orderId}: ${lookup.error}`);
      if (lookup.status === 404) {
        return res.status(404).json({ error: 'Order not found' });
      }
      return res.status(502).json({ error: 'Could not verify this order. Please try again.' });
    }

    const order = lookup.order;

    if (order.already_unlocked) {
      return res.status(409).json({ error: 'This chart has already been purchased.' });
    }
    if (order.status !== 'ready') {
      return res.status(409).json({ error: 'This chart is not finished building yet.' });
    }

    const productKey = order.product_key;
    const priceId = PRICE_MAP[productKey];
    const priceInDollars = PRICE_AMOUNT_MAP[productKey];
    const normalizedTheme = normalizeThemeSlug(order.theme || theme);

    if (!priceId || !priceInDollars) {
      console.error(`Order ${orderId} has unsupported product key ${productKey}`);
      return res.status(400).json({
        error: `Unsupported product for this chart: ${productKey}`
      });
    }

    // Catch a test key pointed at live price IDs before Stripe does, since its
    // own error ("No such price") never mentions the mode.
    const modeMismatch = describeModeMismatch();
    if (modeMismatch) {
      console.error(modeMismatch);
      return res.status(500).json({
        error: 'Stripe is misconfigured for this environment. Check the server logs.'
      });
    }

    // The backend prices the same product independently. If the two disagree,
    // one of the four price tables has drifted and we would quote a number we
    // do not charge. Refuse rather than pick a side.
    if (typeof order.price_usd === 'number' && order.price_usd !== priceInDollars) {
      console.error(
        `Price mismatch for ${productKey}: backend says $${order.price_usd}, ` +
          `this server says $${priceInDollars}. Refusing checkout.`
      );
      return res.status(500).json({
        error: 'Pricing is misconfigured for this chart. Please contact support.'
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
      customer_email: order.contact_email || contactEmail,
      // Store all relevant data in metadata for webhook processing
      metadata: {
        request_id: requestId,
        order_id: orderId,
        user_id: userId || 'unknown',
        contact_email: contactEmail,
        contact_name: contactName,
        contact_phone: contactPhone || 'not provided',
        starting_person: startingPerson || 'not specified',
        family_name: order.title || familyName || 'Unknown',
        tree_type: order.tree_type,
        generations: String(order.max_generations),
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
// Exported for tests. These encode two things that are easy to get wrong: the
// price table (which must agree with three other files) and the open-redirect
// guard on the post-checkout return path.
module.exports.PRICE_AMOUNT_MAP = PRICE_AMOUNT_MAP;
module.exports.getProductKey = getProductKey;
module.exports.getSafeReturnPath = getSafeReturnPath;
module.exports.normalizeThemeSlug = normalizeThemeSlug;
module.exports.BACKEND_THEME_TO_SLUG = BACKEND_THEME_TO_SLUG;
