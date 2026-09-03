// Express Route: Stripe Webhook Handler
// CRITICAL: This endpoint must receive the raw body for signature verification

const express = require('express');
const router = express.Router();
const Stripe = require('stripe');
const { PRICE_MAP } = require('./stripe-pricing');
const { markOrderPaid } = require('./notify-backend');

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const PRODUCT_BY_PRICE_ID = Object.fromEntries(
  Object.entries(PRICE_MAP).map(([productKey, priceId]) => [priceId, productKey])
);

// CRITICAL: Use raw body parser for webhook signature verification
router.post('/', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];

  if (!sig) {
    console.error('No Stripe signature header found');
    return res.status(400).send('No signature');
  }

  let event;

  try {
    // CRITICAL: req.body is raw buffer when using express.raw()
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
    
    console.log('Webhook signature verified successfully');
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  try {
    switch (event.type) {
      case 'checkout.session.completed':
        {
        const session = event.data.object;
        
        console.log('Checkout session completed:', session.id);
        console.log('Metadata:', session.metadata);
        
        // Extract metadata
        const requestId = session.metadata.request_id;
        const userId = session.metadata.user_id;
        
        if (!requestId) {
          console.error('No request_id found in session metadata');
          return res.status(400).json({ error: 'Missing request_id in metadata' });
        }

        // Look up line items so we can identify the product actually purchased.
        // The backend refuses to unlock when this does not match the order, so
        // it must come from Stripe rather than from client-supplied metadata.
        const lineItems = await stripe.checkout.sessions.listLineItems(session.id, {
          limit: 1,
          expand: ['data.price'],
        });
        const firstLineItem = lineItems.data[0];
        const priceId = firstLineItem && firstLineItem.price ? firstLineItem.price.id : null;
        const productKey = priceId ? PRODUCT_BY_PRICE_ID[priceId] : null;

        const amountPaid = session.amount_total;

        console.log(`Payment confirmed for request ${requestId}`);

        // Unlock the chart on the backend. This is the only step that matters
        // to the customer: it is what releases the print file. Nothing else
        // runs before it, so nothing else can prevent it.
        const orderId = session.metadata && session.metadata.order_id;
        if (orderId) {
          const result = await markOrderPaid({
            orderId,
            stripeSessionId: session.id,
            requestId,
            amountPaidCents: amountPaid,
            // productKey comes from the Stripe line items above, so the
            // backend can confirm the customer bought the product they are
            // unlocking rather than a cheaper one.
            productKey,
          });

          if (!result.ok) {
            // Return non-2xx so Stripe retries. The payment is already banked;
            // retrying only re-attempts the unlock, which the backend treats
            // as idempotent.
            console.error(
              `Order ${orderId} paid but not unlocked (${result.error}). Asking Stripe to retry.`
            );
            return res.status(500).json({ error: 'Backend unlock failed; retry' });
          }
        } else {
          console.warn(
            `Checkout session ${session.id} had no order_id in metadata; ` +
              'nothing to unlock on the backend.'
          );
        }

        break;
        }
        
      case 'checkout.session.expired':
        {
        const expiredSession = event.data.object;
        console.log('Checkout session expired:', expiredSession.id);
        // Optionally handle expired sessions
        break;
        }
        
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }
    
    // Return a 200 response to acknowledge receipt of the event
    res.status(200).json({ received: true });
    
  } catch (error) {
    console.error('Error processing webhook:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

module.exports = router;
