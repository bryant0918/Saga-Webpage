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

There is no test suite or linter configured for this repo.

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
- `familysearch.html` + `familysearch.js` — OAuth login (PKCE flow), tree configuration, order submission
- `dashboard.html` + `dashboard.js` — Authenticated tree viewer/editor; calls backend `/people/tree/*` endpoints
- `admin.html` + `admin.js` — Admin view for managing all user trees (guarded server-side)
- `gedcom.html` + `script.js` — GEDCOM file upload flow

### Authentication

FamilySearch PKCE authorization-code flow. Access token stored in `document.cookie` as `fs_access_token`. Redirect URI depends on `FS_ENVIRONMENT`: beta uses a hardcoded URL (`bryantmcarthur.com/family-trees`), production uses `window.location.origin + "/"`.

**Security constraint:** `SecurityPolicy.md` mandates tokens should be HttpOnly/Secure cookies. Current implementation stores them client-side — this is a known compliance gap. Don't make it worse.

### Backend Communication

Frontend calls the Python backend at `TREE_BACKEND_BASE_URL` (from `window.APP_CONFIG`). Key endpoints consumed:
- `POST /people/family` — get person + immediate family from FamilySearch
- `POST /people/tree/sync` — fetch and cache a full tree
- `POST /people/tree/{husb,wife,kids,siblings,descendants,metadata}` — read cached sections
- `POST /people/tree/update` and `/people/tree/update-image` — edit cached data
- `POST /build_tree` and `/build_descendant_tree` — kick off PDF generation

### Payments

Stripe Checkout flow in `api/`. Payment status stored in Redis (Upstash) with 24h TTL. When `PAYMENT_FLOW=false`, frontend skips Stripe and submits directly to the backend. Pricing logic in `price-calculator.js` (frontend) and `api/stripe-pricing.js` (server price IDs).

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

- Admin access is allowlisted by FamilySearch Person ID in `server.js` (`ADMIN_PERSON_IDS` array)
- Theme names differ between frontend and backend: `royal-heritage`→`black`, `rustic-roots`→`rustic`, `vintage-botanical`→`green`, `ancestral-stone`→`stone` (mapped in `price-calculator.js`)
- The Python backend at `4gen_chart/` is a sibling repo — see the parent directory's `CLAUDE.md` for its architecture
