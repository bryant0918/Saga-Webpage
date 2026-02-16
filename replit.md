# Family Saga - Replit Agent Guide

## Overview

Family Saga is a static frontend web application that generates custom family tree charts. Users can either connect their FamilySearch account via OAuth 2 or upload a GEDCOM file to create beautifully designed, printable family tree charts. The application features a luxury black-and-gold Scandinavian design aesthetic and offers multiple tree themes, types (ancestor/descendant), and generation depths. The product is a paid service with pricing based on tree type and number of generations.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend-Only Static Site
- **Problem:** Need a client-facing genealogy chart application that integrates with FamilySearch.
- **Solution:** Pure static HTML/CSS/JavaScript site with no backend framework. Pages are individual HTML files (`index.html`, `familysearch.html`, `familysearch-config.html`, `gedcom.html`, `source-selection.html`).
- **Pros:** Simple deployment, no server infrastructure needed for the frontend, fast loading.
- **Cons:** Limited server-side processing; any backend work (like GEDCOM processing or PDF generation) would need to be added separately.

### Page Structure
- `index.html` — Landing page / homepage with hero section and navigation
- `source-selection.html` — Choose between FamilySearch login or GEDCOM upload
- `familysearch.html` — FamilySearch OAuth login page
- `familysearch-config.html` — Configure tree options after FamilySearch authentication
- `gedcom.html` — GEDCOM file upload form with tree configuration options

### JavaScript Modules
- `main.js` — Navigation logic, cookie utilities, OAuth callback handling, source selection routing
- `familysearch.js` — FamilySearch OAuth 2 authentication (PKCE flow implied), API communication, token management via cookies
- `script.js` — GEDCOM upload form handling, file input UX, form submission with tree configuration
- `price-calculator.js` — Pricing logic based on tree type and generation count

### FamilySearch OAuth 2 Integration
- **Problem:** Users need to authenticate with FamilySearch to access their family tree data.
- **Solution:** Client-side OAuth 2 authorization code flow using FamilySearch's identity service. The app has a registered App Key (`b00KBZ8PWGLG7SJ0A3U1`) and redirects users through FamilySearch's auth endpoints.
- **Environment:** Currently configured for **production** (with beta endpoints commented out).
- **Token storage:** Access tokens stored in cookies (`fs_access_token`). The Security Policy mandates `Secure`, `HttpOnly`, and `SameSite` flags — note that the current client-side implementation uses `document.cookie` which cannot set `HttpOnly`, so a server-side component would be needed to fully comply with the security policy.

### Styling & Design System
- **Problem:** Need a premium, luxury feel for the product.
- **Solution:** Dark theme with black-and-gold color palette. Uses Bootstrap 5.3 (dark mode via `data-bs-theme="dark"`), Font Awesome 6.4 for icons, Google Fonts (Inter for body, Playfair Display for headings).
- `custom.css` — Primary design system with CSS variables for the black/gold theme, used by all Bootstrap-themed pages.
- `styles.css` — Alternate styling for `source-selection.html` with a different gradient-based design (appears to be legacy or alternate design).

### Pricing Model
- Ancestor trees: $149 base (4 generations), +$49 for 5th generation
- Descendant trees: $169 base (3 generations), +$49 for 4th generation

### Theme System
Tree chart themes are mapped from frontend names to backend values:
- `royal-heritage` → `black`
- `rustic-roots` → `rustic`
- `vintage-botanical` → `green`
- `ancestral-stone` → `stone`

### Backend Requirements (Not Yet Implemented)
The form in `script.js` submits data (contact info, GEDCOM file, tree configuration) that implies a backend API endpoint is needed for:
- GEDCOM file processing and parsing
- Family tree chart/PDF generation
- Possibly payment processing
- Secure token handling for FamilySearch (to comply with HttpOnly cookie requirement)

## External Dependencies

### Third-Party Services
- **FamilySearch API** — Production endpoints at `api.familysearch.org` and `ident.familysearch.org` for OAuth and tree data. App Key: `b00KBZ8PWGLG7SJ0A3U1`.

### CDN Libraries
- **Bootstrap 5.3.0** — UI framework (`cdn.jsdelivr.net`)
- **Font Awesome 6.4.0** — Icon library (`cdnjs.cloudflare.com`)
- **Google Fonts** — Inter (sans-serif) and Playfair Display (serif)

### No Database
There is currently no database. If one is added, it would likely store user sessions, order information, and generated chart metadata. No Drizzle or ORM configuration exists yet.

### No Backend Framework
No server-side code exists. When a backend is needed, it should handle: GEDCOM processing, PDF generation, secure cookie management for OAuth tokens, and potentially payment integration.