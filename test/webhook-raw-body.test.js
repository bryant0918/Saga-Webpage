// The Stripe webhook must receive the RAW request body.
//
// Signature verification hashes the exact bytes Stripe sent. If any body parser
// runs first, req.body is a parsed object, verification fails, and every
// payment silently stops unlocking its chart. This is the most-emphasised
// invariant in the project's rules, and it is exactly the kind of thing a
// well-meaning `app.use(express.json())` in server.js would break — with every
// other test still green.
//
// Rather than trust the mount order by eye, this reproduces it and asserts the
// handler sees a Buffer.

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const express = require('express');

const ROOT = path.join(__dirname, '..');

/** POST a JSON string to a running server and return the parsed response. */
function post(port, urlPath, body) {
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        port,
        path: urlPath,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      },
      (response) => {
        let data = '';
        response.on('data', (chunk) => {
          data += chunk;
        });
        response.on('end', () => resolve({ status: response.statusCode, body: data }));
      }
    );
    request.on('error', reject);
    request.write(body);
    request.end();
  });
}

test('the webhook handler receives a Buffer, not a parsed object', async () => {
  const app = express();

  // Mirror server.js's mount order: the payment-session router (which DOES use
  // express.json) is mounted before the webhook.
  const paymentRouter = express.Router();
  paymentRouter.use(express.json());
  paymentRouter.post('/', (req, res) => res.json({ parsed: typeof req.body }));
  app.use('/api/create-payment-session', paymentRouter);

  const webhookRouter = express.Router();
  webhookRouter.post('/', express.raw({ type: 'application/json' }), (req, res) => {
    res.json({ isBuffer: Buffer.isBuffer(req.body), length: req.body && req.body.length });
  });
  app.use('/api/stripe-webhook', webhookRouter);

  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();

  try {
    const payload = JSON.stringify({ id: 'evt_1' });
    const webhookResponse = await post(port, '/api/stripe-webhook', payload);
    const parsed = JSON.parse(webhookResponse.body);

    assert.equal(parsed.isBuffer, true, 'webhook body must stay a raw Buffer');
    assert.equal(parsed.length, Buffer.byteLength(payload));

    // And the sibling router still parses normally, proving the isolation is
    // what protects the webhook rather than the absence of any parser.
    const sessionResponse = await post(port, '/api/create-payment-session', payload);
    assert.equal(JSON.parse(sessionResponse.body).parsed, 'object');
  } finally {
    server.close();
  }
});

test('server.js introduces no application-level body parser', () => {
  // A router-scoped parser is fine; an app-level one is not. This catches the
  // regression textually, since the runtime check above uses a rebuilt app.
  const source = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');

  const appLevelParsers = [
    /app\.use\(\s*express\.json\s*\(/,
    /app\.use\(\s*express\.urlencoded\s*\(/,
    /app\.use\(\s*bodyParser/,
  ];

  appLevelParsers.forEach((pattern) => {
    assert.equal(
      pattern.test(source),
      false,
      `server.js must not mount a global body parser (${pattern}); it breaks ` +
        'Stripe webhook signature verification.'
    );
  });
});

test('the webhook route file parses its own raw body', () => {
  const source = fs.readFileSync(path.join(ROOT, 'api', 'stripe-webhook.js'), 'utf8');
  assert.match(
    source,
    /express\.raw\(\s*\{\s*type:\s*'application\/json'\s*\}\s*\)/,
    'the webhook must use express.raw so signature verification sees real bytes'
  );
});
