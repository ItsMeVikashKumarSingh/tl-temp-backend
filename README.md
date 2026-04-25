# Transfer Legacy Temporary Waitlist Backend

Small temporary API for landing-page waitlist signups while the final backend is still in progress.

## Setup

1. Run `supabase-schema.sql` in the Supabase SQL editor.
2. Create `.env` from `.env.example`.
3. Install dependencies:

```bash
npm install
```

4. Start locally:

```bash
npm run dev
```

## API

`POST /api/waitlist`

The backend also accepts `POST /v1/api/waitlist` so the current frontend value
`VITE_API_URL=http://localhost:8080/v1` works without changing `.env.local`.

```json
{ "email": "person@example.com" }
```

Success response:

```json
{ "message": "Successfully joined waitlist", "position": 1, "isNew": true }
```

Duplicate response:

```json
{ "message": "Already on waitlist", "position": 1, "isNew": false }
```

`GET /health`

```json
{ "ok": true, "service": "tl-temp-backend" }

## Supabase Key Note

Use `SUPABASE_SECRET_KEY` (format `sb_secret_...`) if available. The older JWT-based
`SUPABASE_SERVICE_ROLE_KEY` may still work, but is no longer the recommended option.
```
