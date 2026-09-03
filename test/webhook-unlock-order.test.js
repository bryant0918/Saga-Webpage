// The unlock must not depend on Redis.
//
// The webhook once wrote payment status to Redis BEFORE telling the backend to
// unlock the chart. When Redis went down in production, that write threw, the
// handler's outer catch returned 500, and markOrderPaid was never reached - so
// every payment succeeded on Stripe while no customer ever received a chart.
//
// Redis is a 24h cache behind a polling endpoint nothing uses any more. It must
// never be able to block the durable unlock.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SOURCE = fs.readFileSync(
  path.join(__dirname, '..', 'api', 'stripe-webhook.js'),
  'utf8'
);

test('markOrderPaid is called before the Redis write', () => {
  const unlockAt = SOURCE.indexOf('markOrderPaid({');
  const cacheAt = SOURCE.indexOf('await storePaymentStatus(');

  assert.ok(unlockAt !== -1, 'the webhook must call markOrderPaid');
  assert.ok(cacheAt !== -1, 'the webhook still caches payment status');
  assert.ok(
    unlockAt < cacheAt,
    'markOrderPaid must run BEFORE storePaymentStatus, so a Redis outage ' +
      'cannot prevent a paid chart from unlocking'
  );
});

test('the Redis write is wrapped so it cannot fail the webhook', () => {
  // Find the storePaymentStatus call and confirm a try sits between it and the
  // preceding unlock block.
  const cacheAt = SOURCE.indexOf('await storePaymentStatus(');
  const preceding = SOURCE.slice(0, cacheAt);
  const lastTry = preceding.lastIndexOf('try {');
  const lastUnlock = preceding.lastIndexOf('markOrderPaid({');

  assert.ok(
    lastTry > lastUnlock,
    'storePaymentStatus must sit inside its own try block after the unlock'
  );

  const following = SOURCE.slice(cacheAt, cacheAt + 600);
  assert.match(
    following,
    /catch\s*\(\s*redisError\s*\)/,
    'the Redis failure must be caught and logged, not propagated'
  );
});

test('an unlock failure still returns non-2xx so Stripe retries', () => {
  assert.match(
    SOURCE,
    /if \(!result\.ok\)[\s\S]{0,400}res\.status\(500\)/,
    'a failed unlock must ask Stripe to retry'
  );
});

test('the order id drives the unlock, not the request id', () => {
  assert.match(
    SOURCE,
    /session\.metadata && session\.metadata\.order_id/,
    'the unlock keys off order_id from session metadata'
  );
});
