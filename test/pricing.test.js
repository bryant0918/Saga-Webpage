// Pricing consistency.
//
// The same four products are priced in four places: the client calculator, the
// server's amount map, the Stripe price-ID map, and the Python backend. Stripe
// bills from the price ID, so a mismatch quotes one number and charges another.
// These tests fail loudly when the four drift apart.

const test = require('node:test');
const assert = require('node:assert/strict');

const Pricing = require('../price-calculator');
const { PRICE_MAP } = require('../api/stripe-pricing');
const {
  PRICE_AMOUNT_MAP,
  getProductKey,
  getSafeReturnPath,
  normalizeThemeSlug,
} = require('../api/create-payment-session');

const EXPECTED = {
  ancestor_4: 149,
  ancestor_5: 198,
  descendant_3: 169,
  descendant_4: 218,
};

test('client calculator returns the published prices', () => {
  assert.equal(Pricing.calculateTreePrice('ancestor', 4), 149);
  assert.equal(Pricing.calculateTreePrice('ancestor', 5), 198);
  assert.equal(Pricing.calculateTreePrice('descendant', 3), 169);
  assert.equal(Pricing.calculateTreePrice('descendant', 4), 218);
});

test('client calculator accepts string generation values from a <select>', () => {
  assert.equal(Pricing.calculateTreePrice('ancestor', '5'), 198);
});

test('unsupported combinations return null rather than a wrong price', () => {
  assert.equal(Pricing.calculateTreePrice('ancestor', 3), null);
  assert.equal(Pricing.calculateTreePrice('descendant', 5), null);
  assert.equal(Pricing.calculateTreePrice('sideways', 4), null);
});

test('client and server price tables agree', () => {
  Object.entries(EXPECTED).forEach(([key, amount]) => {
    const [treeType, generations] = key.split('_');
    assert.equal(
      Pricing.calculateTreePrice(treeType, generations),
      amount,
      `client price for ${key}`
    );
    assert.equal(
      PRICE_AMOUNT_MAP[getProductKey(treeType, generations)],
      amount,
      `server price for ${key}`
    );
  });
});

test('every priced product has a Stripe price ID', () => {
  Object.keys(EXPECTED).forEach((key) => {
    const [treeType, generations] = key.split('_');
    const stripeKey = getProductKey(treeType, generations);
    assert.ok(PRICE_MAP[stripeKey], `missing Stripe price ID for ${stripeKey}`);
  });
});

test('server price map and Stripe price map cover the same products', () => {
  assert.deepEqual(Object.keys(PRICE_AMOUNT_MAP).sort(), Object.keys(PRICE_MAP).sort());
});

// The Python backend's PRODUCT_PRICES_USD holds the same four prices and is
// covered by its own test (family_trees/tests/test_orders.py). It lives in a
// separate repository, so it cannot be imported here; change both together.

test('stripe product keys use the ancestry prefix for ancestor charts', () => {
  // The Stripe catalogue predates the 'ancestor' wording used everywhere else.
  assert.equal(getProductKey('ancestor', 5), 'ancestry_5');
  assert.equal(Pricing.stripeProductKey('ancestor', 5), 'ancestry_5');
  assert.equal(getProductKey('descendant', 3), 'descendant_3');
  assert.equal(Pricing.stripeProductKey('descendant', 3), 'descendant_3');
});

test('theme slugs map to the backend theme names', () => {
  assert.equal(Pricing.mapThemeToBackend('royal-heritage'), 'black');
  assert.equal(Pricing.mapThemeToBackend('rustic-roots'), 'rustic');
  assert.equal(Pricing.mapThemeToBackend('vintage-botanical'), 'green');
  assert.equal(Pricing.mapThemeToBackend('ancestral-stone'), 'stone');
});

test('an unknown theme slug falls back to the default rather than breaking', () => {
  assert.equal(Pricing.mapThemeToBackend('not-a-theme'), 'black');
  assert.equal(normalizeThemeSlug('not-a-theme'), 'royal-heritage');
  assert.equal(normalizeThemeSlug(undefined), 'royal-heritage');
});

test('theme display names are defined for every sold theme', () => {
  Object.values(Pricing.THEME_SLUG_TO_BACKEND).forEach((backendTheme) => {
    assert.ok(
      Pricing.THEME_DISPLAY_NAMES[backendTheme],
      `no display name for backend theme ${backendTheme}`
    );
  });
});

test('generation options only offer combinations that have a price', () => {
  Object.entries(Pricing.GENERATION_OPTIONS).forEach(([treeType, options]) => {
    options.forEach((generations) => {
      assert.ok(
        Pricing.calculateTreePrice(treeType, generations) !== null,
        `${treeType} offers ${generations} generations with no price`
      );
    });
  });
});

test('return path guard rejects absolute and protocol-relative URLs', () => {
  // Otherwise Stripe would redirect the customer to an attacker's site after
  // a successful payment.
  assert.equal(getSafeReturnPath('https://evil.example.com/steal'), '/dashboard');
  assert.equal(getSafeReturnPath('http://evil.example.com'), '/dashboard');
  assert.equal(getSafeReturnPath('//evil.example.com'), '/dashboard');
});

test('return path guard rejects directory traversal', () => {
  assert.equal(getSafeReturnPath('/../../etc/passwd'), '/dashboard');
});

test('the default return path is a page that still exists', () => {
  // It used to default to /familysearch-config.html, which this refactor
  // deleted. A checkout falling back to it would land the customer on a 301
  // that drops the ?payment=success params, so the unlock never refreshes.
  assert.equal(getSafeReturnPath(undefined), '/dashboard');
  assert.equal(getSafeReturnPath(''), '/dashboard');
});

test('return path guard keeps a plain local path and strips its query', () => {
  assert.equal(getSafeReturnPath('/dashboard'), '/dashboard');
  assert.equal(getSafeReturnPath('dashboard'), '/dashboard');
  assert.equal(getSafeReturnPath('/dashboard?payment=success#x'), '/dashboard');
});
