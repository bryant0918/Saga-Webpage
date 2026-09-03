// The payment-to-unlock relay.
//
// This is the seam where a successful Stripe payment becomes a released print
// file. A silent failure here means a customer pays and receives nothing, so
// every failure path must be reported to the caller rather than swallowed.

const test = require('node:test');
const assert = require('node:assert/strict');

const { markOrderPaid, getBackendBaseUrl } = require('../api/notify-backend');

function withEnv(overrides, run) {
  const saved = {};
  Object.keys(overrides).forEach((key) => {
    saved[key] = process.env[key];
    if (overrides[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = overrides[key];
    }
  });
  try {
    return run();
  } finally {
    Object.keys(saved).forEach((key) => {
      if (saved[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = saved[key];
      }
    });
  }
}

/** Replace global.fetch, capturing calls, and restore afterwards. */
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

function okResponse() {
  return { ok: true, status: 200, text: async () => '' };
}

test('posts the order to the backend with the shared secret', async () => {
  await withEnv(
    { INTERNAL_API_SECRET: 's3cret', TREE_BACKEND_BASE_URL: 'https://backend.example.com' },
    async () =>
      withFetch(okResponse, async (calls) => {
        const result = await markOrderPaid({
          orderId: 'ord_1',
          stripeSessionId: 'cs_1',
          requestId: 'req_1',
          amountPaidCents: 19800,
        });

        assert.equal(result.ok, true);
        assert.equal(calls.length, 1);
        assert.equal(calls[0].url, 'https://backend.example.com/orders/mark-paid');
        assert.equal(calls[0].options.headers['X-Internal-Secret'], 's3cret');

        const body = JSON.parse(calls[0].options.body);
        assert.equal(body.order_id, 'ord_1');
        assert.equal(body.stripe_session_id, 'cs_1');
        assert.equal(body.request_id, 'req_1');
        assert.equal(body.amount_paid_cents, 19800);
      })
  );
});

test('refuses to call the backend when the secret is unset', async () => {
  await withEnv({ INTERNAL_API_SECRET: undefined }, async () =>
    withFetch(okResponse, async (calls) => {
      const result = await markOrderPaid({ orderId: 'ord_1' });
      assert.equal(result.ok, false);
      assert.match(result.error, /INTERNAL_API_SECRET/);
      assert.equal(calls.length, 0, 'must not send an unauthenticated unlock');
    })
  );
});

test('reports a missing orderId instead of posting a useless request', async () => {
  await withEnv({ INTERNAL_API_SECRET: 's3cret' }, async () =>
    withFetch(okResponse, async (calls) => {
      const result = await markOrderPaid({ orderId: undefined });
      assert.equal(result.ok, false);
      assert.equal(calls.length, 0);
    })
  );
});

test('surfaces a backend rejection so the webhook can ask Stripe to retry', async () => {
  await withEnv({ INTERNAL_API_SECRET: 's3cret' }, async () =>
    withFetch(
      async () => ({ ok: false, status: 403, text: async () => 'Invalid internal credentials.' }),
      async () => {
        const result = await markOrderPaid({ orderId: 'ord_1' });
        assert.equal(result.ok, false);
        assert.equal(result.status, 403);
        assert.match(result.error, /Invalid internal credentials/);
      }
    )
  );
});

test('surfaces a network failure rather than throwing into the webhook', async () => {
  await withEnv({ INTERNAL_API_SECRET: 's3cret' }, async () =>
    withFetch(
      async () => {
        throw new Error('ECONNREFUSED');
      },
      async () => {
        const result = await markOrderPaid({ orderId: 'ord_1' });
        assert.equal(result.ok, false);
        assert.match(result.error, /ECONNREFUSED/);
      }
    )
  );
});

test('sends nulls, not undefined, for absent optional fields', async () => {
  // JSON.stringify drops undefined keys entirely; the backend reads them
  // explicitly, so send an explicit null.
  await withEnv({ INTERNAL_API_SECRET: 's3cret' }, async () =>
    withFetch(okResponse, async (calls) => {
      await markOrderPaid({ orderId: 'ord_1' });
      const body = JSON.parse(calls[0].options.body);
      assert.ok('stripe_session_id' in body);
      assert.equal(body.stripe_session_id, null);
      assert.equal(body.amount_paid_cents, null);
    })
  );
});

test('a non-numeric amount is sent as null rather than a bad value', async () => {
  await withEnv({ INTERNAL_API_SECRET: 's3cret' }, async () =>
    withFetch(okResponse, async (calls) => {
      await markOrderPaid({ orderId: 'ord_1', amountPaidCents: 'lots' });
      const body = JSON.parse(calls[0].options.body);
      assert.equal(body.amount_paid_cents, null);
    })
  );
});

test('backend base URL strips a trailing slash', async () => {
  withEnv({ TREE_BACKEND_BASE_URL: 'https://backend.example.com/' }, () => {
    assert.equal(getBackendBaseUrl(), 'https://backend.example.com');
  });
});

test('backend base URL falls back to production', async () => {
  withEnv({ TREE_BACKEND_BASE_URL: undefined }, () => {
    assert.equal(getBackendBaseUrl(), 'https://family-trees.replit.app');
  });
});
