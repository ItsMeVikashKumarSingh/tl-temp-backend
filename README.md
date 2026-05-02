# Transfer Legacy Temporary Backend

Temporary API for waitlist, ops admin panel, app config, and CMS pages while the final backend is still in progress.

## Runtime

This project targets Cloudflare Workers directly. It exposes:

- `POST /api/waitlist`
- `POST /v1/api/waitlist`
- `POST /ops/login`
- `GET /app/config`
- `GET /ops/config`
- `PUT /ops/config`
- `GET /ops/branding`
- `PUT /ops/branding`
- `GET /ops/waitlist`
- `POST /ops/storage/presigned-logo`
- `GET /app/pages`
- `GET /app/pages/:slug`
- `GET /ops/pages`
- `GET /ops/pages/:slug`
- `PUT /ops/pages/:slug`
- `DELETE /ops/pages/:slug`
- `PUT /ops/content` (legacy LeanCMS compatibility)
- `GET /app/content/:slug` (legacy LeanCMS compatibility)
- `GET /health`

The `/v1/api/waitlist` route is kept so the current frontend value
`VITE_API_URL=http://localhost:8080/v1` can move to a Worker URL without changing the frontend code shape.

## Setup

1. Run `supabase-schema.sql` in the Supabase SQL editor.
2. Install dependencies: `npm install`
3. For local dev, copy `.dev.vars.example` to `.dev.vars`
4. Start locally with `npm run dev`

## Cloudflare Secrets

Set these in the Worker:

- `FRONTEND_ORIGIN`
- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `RESEND_FROM_NAME`
- `OPS_ADMIN_EMAIL`
- `OPS_ADMIN_PASSWORD`
- `OPS_JWT_SECRET`
- `BACKBLAZE_B2_KEY_ID`
- `BACKBLAZE_B2_APP_KEY`
- `BACKBLAZE_B2_PUBLIC_ASSETS_BUCKET_NAME` (preferred for logos)
- `BACKBLAZE_B2_BUCKET_NAME` (fallback bucket)
- `BACKBLAZE_B2_ENDPOINT_URL`
- `BACKBLAZE_B2_REGION`
- `BACKBLAZE_B2_PUBLIC_BASE_URL` (optional CDN/custom public base URL)

Example:

```bash
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SECRET_KEY
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put RESEND_FROM_EMAIL
npx wrangler secret put OPS_ADMIN_PASSWORD
npx wrangler secret put OPS_JWT_SECRET
npx wrangler secret put BACKBLAZE_B2_KEY_ID
npx wrangler secret put BACKBLAZE_B2_APP_KEY
```

For `FRONTEND_ORIGIN`, use a non-secret Worker var in `wrangler.toml` or the Cloudflare dashboard.

## Deploy

Use:

```bash
npm run deploy
```

If you deploy from Cloudflare dashboard/GitHub, make sure it is configured as a Workers build,
not Cloudflare Pages static output.

## Response Shape

Success:

```json
{ "message": "Successfully joined waitlist", "position": 1, "isNew": true }
```

Duplicate:

```json
{ "message": "Already on waitlist", "position": 1, "isNew": false }
```
