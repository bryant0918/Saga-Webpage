// Express Route: Payment Status Checker
// This endpoint allows the frontend to poll for payment completion status

const express = require('express');
const router = express.Router();
const Redis = require('ioredis');

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

// GET /api/payment-status?requestId=xxx
router.get('/', async (req, res) => {
  try {
    // Get requestId from query parameters
    const { requestId, request_id } = req.query;
    const id = requestId || request_id;

    if (!id) {
      return res.status(400).json({ 
        error: 'Missing requestId parameter',
        paid: false 
      });
    }

    // Query Redis for payment status
    const redisClient = getRedis();
    const key = `payment:${id}`;
    const paymentDataStr = await redisClient.get(key);

    if (!paymentDataStr) {
      // Payment not found - either not paid yet or expired
      return res.status(200).json({
        paid: false,
        message: 'Payment not found or not yet completed'
      });
    }

    // Parse payment data
    const paymentData = JSON.parse(paymentDataStr);
    const metadata = paymentData && paymentData.metadata ? paymentData.metadata : {};
    const theme =
      typeof paymentData.theme === 'string' && paymentData.theme.trim()
        ? paymentData.theme.trim()
        : (typeof metadata.theme === 'string' && metadata.theme.trim()
            ? metadata.theme.trim()
            : null);

    // Return payment status
    return res.status(200).json({
      paid: paymentData.paid,
      amount: paymentData.amount / 100, // Convert cents to dollars
      amountSubtotal: paymentData.amountSubtotal != null ? paymentData.amountSubtotal / 100 : null,
      amountDiscount: paymentData.amountDiscount != null ? paymentData.amountDiscount / 100 : null,
      amountTotal: paymentData.amountTotal != null ? paymentData.amountTotal / 100 : null,
      amountPaid: paymentData.amountPaid != null ? paymentData.amountPaid / 100 : null,
      amountDue: paymentData.amountDue != null ? paymentData.amountDue / 100 : null,
      currency: paymentData.currency,
      couponsUsed: (paymentData.couponsUsed || []).map((coupon) => ({
        ...coupon,
        amount: coupon.amount != null ? coupon.amount / 100 : null,
      })),
      timestamp: paymentData.timestamp,
      sessionId: paymentData.sessionId,
      customerEmail: paymentData.customerEmail,
      priceId: paymentData.priceId || null,
      productKey: paymentData.productKey || null,
      theme,
    });

  } catch (error) {
    console.error('Error checking payment status:', error);
    return res.status(500).json({ 
      error: 'Failed to check payment status',
      paid: false,
      message: error.message 
    });
  }
});

module.exports = router;
