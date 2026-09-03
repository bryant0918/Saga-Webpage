// Nothing may stand between a completed payment and the unlock.
//
// The webhook used to write payment status to Redis BEFORE telling the backend
// to unlock the chart. Redis went down in production, that write threw, the
// handler's outer catch returned 500, and markOrderPaid was never reached - so
// every payment succeeded on Stripe while no customer received a chart.
//
// Redis was a 24h cache behind /api/payment-status, an endpoint whose only
// caller (familysearch.js) was deleted in the dashboard refactor. It is gone
// now. These tests keep it gone, and keep the unlock unencumbered.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const WEBHOOK = fs.readFileSync(path.join(ROOT, 'api', 'stripe-webhook.js'), 'utf8');
const SERVER = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const PACKAGE = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

test('the webhook has no Redis dependency at all', () => {
  assert.equal(/ioredis/.test(WEBHOOK), false, 'ioredis must not be required');
  assert.equal(/storePaymentStatus/.test(WEBHOOK), false, 'the cache writer must be gone');
  assert.equal(/REDIS_URL/.test(WEBHOOK), false, 'no Redis configuration');
});

test('ioredis is not a dependency', () => {
  const deps = Object.keys(PACKAGE.dependencies || {});
  assert.equal(
    deps.includes('ioredis'),
    false,
    'ioredis is unused; keeping it invites the payment path to depend on it again'
  );
});

test('the unreachable payment-status route is gone', () => {
  assert.equal(
    fs.existsSync(path.join(ROOT, 'api', 'payment-status.js')),
    false,
    'payment-status.js had no callers after the dashboard refactor'
  );
  assert.equal(
    /payment-status/.test(SERVER),
    false,
    'server.js must not mount a route whose handler no longer exists'
  );
});

test('nothing runs between the completed payment and the unlock', () => {
  // Anything awaited before markOrderPaid can throw and strand a paid order.
  const handlerStart = WEBHOOK.indexOf("case 'checkout.session.completed':");
  const unlockAt = WEBHOOK.indexOf('markOrderPaid({');
  assert.ok(handlerStart !== -1 && unlockAt > handlerStart, 'the unlock is in the handler');

  const before = WEBHOOK.slice(handlerStart, unlockAt);
  const awaited = before.match(/await\s+([A-Za-z_$][\w$.]*)/g) || [];

  // Only the Stripe line-item lookup is allowed: the backend refuses to unlock
  // without the real purchased product, so it has to happen first.
  const allowed = new Set(['await stripe.checkout.sessions.listLineItems']);
  const unexpected = awaited.filter((call) => !allowed.has(call));

  assert.deepEqual(
    unexpected,
    [],
    'these awaits precede the unlock and could strand a paid order: ' + unexpected.join(', ')
  );
});

test('an unlock failure still returns non-2xx so Stripe retries', () => {
  assert.match(
    WEBHOOK,
    /if \(!result\.ok\)[\s\S]{0,400}res\.status\(500\)/,
    'a failed unlock must ask Stripe to retry'
  );
});

test('the unlock keys off order_id from Stripe metadata', () => {
  assert.match(WEBHOOK, /session\.metadata && session\.metadata\.order_id/);
});

test('the purchased product comes from Stripe, not client metadata', () => {
  // Pricing from client input let someone buy the cheap product and unlock the
  // expensive chart; the backend cross-checks this value.
  const unlockCall = WEBHOOK.slice(
    WEBHOOK.indexOf('markOrderPaid({'),
    WEBHOOK.indexOf('markOrderPaid({') + 500
  );
  assert.match(unlockCall, /productKey/, 'the unlock forwards the verified product key');
  assert.match(WEBHOOK, /PRODUCT_BY_PRICE_ID\[priceId\]/, 'derived from the Stripe line item');
});
