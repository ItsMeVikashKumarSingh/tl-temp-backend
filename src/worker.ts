import { createClient } from '@supabase/supabase-js';

type Env = {
  FRONTEND_ORIGIN?: string;
  SUPABASE_URL: string;
  SUPABASE_SECRET_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  RESEND_API_KEY: string;
  RESEND_FROM_EMAIL: string;
};

type WaitlistRow = {
  id: string;
  email: string;
  position: number;
  created_at: string;
  confirmed: boolean;
  metadata: Record<string, unknown>;
};

const jsonHeaders = {
  'content-type': 'application/json; charset=utf-8',
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const corsHeaders = buildCorsHeaders(request, env);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method === 'GET' && url.pathname === '/health') {
      return jsonResponse({ ok: true, service: 'tl-temp-backend' }, 200, corsHeaders);
    }

    if (
      request.method === 'POST' &&
      (url.pathname === '/api/waitlist' || url.pathname === '/v1/api/waitlist')
    ) {
      return handleWaitlistSignup(request, env, corsHeaders);
    }

    return jsonResponse({ message: 'Not found' }, 404, corsHeaders);
  },
};

async function handleWaitlistSignup(
  request: Request,
  env: Env,
  corsHeaders: Headers,
): Promise<Response> {
  const body = await safeParseJson(request);
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  const name = typeof body?.name === 'string' ? body.name.trim() : undefined;

  if (!isValidEmail(email)) {
    return jsonResponse({ message: 'Please enter a valid email address' }, 400, corsHeaders);
  }

  const supabaseKey = env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY;
  if (!env.SUPABASE_URL || !supabaseKey || !env.RESEND_API_KEY || !env.RESEND_FROM_EMAIL) {
    return jsonResponse({ message: 'Server configuration is incomplete' }, 500, corsHeaders);
  }

  const supabase = createClient(env.SUPABASE_URL, supabaseKey, {
    auth: { persistSession: false },
  });

  const metadata = {
    source: 'landing_waitlist',
    name: name || null,
    user_agent: request.headers.get('user-agent'),
    referrer: request.headers.get('referer'),
    accept_language: request.headers.get('accept-language'),
    captured_at: new Date().toISOString(),
  };

  const inserted = await supabase
    .from('waitlist')
    .insert({ email, metadata })
    .select('id,email,position,created_at,confirmed,metadata')
    .single<WaitlistRow>();

  if (inserted.error) {
    if (inserted.error.code === '23505') {
      const existing = await supabase
        .from('waitlist')
        .select('id,email,position,created_at,confirmed,metadata')
        .eq('email', email)
        .maybeSingle<WaitlistRow>();

      if (existing.error || !existing.data) {
        return jsonResponse(
          { message: 'Waitlist signup could not be confirmed' },
          500,
          corsHeaders,
        );
      }

      return jsonResponse(
        {
          message: 'Already on waitlist',
          position: existing.data.position,
          isNew: false,
        },
        200,
        corsHeaders,
      );
    }

    console.error('Supabase waitlist insert failed:', inserted.error);
    return jsonResponse({ message: 'Waitlist signup failed. Please try again.' }, 500, corsHeaders);
  }

  try {
    await sendWelcomeEmail(inserted.data, env);
  } catch (error) {
    console.error('Resend waitlist email failed:', error);
  }

  return jsonResponse(
    {
      message: 'Successfully joined waitlist',
      position: inserted.data.position,
      isNew: true,
    },
    201,
    corsHeaders,
  );
}

