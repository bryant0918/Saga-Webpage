// Express Route: Stripe Webhook Handler
// CRITICAL: This endpoint must receive the raw body for signature verification

const express = require('express');
const router = express.Router();
const Stripe = require('stripe');
const Redis = require('ioredis');

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Initialize Redis connection
let redis;
function getRedis() {
  if (!redis) {
    redis = new Redis(process.env.REDIS_URL, {
      tls: {
        rejectUnauthorized: false
      },
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      connectTimeout: 10000,
    });
  }
  return redis;
}

// Helper function to store payment in Redis
async function storePaymentStatus(requestId, paymentData) {
  const redisClient = getRedis();
  const key = `payment:${requestId}`;
  const value = JSON.stringify(paymentData);
  
  // Store with 24 hour expiry (86400 seconds)
  await redisClient.set(key, value, 'EX', 86400);
  
  console.log(`Stored payment status for request ${requestId}`);
}

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
        
        // Prepare payment data to store
        const paymentData = {
          paid: true,
          sessionId: session.id,
          amount: session.amount_total,
          currency: session.currency,
          customerEmail: session.customer_email || session.metadata.contact_email,
          paymentStatus: session.payment_status,
          timestamp: Date.now(),
          metadata: session.metadata,
        };
        
        // Store payment status in Redis
        await storePaymentStatus(requestId, paymentData);
        
        console.log(`Payment confirmed for request ${requestId}`);
        break;
        
      case 'checkout.session.expired':
        const expiredSession = event.data.object;
        console.log('Checkout session expired:', expiredSession.id);
        // Optionally handle expired sessions
        break;
        
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
