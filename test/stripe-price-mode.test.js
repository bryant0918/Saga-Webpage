// Stripe price IDs must match the mode of the secret key.
//
// Price IDs are per-mode objects. Copying an environment into a Stripe sandbox
// creates new prices with new IDs, so a sandbox key pointed at the live IDs
// fails with "No such price" - an error that never mentions the mode, which
// makes it a genuinely confusing half hour. These lock in the override
// mechanism and the guard that explains the mistake.

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  LIVE_PRICE_IDS,
  ENV_VAR_BY_PRODUCT,
  buildPriceMap,
  describeModeMismatch,
} = require('../api/stripe-pricing');

const SANDBOX = {
  STRIPE_PRICE_ANCESTRY_4: 'price_sandbox_a4',
  STRIPE_PRICE_ANCESTRY_5: 'price_sandbox_a5',
  STRIPE_PRICE_DESCENDANT_3: 'price_sandbox_d3',
  STRIPE_PRICE_DESCENDANT_4: 'price_sandbox_d4',
};

test('defaults to the live price IDs when nothing is overridden', () => {
  assert.deepEqual(buildPriceMap({}), LIVE_PRICE_IDS);
});

test('every product can be overridden for a sandbox', () => {
  const map = buildPriceMap(SANDBOX);
  assert.equal(map.ancestry_4, 'price_sandbox_a4');
  assert.equal(map.ancestry_5, 'price_sandbox_a5');
  assert.equal(map.descendant_3, 'price_sandbox_d3');
  assert.equal(map.descendant_4, 'price_sandbox_d4');
});

test('a blank override falls back rather than producing an empty price ID', () => {
  const map = buildPriceMap({ STRIPE_PRICE_ANCESTRY_4: '   ' });
  assert.equal(map.ancestry_4, LIVE_PRICE_IDS.ancestry_4);
});

test('one product can be overridden without disturbing the others', () => {
  const map = buildPriceMap({ STRIPE_PRICE_DESCENDANT_4: 'price_only_this' });
  assert.equal(map.descendant_4, 'price_only_this');
  assert.equal(map.ancestry_5, LIVE_PRICE_IDS.ancestry_5);
});

test('every product has an env var, and every env var a product', () => {
  assert.deepEqual(Object.keys(ENV_VAR_BY_PRODUCT).sort(), Object.keys(LIVE_PRICE_IDS).sort());
});

test('a live key with live price IDs is not flagged', () => {
  assert.equal(describeModeMismatch({ STRIPE_SECRET_KEY: 'sk_live_abc' }), null);
});

test('a test key with live price IDs is flagged, naming the fix', () => {
  const problem = describeModeMismatch({ STRIPE_SECRET_KEY: 'sk_test_abc' });
  assert.ok(problem, 'a sandbox key against live prices must be reported');
  assert.match(problem, /No such price/);
  assert.match(problem, /STRIPE_PRICE_ANCESTRY_4/);
});

test('a test key with sandbox price IDs is not flagged', () => {
  const env = Object.assign({ STRIPE_SECRET_KEY: 'sk_test_abc' }, SANDBOX);
  assert.equal(describeModeMismatch(env), null);
});

test('a partially configured sandbox names only the products still wrong', () => {
  const problem = describeModeMismatch({
    STRIPE_SECRET_KEY: 'sk_test_abc',
    STRIPE_PRICE_ANCESTRY_4: 'price_sandbox_a4',
  });
  assert.ok(problem);
  assert.equal(/ancestry_4[,\s]/.test(problem), false, 'the configured one should not be listed');
  assert.match(problem, /ancestry_5/);
});

test('no secret key at all is not treated as a mismatch', () => {
  // Nothing to compare against; the missing key is its own separate problem.
  assert.equal(describeModeMismatch({}), null);
});
