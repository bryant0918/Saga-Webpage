// Checkout must be priced from the stored order.
//
// create-payment-session receives treeType and generations in the request body,
// where an attacker controls them. Pricing from those instead of from the order
// let someone check out the $149 product and unlock a $218 chart. These cover
// the lookup that replaced them.

const test = require('node:test');
const assert = require('node:assert/strict');

const { fetchOrderForCheckout } = require('../api/notify-backend');

function withEnv(overrides, run) {
  const saved = {};
  Object.keys(overrides).forEach((key) => {
    saved[key] = process.env[key];
    if (overrides[key] === undefined) delete process.env[key];
    else process.env[key] = overrides[key];
  });
  try {
    return run();
  } finally {
    Object.keys(saved).forEach((key) => {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    });
  }
}

async function withFetch(impl, run) {
  const original = global.fetch;
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    return impl(url, options);
  };
  try {
    return await run(calls);
  } finally {
    global.fetch = original;
  }
}

const ORDER = {
  order_id: 'ord_20260827120000_abcd1234',
  product_key: 'descendant_4',
  price_usd: 218,
  tree_type: 'descendant',
  max_generations: 4,
  already_unlocked: false,
  status: 'ready',
};

test('returns the order the backend reports, not what the caller claims', async () => {
  await withEnv(
    { INTERNAL_API_SECRET: 's3cret', TREE_BACKEND_BASE_URL: 'https://backend.example.com' },
    async () =>
      withFetch(
        async () => ({ ok: true, status: 200, json: async () => ORDER }),
        async (calls) => {
          const result = await fetchOrderForCheckout(ORDER.order_id);

          assert.equal(result.ok, true);
          assert.equal(result.order.product_key, 'descendant_4');
          assert.equal(result.order.price_usd, 218);
          assert.equal(calls[0].url, 'https://backend.example.com/orders/checkout-info');
          assert.equal(calls[0].options.headers['X-Internal-Secret'], 's3cret');
          assert.equal(JSON.parse(calls[0].options.body).order_id, ORDER.order_id);
        }
      )
  );
});

test('refuses to price a checkout when the secret is unset', async () => {
  // Falling back to client-supplied pricing here would reopen the bypass.
  await withEnv({ INTERNAL_API_SECRET: undefined }, async () =>
    withFetch(
      async () => ({ ok: true, status: 200, json: async () => ORDER }),
      async (calls) => {
        const result = await fetchOrderForCheckout(ORDER.order_id);
        assert.equal(result.ok, false);
        assert.equal(calls.length, 0);
      }
    )
  );
});

test('a missing orderId never reaches the backend', async () => {
  await withEnv({ INTERNAL_API_SECRET: 's3cret' }, async () =>
    withFetch(
      async () => ({ ok: true, status: 200, json: async () => ORDER }),
      async (calls) => {
        const result = await fetchOrderForCheckout('');
        assert.equal(result.ok, false);
        assert.equal(calls.length, 0);
      }
    )
  );
});

test('an unknown order surfaces its 404 so checkout can report it', async () => {
  await withEnv({ INTERNAL_API_SECRET: 's3cret' }, async () =>
    withFetch(
      async () => ({ ok: false, status: 404, text: async () => 'Order not found.' }),
      async () => {
        const result = await fetchOrderForCheckout('ord_20260827120000_ffffffff');
        assert.equal(result.ok, false);
        assert.equal(result.status, 404);
      }
    )
  );
});

test('a backend outage fails the checkout rather than guessing a price', async () => {
  await withEnv({ INTERNAL_API_SECRET: 's3cret' }, async () =>
    withFetch(
      async () => {
        throw new Error('ECONNREFUSED');
      },
      async () => {
        const result = await fetchOrderForCheckout(ORDER.order_id);
        assert.equal(result.ok, false);
        assert.match(result.error, /ECONNREFUSED/);
      }
    )
  );
});
