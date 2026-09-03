# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Family Saga frontend — a Node/Express static site for luxury family tree ordering. Integrates with FamilySearch OAuth, Stripe payments, and a Python backend (`family-trees.replit.app`) that generates PDFs. Deployed to Replit at `family-saga.replit.app` / `family-saga.com`.

## Development

```bash
npm install
cp .env.example .env   # fill in Stripe keys + FS_APP_KEY at minimum
npm run dev            # starts on port 3000 (auto-tries next ports if busy)
PORT=5001 npm run dev  # explicit port
```

No build step, no bundler, no frontend framework. Plain HTML/CSS/vanilla JS served by Express.

For local dev, use `FS_ENVIRONMENT=beta` in `.env` — FamilySearch beta is more permissive with redirect URIs. The Python backend should be running at `http://localhost:5000` (set `TREE_BACKEND_BASE_URL` in `.env`).

Tests: `npm test` (Node's built-in runner over `test/*.test.js`). Covers pricing consistency, the payment→unlock relay, and a syntax/reference check across every shipped script and HTML page. No linter is configured.

## Architecture

### Server (`server.js`)

Express app that:
1. Loads `.env` with a custom parser (no dotenv dependency)
2. Serves `GET /api/public-config.js` — bridges env vars to frontend via `window.APP_CONFIG`
3. Serves `GET /api/config` — returns `{ paymentFlow: true|false }` from `PAYMENT_FLOW` env var
4. Mounts Stripe routes from `api/` (payment session, webhook, status)
5. Guards `/admin` behind FamilySearch identity verification (allowlisted person IDs)
6. Serves all other files statically with `.html` extension fallback

**Critical:** The Stripe webhook route (`api/stripe-webhook.js`) needs the raw request body for signature verification. It handles its own body parsing — never add a global `express.json()` middleware before it.

### Frontend Pages

All pages read config from `window.APP_CONFIG` (set by `/api/public-config.js` script tag).

- `index.html` + `main.js` — Landing page and OAuth callback handler
- `login.html` + `fs-oauth.js` — Sign in with FamilySearch (PKCE flow)
- `dashboard.html` + `dashboard.js` — **The only ordering path.** Charts-first: a grid of chart orders, a 3-step new-chart wizard (FamilySearch or GEDCOM), and a per-chart people editor
- `admin.html` + `admin.js` + `admin-orders.js` — Admin view: all orders (download, comp) plus tree browsing/editing (guarded server-side)
- `fs-auth.js` — Shared session helpers and backend API client used by dashboard and admin

**Retired:** `source-selection.html`, `familysearch-config.html`, `familysearch.html`, `gedcom.html`, `script.js`, `familysearch.js`, `stripe-integration.js`. The standalone signed-out order form is gone; `server.js` 301-redirects those paths into the dashboard. Do not reintroduce a second ordering path.

### Authentication

FamilySearch PKCE authorization-code flow. Access token stored in `document.cookie` as `fs_access_token`. Redirect URI depends on `FS_ENVIRONMENT`: beta uses a hardcoded URL (`bryantmcarthur.com/family-trees`), production uses `window.location.origin + "/"`.

**Security constraint:** `SecurityPolicy.md` mandates tokens should be HttpOnly/Secure cookies. Current implementation stores them client-side — this is a known compliance gap. Don't make it worse.

### Backend Communication

Frontend calls the Python backend at `TREE_BACKEND_BASE_URL` (from `window.APP_CONFIG`). Key endpoints consumed:
- `POST /people/family` — get person + immediate family from FamilySearch
- `POST /people/tree/sync` — fetch and cache a full tree
- `POST /people/tree/{husb,wife,kids,siblings,descendants,metadata}` — read cached sections
- `POST /people/tree/update` and `/people/tree/update-image` — edit cached data
- `POST /build_chart` — generate a chart from cached data; creates an order and returns it
- `POST /orders/{list,get,download,comp}` — chart orders and entitlement-gated PDF download
- `POST /people/tree/import-gedcom` — import a GEDCOM upload into the user's cache
- `POST /build_tree` and `/build_descendant_tree` — legacy direct generation (no order record)

### Payments

**Generate first, pay second.** A customer generates a chart for free and gets a watermarked proof; paying unlocks the clean print file. Stripe Checkout lives in `api/`.

The webhook does two things on `checkout.session.completed`: writes payment status to Redis (24h TTL, for the polling UI) and calls the backend's `/orders/mark-paid` via `api/notify-backend.js` using `INTERNAL_API_SECRET`. **The backend order record is the durable one that gates the download**; Redis is only a cache. If the backend call fails the webhook returns non-2xx so Stripe retries — the backend's mark-paid is idempotent.

`create-payment-session` requires an `orderId` and puts it in session metadata. Without it the webhook cannot unlock anything, so the route refuses rather than taking money it cannot fulfil.

Prices live in **four** places that must agree: `price-calculator.js`, `api/create-payment-session.js` (`PRICE_AMOUNT_MAP`), `api/stripe-pricing.js` (Stripe price IDs), and the backend's `family_trees/orders.py`. `test/pricing.test.js` enforces the first three.

### Styling

Bootstrap 5.3 dark theme, Font Awesome 6.4, Google Fonts (Inter + Playfair Display). Black-and-gold luxury aesthetic. CSS variables in `custom.css` / `styles.css`.

## Environment Variables

See `.env.example` for full list. Key ones:
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` — Stripe integration
- `REDIS_URL` — Upstash Redis for payment status
- `FS_APP_KEY`, `FS_ENVIRONMENT`, `FS_BASE_URL`, `FS_TOKEN_URL`, `FS_API_BASE_URL` — FamilySearch OAuth
- `TREE_BACKEND_BASE_URL` — Python backend URL (defaults: `localhost:5000` for dev, `family-trees.replit.app` for prod)
- `PAYMENT_FLOW` — `true`/`false` to enable/disable Stripe gate
- `GETFORM_ENDPOINT` — form submission webhook

## Key Constraints

- Admin access is allowlisted by FamilySearch Person ID via the `ADMIN_PERSON_IDS` env var (comma-separated), read by both `server.js` and the Python backend. It falls back to built-in defaults when unset.
- Theme names differ between frontend and backend: `royal-heritage`→`black`, `rustic-roots`→`rustic`, `vintage-botanical`→`green`, `ancestral-stone`→`stone` (mapped in `price-calculator.js`)
- **One ordering path only.** Everything goes through the signed-in dashboard. Don't add a signed-out order form — the old one is why photos and corrections had to be handled by hand over email.
- `makePersonSlug` in `fs-auth.js` must stay byte-identical in behaviour to `make_user_scope_id` in the backend's `family_trees/web/auth.py`. If they diverge, a user's charts and their tree cache land in different storage folders and the dashboard silently shows nothing.
- The Python backend at `4gen_chart/` is a sibling repo — see the parent directory's `CLAUDE.md` for its architecture
