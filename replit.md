# Family Saga - Frontend (Replit)

Node/Express static site. Deployed to `family-saga.replit.app` and `family-saga.com`.

## How ordering works

**Generate first, pay second.** A signed-in customer generates a chart for free
and receives a watermarked PROOF by email. Paying unlocks the clean,
print-ready file. There is no signed-out ordering path.

1. `/login` - sign in with FamilySearch
2. `/dashboard` - the only ordering surface: a grid of chart orders, a 3-step
   new-chart wizard (FamilySearch sync **or** GEDCOM upload), and a per-chart
   people editor for photos, names and dates
3. Generate -> the Python backend builds both PDFs and emails the proof
4. Buy -> Stripe Checkout -> the webhook tells the backend to unlock the order
5. If still unpaid after 48h, a scheduled sweep sends one follow-up

## Pages and scripts

- `index.html` + `main.js` - landing page; also handles the OAuth callback
  (FamilySearch redirects to the site root)
- `login.html` + `fs-oauth.js` - sign-in kickoff
- `dashboard.html` + `dashboard.js` - charts grid, wizard, people editor
- `admin.html` + `admin.js` + `admin-orders.js` - all orders (download either
  version, comp an order) plus tree browsing and editing
- `fs-auth.js` - shared session helpers and backend API client
- `price-calculator.js` - pricing and theme-name mapping
- `tree-renderer.js`, `image-cropper.js` - shared UI pieces

**Retired** (do not reintroduce): `source-selection.html`,
`familysearch-config.html`, `familysearch.html`, `gedcom.html`, `script.js`,
`familysearch.js`, `person-id-hint.js`, `stripe-integration.js`. `server.js`
301-redirects the old paths, preserving the query string. The standalone
signed-out form is why photos and corrections used to be handled by hand over
email; one ordering path is the point of the current design.

## API routes (`api/`)

- `create-payment-session.js` - creates Stripe Checkout. Requires an `orderId`
  and prices it from the **backend's** order record via
  `/orders/checkout-info`, ignoring client-supplied tree type and generations.
- `stripe-webhook.js` - verifies the signature against the **raw** body, then
  calls the backend's `/orders/mark-paid` through `notify-backend.js`. Returns
  non-2xx on relay failure so Stripe retries. Nothing runs before the unlock:
  a Redis write once sat there and stranded every payment when Redis died.
- `notify-backend.js` - the server-to-server bridge, authenticated by
  `INTERNAL_API_SECRET`.

**Never add a global `express.json()` to `server.js`.** It would break webhook
signature verification and silently stop every payment from unlocking.
`test/webhook-raw-body.test.js` guards this.

## Pricing

Ancestor $149 (4 gen) / $198 (5 gen). Descendant $169 (3 gen) / $218 (4 gen).

The same four prices live in `price-calculator.js`,
`api/create-payment-session.js`, `api/stripe-pricing.js` (Stripe price IDs) and
the backend's `family_trees/orders.py`. Stripe bills from the price ID, so a
mismatch quotes one number and charges another. `test/pricing.test.js` enforces
the three JS copies; checkout refuses at runtime if the backend disagrees.

## Persistence

Chart orders, both PDFs, and payment state are persisted **by the backend** in
Replit object storage. This repo holds no database and no cache.

## Environment

See `.env.example`. Beyond the Stripe and FamilySearch values, the order flow
requires:
- `INTERNAL_API_SECRET` - must match the backend exactly; endpoints fail closed
  without it, so payments will not unlock
- `PUBLIC_BASE_URL` - Stripe success/cancel redirects
- `ADMIN_PERSON_IDS` - comma-separated FamilySearch IDs allowed at `/admin`

## Tests

`npm test` (Node's built-in runner, no dependencies). Covers price consistency,
the payment-to-unlock relay, the scope-slug contract shared with the backend,
the webhook raw-body invariant, and a syntax/reference sweep over every shipped
script and page. GitHub Actions runs it on push and PR.

## Known gaps

- The access token lives in a readable cookie (`SecurityPolicy.md` flags this).
- The OAuth flow is **not** PKCE, despite older docs saying so.
- `PAYMENT_FLOW` and `GETFORM_ENDPOINT` are vestigial; nothing in the ordering
  path reads either.