async function sendWelcomeEmail(entry: WaitlistRow, env: Env): Promise<void> {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.RESEND_FROM_EMAIL,
      to: entry.email,
      subject: "You're on the Transfer Legacy waitlist",
      text: renderWaitlistText(entry),
      html: renderWaitlistEmail(entry),
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Resend failed: ${response.status} ${body}`);
  }
}

function renderWaitlistText(entry: WaitlistRow): string {
  return [
    "You're officially on the Transfer Legacy waitlist.",
    '',
    `Your spot is saved${entry.position ? `: #${entry.position}` : ''}.`,
    '',
    "We're building a secure, private way for families to access digital assets if something happens to the owner.",
    '',
    "Here's what happens next:",
    '- You will get exclusive early access before public launch.',
    '- We will share product previews and build updates.',
    '- You will be first to know when onboarding begins.',
    '',
    "One small ask: reply to this email and tell us the one thing you worry about most when it comes to your crypto and your family.",
    '',
    'Welcome aboard.',
    'The Transfer Legacy Team',
  ].join('\n');
}

function renderWaitlistEmail(entry: WaitlistRow): string {
  const position = entry.position ? `#${entry.position.toLocaleString('en-US')}` : 'saved';

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Transfer Legacy Waitlist</title>
    <style>
      body {
        margin: 0;
        padding: 0;
        background: #f5f5f0;
        font-family: "Georgia", "Times New Roman", serif;
        color: #1f1d1b;
      }
      .wrapper {
        max-width: 640px;
        margin: 0 auto;
        padding: 32px 20px 48px;
      }
      .card {
        background: #ffffff;
        border: 1px solid #e0ddd7;
        border-radius: 12px;
        padding: 28px;
        box-shadow: 0 8px 24px rgba(22, 18, 14, 0.08);
      }
      .badge {
        display: inline-block;
        background: #1f1d1b;
        color: #f5f5f0;
        padding: 6px 12px;
        border-radius: 999px;
        font-size: 12px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      h1 {
        margin: 16px 0 12px;
        font-size: 26px;
        line-height: 1.2;
      }
      p {
        margin: 0 0 12px;
        font-size: 16px;
        line-height: 1.6;
      }
      ul {
        margin: 12px 0 18px;
        padding-left: 20px;
      }
      li {
        margin: 0 0 8px;
        font-size: 16px;
        line-height: 1.5;
      }
      .position {
        display: inline-block;
        margin: 8px 0 16px;
        padding: 10px 14px;
        background: #f5f5f0;
        border: 1px solid #e0ddd7;
        border-radius: 8px;
        font-weight: 700;
      }
      .footer {
        margin-top: 22px;
        font-size: 12px;
        color: #6f6b65;
      }
      .footer p {
        font-size: 12px;
        line-height: 1.5;
      }
      a {
        color: #1f1d1b;
      }
    </style>
  </head>
  <body>
    <div class="wrapper">
      <div class="card">
        <span class="badge">Waitlist</span>
        <h1>Your spot is saved.</h1>
        <div class="position">Waitlist position: ${escapeHtml(position)}</div>
        <p>Hi there,</p>
        <p>
          You're officially on the Transfer Legacy waitlist, and you joined at exactly the right time.
        </p>
        <p>
          We're building something most crypto holders have not fully planned for yet: a secure,
          private way for your family to access your digital assets if something happens to you.
        </p>
        <p>
          Right now, most people's crypto inheritance plan is nothing. No instructions. No access.
          No peace of mind. That's what we're fixing.
        </p>
        <p><strong>Here's what happens next:</strong></p>
        <ul>
          <li>You'll get exclusive early access before we open to the public.</li>
          <li>We'll share product previews and updates as we build.</li>
          <li>You'll be the first to know when onboarding begins.</li>
        </ul>
        <p>
          One small ask: reply to this email and tell us the one thing you worry about most when it
          comes to your crypto and your family. Wallet access? Legal clarity? Not knowing who to trust?
        </p>
        <p>Your answer helps us build exactly what you need.</p>
        <p>Welcome aboard.<br />The Transfer Legacy Team</p>
      </div>
      <div class="footer">
        <p>You're receiving this because you joined the Transfer Legacy waitlist. No spam, ever.</p>
        <p>
          <strong>About Transfer Legacy</strong><br />
          Secure your digital assets for the next generation.
          Visit <a href="https://transferlegacy.com">transferlegacy.com</a> to learn more.
        </p>
      </div>
    </div>
  </body>
</html>`;
}

function buildCorsHeaders(request: Request, env: Env): Headers {
  const origin = request.headers.get('origin') ?? '';
  const allowedOrigins = (env.FRONTEND_ORIGIN ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  const allowOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0] ?? '*';

  const headers = new Headers(jsonHeaders);
  headers.set('access-control-allow-origin', allowOrigin);
  headers.set('access-control-allow-methods', 'GET,POST,OPTIONS');
  headers.set('access-control-allow-headers', 'Content-Type');
  headers.set('vary', 'Origin');
  return headers;
}

function jsonResponse(body: unknown, status: number, headers: Headers): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

async function safeParseJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const data = await request.json();
    if (typeof data === 'object' && data !== null) {
      return data as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
