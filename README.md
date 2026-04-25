# Transfer Legacy Temporary Waitlist Backend

Small temporary API for landing-page waitlist signups while the final backend is still in progress.

## Runtime

This project now targets Cloudflare Workers directly. It exposes:

- `POST /api/waitlist`
- `POST /v1/api/waitlist`
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

Example:

```bash
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SECRET_KEY
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put RESEND_FROM_EMAIL
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
