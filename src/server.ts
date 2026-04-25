import cors from 'cors';
import 'dotenv/config';
import express from 'express';
import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

type WaitlistRow = {
  id: string;
  email: string;
  position: number;
  created_at: string;
  confirmed: boolean;
  metadata: Record<string, unknown>;
};

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(8080),
  FRONTEND_ORIGIN: z.string().default('http://localhost:5173'),
  SUPABASE_URL: z.string().url(),
  // Prefer the new Supabase "secret key" (sb_secret_...), but allow legacy service_role too.
  SUPABASE_SECRET_KEY: z.string().min(1).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  RESEND_API_KEY: z.string().min(1),
  RESEND_FROM_EMAIL: z.string().min(1),
});

const env = envSchema
  .refine(
    (e) => Boolean(e.SUPABASE_SECRET_KEY || e.SUPABASE_SERVICE_ROLE_KEY),
    { message: 'Set SUPABASE_SECRET_KEY (preferred) or SUPABASE_SERVICE_ROLE_KEY' },
  )
  .parse(process.env);

const supabaseAdminKey = env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY!;

const app = express();
const resend = new Resend(env.RESEND_API_KEY);
const supabase = createClient(env.SUPABASE_URL, supabaseAdminKey, {
  auth: { persistSession: false },
});

const waitlistSignupSchema = z.object({
  email: z.string().trim().email(),
  name: z.string().trim().min(1).optional(),
});

app.use(express.json({ limit: '32kb' }));
app.use(
  cors({
    origin: env.FRONTEND_ORIGIN.split(',').map((origin) => origin.trim()),
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
  }),
);

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'tl-temp-backend' });
});

app.post(['/api/waitlist', '/v1/api/waitlist'], async (req, res) => {
  const parsed = waitlistSignupSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Please enter a valid email address' });
  }

  const email = parsed.data.email.toLowerCase();
  const metadata = {
    source: 'landing_waitlist',
    name: parsed.data.name ?? null,
    user_agent: req.get('user-agent') ?? null,
    referrer: req.get('referer') ?? null,
    accept_language: req.get('accept-language') ?? null,
    captured_at: new Date().toISOString(),
  };

  const inserted = await supabase
    .from('waitlist')
    .insert({ email, metadata })
    .select('id,email,position,created_at,confirmed,metadata')
    .single<WaitlistRow>();

  if (inserted.error) {
    if (inserted.error.code === '23505') {
      const existing = await findWaitlistEntry(email);
      if (!existing) {
        return res.status(500).json({ message: 'Waitlist signup could not be confirmed' });
      }

      return res.json({
        message: 'Already on waitlist',
        position: existing.position,
        isNew: false,
      });
    }

    console.error('Supabase waitlist insert failed:', inserted.error);
    return res.status(500).json({ message: 'Waitlist signup failed. Please try again.' });
  }

  try {
    await sendWelcomeEmail(inserted.data);
  } catch (error) {
    console.error('Resend waitlist email failed:', error);
  }

  return res.status(201).json({
    message: 'Successfully joined waitlist',
    position: inserted.data.position,
    isNew: true,
  });
});

app.use((_req, res) => {
  res.status(404).json({ message: 'Not found' });
});

app.listen(env.PORT, () => {
  console.log(`tl-temp-backend listening on port ${env.PORT}`);
});

async function findWaitlistEntry(email: string): Promise<WaitlistRow | null> {
  const { data, error } = await supabase
    .from('waitlist')
    .select('id,email,position,created_at,confirmed,metadata')
    .eq('email', email)
    .maybeSingle<WaitlistRow>();

  if (error) {
    console.error('Supabase waitlist lookup failed:', error);
    return null;
  }

  return data;
}

async function sendWelcomeEmail(entry: WaitlistRow): Promise<void> {
  const html = renderWaitlistEmail(entry);
  const text = [
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

  await resend.emails.send({
    from: env.RESEND_FROM_EMAIL,
    to: entry.email,
    subject: "You're on the Transfer Legacy waitlist",
    text,
    html,
  });
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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
