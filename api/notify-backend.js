// Server-to-server relay to the Python backend's order ledger.
//
// Stripe's webhook is the only place that knows a payment succeeded, but the
// backend is the only place that decides whether a chart's clean print file may
// be released. This bridges the two using a shared secret, since the webhook has
// no user session to present.

const DEFAULT_BACKEND_URL = 'https://family-trees.replit.app';
const REQUEST_TIMEOUT_MS = 15000;

function getBackendBaseUrl() {
  return (process.env.TREE_BACKEND_BASE_URL || DEFAULT_BACKEND_URL).replace(/\/+$/, '');
}

/**
 * Tell the backend an order has been paid.
 *
 * Resolves with `{ ok: true }` on success, or `{ ok: false, error }` on
 * failure. It never throws: a webhook that returns non-200 makes Stripe retry,
 * and the caller decides whether this failure warrants that.
 *
 * @param {object} params
 * @param {string} params.orderId Backend chart order ID.
 * @param {string} [params.stripeSessionId] Checkout session ID, for reconciliation.
 * @param {string} [params.requestId] Frontend request ID, for reconciliation.
 * @param {number} [params.amountPaidCents] Amount actually captured, in cents.
 * @returns {Promise<{ok: boolean, error?: string, status?: number}>}
 */
async function markOrderPaid({ orderId, stripeSessionId, requestId, amountPaidCents }) {
  if (!orderId) {
    return { ok: false, error: 'No orderId supplied' };
  }

  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) {
    // Loud, because a missing secret silently breaks paid delivery for every
    // customer while Stripe still reports the payment as successful.
    console.error(
      'INTERNAL_API_SECRET is not set. Payment succeeded but the backend was NOT told. ' +
        `Order ${orderId} must be unlocked manually from the admin page.`
    );
    return { ok: false, error: 'INTERNAL_API_SECRET is not configured' };
  }

  const url = `${getBackendBaseUrl()}/orders/mark-paid`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Secret': secret,
      },
      body: JSON.stringify({
        order_id: orderId,
        stripe_session_id: stripeSessionId || null,
        request_id: requestId || null,
        amount_paid_cents: typeof amountPaidCents === 'number' ? amountPaidCents : null,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      console.error(`Backend mark-paid failed for ${orderId}: ${response.status} ${text}`);
      return { ok: false, error: text || `HTTP ${response.status}`, status: response.status };
    }

    console.log(`Backend acknowledged payment for order ${orderId}`);
    return { ok: true };
  } catch (error) {
    const reason = error.name === 'AbortError' ? 'timed out' : error.message;
    console.error(`Backend mark-paid request for ${orderId} ${reason}`);
    return { ok: false, error: reason };
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { markOrderPaid, getBackendBaseUrl };
