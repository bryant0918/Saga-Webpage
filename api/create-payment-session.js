// Express Route: Create Stripe Payment Session
// This endpoint creates a Stripe Checkout session for family tree purchases

const express = require('express');
const router = express.Router();
const Stripe = require('stripe');

// Initialize Stripe with secret key from environment
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// JSON body parser for this route
router.use(express.json());

// Helper function to calculate price (matching frontend price-calculator.js)
function calculateTreePrice(treeType, generations) {
  let basePrice = 0;
  let additionalCost = 0;
  
  if (treeType === 'ancestor') {
    basePrice = 149; // Base price for 4 generations
    if (generations === 5 || generations === '5') {
      additionalCost = 49; // +$49 for 5th generation
    }
  } else if (treeType === 'descendant') {
    basePrice = 169; // Base price for 3 generations
    if (generations === 4 || generations === '4') {
      additionalCost = 49; // +$49 for 4th generation
    }
  }
  
  return basePrice + additionalCost;
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
      userId
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

    // Calculate price
    const priceInDollars = calculateTreePrice(treeType, generations);
    const priceInCents = priceInDollars * 100; // Stripe uses cents

    // Get the base URL for success/cancel redirects
    // For Replit, use the environment variables if available
    const baseUrl = process.env.REPL_SLUG 
      ? `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`
      : (req.headers.origin || `https://${req.headers.host}`);

    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Family Saga - ${familyName || 'Custom'} Family Tree`,
              description: `${treeType === 'ancestor' ? 'Ancestry' : 'Descendancy'} Tree - ${generations} Generations (${theme || 'Royal Heritage'} theme)`,
              images: ['https://family-saga.vercel.app/assets/saga.png'], // Update with your actual domain
            },
            unit_amount: priceInCents,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      allow_promotion_codes: true, // ✅ Enable promo code input field
      success_url: `${baseUrl}/familysearch-config.html?payment=success&request_id=${requestId}`,
      cancel_url: `${baseUrl}/familysearch-config.html?payment=cancelled`,
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
        theme: theme || 'royal-heritage',
        submission_time: new Date().toISOString(),
      },
    });

    // Return the checkout session URL and requestId
    return res.status(200).json({
      sessionUrl: session.url,
      sessionId: session.id,
      requestId: requestId,
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
