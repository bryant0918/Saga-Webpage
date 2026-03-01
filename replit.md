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

### JavaScript Modules
- `main.js` — Entry point, handles OAuth callback detection, cookie utilities, and source selection routing
- `familysearch.js` — FamilySearch OAuth 2 authentication flow (PKCE-based), API calls, cookie management for access tokens
- `script.js` — GEDCOM upload form handling, file input display, form submission with theme mapping
- `price-calculator.js` — Pricing logic and Stripe Buy Button integration

### Authentication
- **FamilySearch OAuth 2** with authorization code flow
- Access tokens stored in cookies (`fs_access_token`)
- Production environment pointing to `ident.familysearch.org` and `api.familysearch.org`
- App key: `b00KBZ8PWGLG7SJ0A3U1`
- Note: The SecurityPolicy.md mandates HttpOnly/Secure cookies, but the current client-side implementation uses `document.cookie` which cannot set HttpOnly. This is an area for improvement — moving token handling server-side would be needed for full compliance.

### Pricing & Payments
- Two tree types: **Ancestor** (base $149) and **Descendant** (base $169)
- Additional generations cost $49 extra
- **Stripe Buy Buttons** handle payment (live publishable key in `price-calculator.js`)
- 4 unique Stripe Buy Button IDs mapped to each pricing option in `STRIPE_BUY_BUTTONS` object in `price-calculator.js`:
  - `ancestor_5` — Ancestor Tree, 5 Generations ($198)
  - `ancestor_4` — Ancestor Tree, 4 Generations ($149)
  - `descendant_4` — Descendant Tree, 4 Generations ($218)
  - `descendant_3` — Descendant Tree, 3 Generations ($169)
- Buy buttons are dynamically swapped in `familysearch-config.html` based on the user's tree type and generation selection
- Note: Currently ancestor_4, descendant_4, and descendant_3 use placeholder button IDs (same as ancestor_5) — need to be replaced with real Stripe Buy Button IDs

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
