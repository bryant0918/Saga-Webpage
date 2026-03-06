# Family Saga - Custom Family Tree Charts

## Overview

Family Saga is a frontend web application that generates custom family tree charts. Users can either connect their FamilySearch account via OAuth 2 or upload a GEDCOM file to create beautifully designed family tree PDFs. The app features a luxury black-and-gold Scandinavian design aesthetic and monetizes through Stripe payment integration.

The application is primarily a static site served by a simple server, with client-side JavaScript handling FamilySearch OAuth authentication, tree data fetching, and GEDCOM file processing.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture
### Frontend (Static HTML/CSS/JS)
- **No frontend framework** — the app is built with plain HTML, CSS, and vanilla JavaScript
- **Bootstrap 5.3** is used for layout, components, and responsive design (dark theme via `data-bs-theme="dark"`)
- **Font Awesome 6.4** for icons
- **Google Fonts** — Inter (body text) and Playfair Display (headings) for a Scandinavian luxury feel
- **Custom CSS** (`custom.css` and `styles.css`) defines the black-and-gold color scheme with CSS custom properties

### Page Structure
- `index.html` — Landing page / home with hero section and OAuth callback handling
- `source-selection.html` — Choose between FamilySearch login or GEDCOM upload
- `familysearch.html` — FamilySearch OAuth login page
- `familysearch-config.html` — Configure tree settings after FamilySearch authentication. Starting Person ID uses a dropdown populated from `/people/family` endpoint on `family-trees.replit.app` (returns self, parents, kids, siblings, grandparents). Includes "Other" option for manual ID entry. Display format: `<id> (<name>)` with name shown in lighter gray below the dropdown.
- `gedcom.html` — GEDCOM file upload form
- `login.html` — Login page for authenticated user flow (accessed via `/login`). Redirects to FamilySearch OAuth with `login_origin` flag so the callback redirects to `/dashboard` instead of the normal config page. Not linked from index.html (manual URL access only for testing).
- `dashboard.html` — Authenticated user dashboard (accessed via `/dashboard`). Two tabs: "View Data" (fetch/display stored tree data) and "New Request" (reusable form from familysearch-config). Requires `fs_access_token` cookie; redirects to `/login` if missing.

### JavaScript Modules
- `main.js` — Entry point, handles OAuth callback detection, cookie utilities, and source selection routing. Also checks `login_origin` sessionStorage flag to redirect to `/dashboard` after OAuth.
- `familysearch.js` — FamilySearch OAuth 2 authentication flow (PKCE-based), API calls, cookie management for access tokens
- `dashboard.js` — Dashboard-specific logic: fetches user profile from FamilySearch API, loads tree data from `family-trees.replit.app` endpoints (`/people/tree/kids`, `/people/tree/husb`, `/people/tree/wife`), renders expandable person list sorted by children → husband's ancestors → wife's ancestors.
- `script.js` — GEDCOM upload form handling, file input display, form submission with theme mapping
- `price-calculator.js` — Pricing logic and Stripe Buy Button integration

### Authentication
- **FamilySearch OAuth 2** with authorization code flow
- Access tokens stored in cookies (`fs_access_token`)
- Production environment pointing to `ident.familysearch.org` and `api.familysearch.org`
- App key: `b00KBZ8PWGLG7SJ0A3U1`
- Note: The SecurityPolicy.md mandates HttpOnly/Secure cookies, but the current client-side implementation uses `document.cookie` which cannot set HttpOnly. This is an area for improvement — moving token handling server-side would be needed for full compliance.

### Pricing & Payments
- **Payment flow is toggled via `PAYMENT_FLOW` environment variable** (set to `"true"` or `"false"`)
- When `PAYMENT_FLOW=false`: payment UI (price display, Stripe buttons, payment polling) is hidden; forms submit directly to the backend; pricing fields are omitted from form data and order details
- When `PAYMENT_FLOW=true` (default): full Stripe payment flow is active — users must complete payment before submission
- The toggle is served via `GET /api/config` endpoint (returns `{ paymentFlow: true/false }`) and consumed by frontend scripts at page load
- All payment code is preserved in place (not deleted) — `stripe-integration.js`, `price-calculator.js`, and payment HTML sections remain in the codebase
- Two tree types: **Ancestor** (base $149) and **Descendant** (base $169)
- Additional generations cost $49 extra
- **Stripe Checkout** handles payment via `create-payment-session` API endpoint
- Pricing logic in `price-calculator.js`, payment session creation in `api/create-payment-session.js`

### Tree Themes
Four visual themes mapped to backend values:
- `royal-heritage` → `black`
- `rustic-roots` → `rustic`
- `vintage-botanical` → `green`
- `ancestral-stone` → `stone`

## External Dependencies

### Third-Party Services
- **FamilySearch API** (production: `api.familysearch.org`) — OAuth 2 authentication and family tree data retrieval
- **Stripe** — Payment processing via Stripe Buy Buttons (live key: `pk_live_51SZ0q2...`)

### CDN Resources
- Bootstrap 5.3 (CSS from jsdelivr)
- Font Awesome 6.4 (CSS from cdnjs)
- Google Fonts (Inter, Playfair Display)
- Stripe Buy Button JS (`js.stripe.com`)

### No Database
- The application currently has no database. If one is needed in the future, consider the data that would need persisting: user sessions, order history, generated PDFs, etc.
