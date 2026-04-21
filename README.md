# Family Saga Webpage

Family Saga web app for FamilySearch and GEDCOM-based family tree requests, with Stripe payment flow and a small Express server for API routes/config.

## Requirements

- Node.js `18+`
- npm

## Run Locally

1. Install dependencies:

```bash
npm install
```

2. Create your local env file from the example:

```bash
cp .env.example .env
```

3. Update `.env` values you need (at minimum Stripe keys and `FS_APP_KEY`).

4. Start the app:

```bash
npm run dev
```

5. Open:

- `http://localhost:3000`

If `3000` is already in use, the server now auto-tries the next port(s), or you can set one explicitly:

```bash
PORT=5001 npm run dev
```

## FamilySearch Environment Notes

- Redirect URI behavior is environment-based:
- `FS_ENVIRONMENT=beta` uses `https://bryantmcarthur.com/family-trees` as the redirect URI.
- `FS_ENVIRONMENT=production` uses `window.location.origin + "/"` (for example `http://localhost:3000/` in local dev).
- FamilySearch **beta** credentials/endpoints are typically what you want for localhost development.
- FamilySearch **production** only works when the redirect URI matches a production domain registered in your FamilySearch app settings.

### Localhost (recommended for dev)

Use beta values in `.env`:

- `FS_ENVIRONMENT=beta`
- `FS_BASE_URL=https://identbeta.familysearch.org`
- `FS_TOKEN_URL=https://identbeta.familysearch.org/cis-web/oauth2/v3/token`
- `FS_API_BASE_URL=https://apibeta.familysearch.org`

### Production deployment

Set production values in `.env`:

- `FS_ENVIRONMENT=production`
- `FS_BASE_URL=https://ident.familysearch.org`
- `FS_TOKEN_URL=https://ident.familysearch.org/cis-web/oauth2/v3/token`
- `FS_API_BASE_URL=https://api.familysearch.org`

Also ensure your FamilySearch app registration includes your production redirect URI (for example `https://your-domain.com/`).

## Public Config

The server exposes selected env vars to frontend scripts through:

- `/api/public-config.js`

Only non-secret values should be placed in the `FS_*`, `GETFORM_ENDPOINT`, and `TREE_BACKEND_BASE_URL` public config variables.
