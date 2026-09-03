// Stripe price IDs, per environment.
//
// Price IDs are per-mode objects: copying products into a sandbox creates NEW
// prices with NEW IDs, so the live IDs below simply do not exist in test mode
// and checkout fails with "No such price". Each one is therefore overridable by
// an env var, letting a local `.env` point at sandbox prices while production
// keeps using the live defaults.
//
// If you change a price here, change it in all four places that must agree:
// this file, price-calculator.js, api/create-payment-session.js
// (PRICE_AMOUNT_MAP), and the backend's family_trees/orders.py.

const LIVE_PRICE_IDS = {
  ancestry_4: 'price_1T1ui2Gi0ETKj4aVHXNNstni',
  ancestry_5: 'price_1T1ugdGi0ETKj4aVWa33O9pk',
  descendant_3: 'price_1T1uisGi0ETKj4aVPApeAyoz',
  descendant_4: 'price_1T1ujFGi0ETKj4aVnsW2YDY8',
};

const ENV_VAR_BY_PRODUCT = {
  ancestry_4: 'STRIPE_PRICE_ANCESTRY_4',
  ancestry_5: 'STRIPE_PRICE_ANCESTRY_5',
  descendant_3: 'STRIPE_PRICE_DESCENDANT_3',
  descendant_4: 'STRIPE_PRICE_DESCENDANT_4',
};

function buildPriceMap(env = process.env) {
  const map = {};
  Object.keys(LIVE_PRICE_IDS).forEach((productKey) => {
    const override = (env[ENV_VAR_BY_PRODUCT[productKey]] || '').trim();
    map[productKey] = override || LIVE_PRICE_IDS[productKey];
  });
  return map;
}

/**
 * Whether the configured price IDs match the mode of the secret key.
 *
 * Pointing a test key at live price IDs is the natural mistake after copying an
 * environment to a sandbox, and Stripe's own error ("No such price") does not
 * mention the mode. Returns a human-readable problem string, or null when fine.
 */
function describeModeMismatch(env = process.env) {
  const secretKey = (env.STRIPE_SECRET_KEY || '').trim();
  if (!secretKey) {
    return null;
  }

  const usingTestKey = secretKey.startsWith('sk_test_');
  const priceMap = buildPriceMap(env);
  const stillLive = Object.keys(LIVE_PRICE_IDS).filter(
    (productKey) => priceMap[productKey] === LIVE_PRICE_IDS[productKey]
  );

  if (usingTestKey && stillLive.length) {
    return (
      'STRIPE_SECRET_KEY is a test/sandbox key, but these products still use the ' +
      `live price IDs: ${stillLive.join(', ')}. Stripe will reject checkout with ` +
      '"No such price". Copying products into a sandbox creates new price IDs; set ' +
      stillLive.map((key) => ENV_VAR_BY_PRODUCT[key]).join(', ') +
      ' in your .env to the sandbox values.'
    );
  }

  return null;
}

const PRICE_MAP = buildPriceMap();

module.exports = {
  PRICE_MAP,
  LIVE_PRICE_IDS,
  ENV_VAR_BY_PRODUCT,
  buildPriceMap,
  describeModeMismatch,
};
