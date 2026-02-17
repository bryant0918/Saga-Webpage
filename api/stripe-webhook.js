// Express Route: Stripe Webhook Handler
// CRITICAL: This endpoint must receive the raw body for signature verification

const express = require('express');
const router = express.Router();
const Stripe = require('stripe');
const Redis = require('ioredis');
const { PRICE_MAP } = require('./stripe-pricing');

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const PRODUCT_BY_PRICE_ID = Object.fromEntries(
  Object.entries(PRICE_MAP).map(([productKey, priceId]) => [priceId, productKey])
);

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

        // Re-fetch session with expanded discount breakdown so we can show coupon details.
        const expandedSession = await stripe.checkout.sessions.retrieve(session.id, {
          expand: [
            // Stripe max expansion depth is 4; expanding coupon/promotion_code here exceeds that.
            'total_details.breakdown.discounts.discount',
          ],
        });

        // Look up line items from Stripe so we can reliably identify the purchased price.
        const lineItems = await stripe.checkout.sessions.listLineItems(session.id, {
          limit: 1,
          expand: ['data.price'],
        });
        const firstLineItem = lineItems.data[0];
        const priceId = firstLineItem && firstLineItem.price ? firstLineItem.price.id : null;
        const productKey = priceId ? PRODUCT_BY_PRICE_ID[priceId] : null;

        const amountSubtotal = expandedSession.amount_subtotal != null
          ? expandedSession.amount_subtotal
          : session.amount_subtotal;
        const amountDiscount = expandedSession.total_details &&
          expandedSession.total_details.amount_discount != null
          ? expandedSession.total_details.amount_discount
          : (session.total_details && session.total_details.amount_discount) || 0;
        const amountTotal = expandedSession.amount_total != null
          ? expandedSession.amount_total
          : session.amount_total;
        const amountPaid = session.amount_total != null ? session.amount_total : amountTotal;
        const amountDue = session.payment_status === 'paid' ? 0 : Math.max((amountTotal || 0) - (amountPaid || 0), 0);

        const discounts = (expandedSession.total_details &&
          expandedSession.total_details.breakdown &&
          expandedSession.total_details.breakdown.discounts) || [];
        const couponsUsedRaw = discounts.map((entry) => {
          const discountObj = entry.discount || {};
          const coupon = discountObj.coupon && typeof discountObj.coupon === 'object'
            ? discountObj.coupon
            : null;
          const couponId = coupon
            ? coupon.id
            : (typeof discountObj.coupon === 'string' ? discountObj.coupon : null);
          const promotionCodeObj = discountObj.promotion_code && typeof discountObj.promotion_code === 'object'
            ? discountObj.promotion_code
            : null;
          const promotionCodeValue = promotionCodeObj
            ? (promotionCodeObj.code || promotionCodeObj.id || null)
            : (typeof discountObj.promotion_code === 'string' ? discountObj.promotion_code : null);

          return {
            amount: entry.amount || 0,
            couponId: couponId,
            couponName: coupon ? (coupon.name || null) : null,
            promotionCode: promotionCodeValue,
          };
        }).filter((item) => item.couponId || item.promotionCode || item.amount > 0);

        // Enrich IDs into user-friendly labels where Stripe only returns object IDs.
        const couponsUsed = await Promise.all(couponsUsedRaw.map(async (item) => {
          let couponName = item.couponName;
          let promotionCode = item.promotionCode;

          if (!couponName && item.couponId && typeof item.couponId === 'string') {
            try {
              const coupon = await stripe.coupons.retrieve(item.couponId);
              if (coupon && coupon.name) {
                couponName = coupon.name;
              }
            } catch (error) {
              console.warn(`Unable to enrich coupon ${item.couponId}:`, error.message);
            }
          }

          if (
            promotionCode &&
            typeof promotionCode === 'string' &&
            promotionCode.startsWith('promo_')
          ) {
            try {
              const promo = await stripe.promotionCodes.retrieve(promotionCode);
              if (promo && promo.code) {
                promotionCode = promo.code;
              }
            } catch (error) {
              console.warn(`Unable to enrich promotion code ${promotionCode}:`, error.message);
            }
          }

          return {
            ...item,
            couponName,
            promotionCode,
          };
        }));
        
        // Prepare payment data to store
        const paymentData = {
          paid: true,
          sessionId: session.id,
          amount: amountTotal,
          amountSubtotal: amountSubtotal,
          amountDiscount: amountDiscount,
          amountTotal: amountTotal,
          amountPaid: amountPaid,
          amountDue: amountDue,
          currency: session.currency,
          couponsUsed: couponsUsed,
          customerEmail: session.customer_email || session.metadata.contact_email,
          paymentStatus: session.payment_status,
          priceId: priceId,
          productKey: productKey || session.metadata.product_key || null,
          timestamp: Date.now(),
          metadata: session.metadata,
        };
        
        // Store payment status in Redis
        await storePaymentStatus(requestId, paymentData);
        
        console.log(`Payment confirmed for request ${requestId}`);
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
