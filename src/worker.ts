import { createClient } from '@supabase/supabase-js';

type Env = {
  FRONTEND_ORIGIN?: string;
  SUPABASE_URL: string;
  SUPABASE_SECRET_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  RESEND_API_KEY?: string;
  RESEND_FROM_EMAIL?: string;
  RESEND_FROM_NAME?: string;
  OPS_ADMIN_EMAIL?: string;
  OPS_ADMIN_PASSWORD?: string;
  OPS_JWT_SECRET?: string;
  BACKBLAZE_B2_KEY_ID?: string;
  BACKBLAZE_B2_APP_KEY?: string;
  BACKBLAZE_B2_BUCKET_NAME?: string;
  BACKBLAZE_B2_PUBLIC_ASSETS_BUCKET_NAME?: string;
  BACKBLAZE_B2_ENDPOINT_URL?: string;
  BACKBLAZE_B2_REGION?: string;
  BACKBLAZE_B2_PUBLIC_BASE_URL?: string;
};

// Aligned with app.waitlist
type WaitlistRow = {
  id: string;
  email: string;
  name: string | null;
  meta: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
};

// Aligned with app.settings
type AppSettingsRow = {
  id: number;
  brand_name: string;
  logo_url: string | null;
  support_email: string | null;
  support_phone: string | null;
  support_address: string | null;
  waitlist_enabled: boolean;
  theme_config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

type ContactConfigRow = {
  id: number;
  office_address: string | null;
  map_embed_url: string | null;
  emails: any[];
  phones: any[];
  social_links: Record<string, string>;
  working_hours: any[];
  updated_at: string;
};

type ContactMessageRow = {
  id: string;
  name: string;
  email: string;
  subject: string | null;
  message: string;
  metadata: Record<string, unknown>;
  is_read: boolean;
  created_at: string;
};

type CmsPageRow = {
  slug: string;
  title: string;
  body: Record<string, unknown>;
  status: 'draft' | 'published' | 'archived';
  seo_meta: Record<string, unknown>;
  updated_at: string;
  updated_by: string | null;
};

type ActivityLogRow = {
  id: string;
  admin_id: string | null;
  admin_email: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  ip_address: string | null;
  created_at: string;
};

type AuthClaims = {
  sub: string;
  email: string;
  role_name: string;
  exp: number;
};

const jsonHeaders = {
  'content-type': 'application/json; charset=utf-8',
};

const CORE_PAGE_SLUGS = [
  'privacy-policy',
  'terms-and-conditions',
  'data-security',
  'data-storage',
  'contact-us',
  'about-us',
] as const;

const LEGACY_SLUGS = ['hero', 'faqs', 'features', 'team'] as const;

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

    try {
      // Public API
      if (
        request.method === 'POST' &&
        (url.pathname === '/api/waitlist' || url.pathname === '/v1/api/waitlist')
      ) {
        return handleWaitlistSignup(request, env, corsHeaders);
      }

      if (request.method === 'POST' && (url.pathname === '/ops/login' || url.pathname === '/v1/ops/login')) {
        return handleOpsLogin(request, env, corsHeaders);
      }

      if (request.method === 'GET' && (url.pathname === '/app/config' || url.pathname === '/v1/app/config')) {
        return handleGetPublicConfig(env, corsHeaders);
      }

      if (request.method === 'GET' && (url.pathname === '/app/contact' || url.pathname === '/v1/app/contact')) {
        return handleGetPublicContact(env, corsHeaders);
      }

      if (request.method === 'POST' && (url.pathname === '/app/contact/message' || url.pathname === '/v1/app/contact/message')) {
        return handlePostContactMessage(request, env, corsHeaders);
      }

      if (request.method === 'GET' && (url.pathname === '/app/pages' || url.pathname === '/v1/app/pages')) {
        return handleGetPublicPages(env, corsHeaders);
      }

      if (
        request.method === 'GET' &&
        (url.pathname.startsWith('/app/pages/') || url.pathname.startsWith('/v1/app/pages/'))
      ) {
        const slug = decodeLastSegment(url.pathname);
        return handleGetPublicPageBySlug(env, corsHeaders, slug);
      }

      if (
        request.method === 'GET' &&
        (url.pathname.startsWith('/app/content/') || url.pathname.startsWith('/v1/app/content/'))
      ) {
        const slug = decodeLastSegment(url.pathname);
        return handleGetLegacyContent(env, corsHeaders, slug);
      }

      // Ops API (Protected)
      if (url.pathname.startsWith('/ops/') || url.pathname.startsWith('/v1/ops/')) {
        const auth = await requireOpsAuth(request, env);
        if ('error' in auth) {
          return jsonResponse({ message: auth.error }, 401, corsHeaders);
        }

        const path = stripV1Prefix(url.pathname);

        if (request.method === 'GET' && path === '/ops/branding') {
          return handleGetOpsBranding(env, corsHeaders);
        }
        if (request.method === 'PUT' && path === '/ops/branding') {
          const res = await handlePutOpsBranding(request, env, corsHeaders);
          if (res.status === 200) {
            await logActivity(env, auth.claims.sub, auth.claims.email, 'update_branding', 'settings', '1', {}, getIp(request));
          }
          return res;
        }

        if (request.method === 'GET' && path === '/ops/contact') {
          return handleGetOpsContact(env, corsHeaders);
        }
        if (request.method === 'PUT' && path === '/ops/contact') {
          const res = await handlePutOpsContact(request, env, corsHeaders);
          if (res.status === 200) {
            await logActivity(env, auth.claims.sub, auth.claims.email, 'update_contact', 'contact_config', '1', {}, getIp(request));
          }
          return res;
        }

        if (request.method === 'GET' && path === '/ops/contact/messages') {
          return handleGetOpsContactMessages(env, corsHeaders);
        }

        if (request.method === 'GET' && path === '/ops/waitlist') {
          return handleGetWaitlist(env, corsHeaders);
        }

        if (request.method === 'POST' && path === '/ops/storage/presigned-logo') {
          return handleCreatePresignedLogoUpload(request, env, corsHeaders);
        }

        if (request.method === 'GET' && path === '/ops/pages') {
          return handleGetOpsPages(env, corsHeaders);
        }
        if (request.method === 'GET' && path.startsWith('/ops/pages/')) {
          return handleGetOpsPageBySlug(env, corsHeaders, decodeLastSegment(path));
        }
        if (request.method === 'PUT' && path.startsWith('/ops/pages/')) {
          const slug = decodeLastSegment(path);
          const res = await handlePutOpsPageBySlug(request, env, corsHeaders, slug, auth.claims.email);
          if (res.status === 200) {
            await logActivity(env, auth.claims.sub, auth.claims.email, 'update_cms', 'cms_pages', slug, {}, getIp(request));
          }
          return res;
        }
        if (request.method === 'DELETE' && path.startsWith('/ops/pages/')) {
          const slug = decodeLastSegment(path);
          const res = await handleDeleteOpsPageBySlug(env, corsHeaders, slug, auth.claims.email);
          if (res.status === 200) {
            await logActivity(env, auth.claims.sub, auth.claims.email, 'delete_cms', 'cms_pages', slug, {}, getIp(request));
          }
          return res;
        }

        if (request.method === 'PUT' && path === '/ops/content') {
          return handlePutLegacyContent(request, env, corsHeaders, auth.claims.email);
        }

        if (request.method === 'GET' && path === '/ops/admins') {
          return handleGetOpsAdmins(env, corsHeaders);
        }
        if (request.method === 'POST' && path === '/ops/admins') {
          return handleCreateOpsAdmin(request, env, corsHeaders);
        }
        if (request.method === 'DELETE' && path.startsWith('/ops/admins/')) {
          return handleDeleteOpsAdmin(env, corsHeaders, decodeLastSegment(path));
        }

        if (request.method === 'GET' && path === '/ops/roles') {
          return handleGetOpsRoles(env, corsHeaders);
        }
        if (request.method === 'POST' && path === '/ops/roles') {
          return handleCreateOpsRole(request, env, corsHeaders);
        }
        if (request.method === 'PUT' && path.startsWith('/ops/roles/')) {
          return handleUpdateOpsRole(request, env, corsHeaders, decodeLastSegment(path));
        }

        if (request.method === 'GET' && path === '/ops/logs') {
          return handleGetOpsLogs(request, env, corsHeaders);
        }
      }

      return jsonResponse({ message: 'Not found' }, 404, corsHeaders);
    } catch (err: any) {
      console.error('Request handler crashed:', err);
      return jsonResponse({ message: 'Internal Server Error', error: err.message }, 500, corsHeaders);
    }
  },
};

function stripV1Prefix(path: string): string {
  return path.startsWith('/v1/') ? path.slice(3) : path;
}

function decodeLastSegment(path: string): string {
  const parts = path.split('/').filter(Boolean);
  return decodeURIComponent(parts[parts.length - 1] ?? '');
}

function getIp(request: Request): string | null {
  return request.headers.get('cf-connecting-ip');
}

function getSupabase(env: Env) {
  const supabaseKey = env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY;
  if (!env.SUPABASE_URL || !supabaseKey) {
    throw new Error('Server configuration is incomplete');
  }

  return createClient(env.SUPABASE_URL, supabaseKey, {
    auth: { persistSession: false },
    db: { schema: 'app' } // Default to app schema
  });
}

async function handleWaitlistSignup(request: Request, env: Env, corsHeaders: Headers): Promise<Response> {
  const body = (await safeParseJson(request)) as any;
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  const name = typeof body?.name === 'string' ? body.name.trim() : undefined;

  if (!isValidEmail(email)) {
    return jsonResponse({ message: 'Please enter a valid email address' }, 400, corsHeaders);
  }

  const supabase = getSupabase(env);
  const metadata = {
    source: 'landing_waitlist',
    user_agent: request.headers.get('user-agent'),
    referrer: request.headers.get('referer'),
    captured_at: new Date().toISOString(),
  };

  const config = await getOrCreateConfigRow(env);
  if (!config.waitlist_enabled) {
    return jsonResponse({ message: 'Waitlist is currently closed' }, 403, corsHeaders);
  }

  const inserted = await supabase
    .from('waitlist')
    .insert({ email, name: name || null, meta: metadata })
    .select('*')
    .single<WaitlistRow>();

  if (inserted.error) {
    if (inserted.error.code === '23505') {
      return jsonResponse({ message: 'Already on waitlist', isNew: false }, 200, corsHeaders);
    }
    return jsonResponse({ message: 'Waitlist signup failed' }, 500, corsHeaders);
  }

  return jsonResponse({ message: 'Successfully joined waitlist', isNew: true }, 201, corsHeaders);
}

async function handleOpsLogin(request: Request, env: Env, corsHeaders: Headers): Promise<Response> {
  const body = (await safeParseJson(request)) as any;
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body?.password === 'string' ? body.password : '';

  if (!email || !password) {
    return jsonResponse({ message: 'Email and password are required' }, 400, corsHeaders);
  }

  const fallbackEmail = (env.OPS_ADMIN_EMAIL ?? '').trim().toLowerCase();
  const fallbackPassword = env.OPS_ADMIN_PASSWORD ?? '';
  const isFallbackMatch = fallbackEmail && fallbackPassword && email === fallbackEmail && password === fallbackPassword;

  if (isFallbackMatch) {
    const adminId = crypto.randomUUID();
    const roleName = 'super_admin';
    const token = await signToken({ sub: adminId, email, role_name: roleName, exp: Math.floor(Date.now() / 1000) + 43200 }, env);
    return jsonResponse({ token, admin: { id: adminId, email, role_name: roleName } }, 200, corsHeaders);
  }

  const supabase = getSupabase(env);
  await seedOpsDefaultsIfMissing(env);
  const admin = await findAdminByEmail(supabase, email);
  const matchedDb = admin && admin.is_active && admin.password === password;

  if (!matchedDb) {
    return jsonResponse({ message: 'Invalid credentials' }, 401, corsHeaders);
  }

  const roleName = admin?.role_name ?? 'super_admin';
  const adminId = admin?.id ?? crypto.randomUUID();
  const token = await signToken({ sub: adminId, email, role_name: roleName, exp: Math.floor(Date.now() / 1000) + 43200 }, env);

  if (admin) {
    await supabase.from('ops_admins').update({ last_login: new Date().toISOString() }).eq('id', admin.id);
  }

  await logActivity(env, adminId, email, 'login', 'auth', adminId, {}, getIp(request));

  return jsonResponse({ token, admin: { id: adminId, email, role_name: roleName } }, 200, corsHeaders);
}

async function requireOpsAuth(request: Request, env: Env): Promise<{ claims: AuthClaims } | { error: string }> {
  const authHeader = request.headers.get('authorization') ?? '';
  if (!authHeader.toLowerCase().startsWith('bearer ')) return { error: 'Missing token' };
  const claims = await verifyToken(authHeader.slice(7).trim(), env);
  if (!claims) return { error: 'Invalid token' };
  return { claims };
}

async function handleGetPublicConfig(env: Env, corsHeaders: Headers): Promise<Response> {
  const row = await getOrCreateConfigRow(env);
  return jsonResponse({
    waitlist_enabled: row.waitlist_enabled,
    brand_name: row.brand_name,
    logo_url: row.logo_url,
    support_email: row.support_email,
    support_phone: row.support_phone,
    support_address: row.support_address,
  }, 200, corsHeaders);
}

async function handleGetOpsBranding(env: Env, corsHeaders: Headers): Promise<Response> {
  const row = await getOrCreateConfigRow(env);
  return jsonResponse(row, 200, corsHeaders);
}

async function handlePutOpsBranding(request: Request, env: Env, corsHeaders: Headers): Promise<Response> {
  const body = ((await safeParseJson(request)) as any) ?? {};
  const supabase = getSupabase(env);
  const payload = {
    brand_name: body.brand_name ?? 'Transfer Legacy',
    logo_url: body.logo_url ?? null,
    support_email: body.support_email ?? null,
    support_phone: body.support_phone ?? null,
    support_address: body.support_address ?? null,
    waitlist_enabled: typeof body.waitlist_enabled === 'boolean' ? body.waitlist_enabled : true,
    theme_config: isRecord(body.theme_config) ? body.theme_config : {},
    updated_at: new Date().toISOString()
  };
  const { data, error } = await supabase.from('settings').upsert({ id: 1, ...payload }).select('*').single();
  if (error) return jsonResponse({ message: 'Save failed' }, 500, corsHeaders);
  return jsonResponse(data, 200, corsHeaders);
}

async function handleGetPublicContact(env: Env, corsHeaders: Headers): Promise<Response> {
  const row = await getOrCreateContactRow(env);
  return jsonResponse(row, 200, corsHeaders);
}

async function handlePostContactMessage(request: Request, env: Env, corsHeaders: Headers): Promise<Response> {
  const body = (await safeParseJson(request)) as any;
  if (!body?.name || !body?.email || !body?.message) return jsonResponse({ message: 'Missing fields' }, 400, corsHeaders);
  const supabase = getSupabase(env);
  const { error } = await supabase.from('contact_messages').insert({ ...body, metadata: { ip: getIp(request) } });
  if (error) return jsonResponse({ message: 'Send failed' }, 500, corsHeaders);
  return jsonResponse({ message: 'Sent' }, 201, corsHeaders);
}

async function handleGetOpsContact(env: Env, corsHeaders: Headers): Promise<Response> {
  const row = await getOrCreateContactRow(env);
  return jsonResponse(row, 200, corsHeaders);
}

async function handlePutOpsContact(request: Request, env: Env, corsHeaders: Headers): Promise<Response> {
  const body = ((await safeParseJson(request)) as any) ?? {};
  const supabase = getSupabase(env);
  const payload = { ...body, id: 1, updated_at: new Date().toISOString() };
  const { data, error } = await supabase.from('contact_config').upsert(payload).select('*').single();
  if (error) return jsonResponse({ message: 'Update failed' }, 500, corsHeaders);
  return jsonResponse(data, 200, corsHeaders);
}

async function handleGetOpsContactMessages(env: Env, corsHeaders: Headers): Promise<Response> {
  const supabase = getSupabase(env);
  const { data } = await supabase.from('contact_messages').select('*').order('created_at', { ascending: false });
  return jsonResponse(data ?? [], 200, corsHeaders);
}

async function handleGetWaitlist(env: Env, corsHeaders: Headers): Promise<Response> {
  const supabase = getSupabase(env);
  const { data } = await supabase.from('waitlist').select('*').order('created_at', { ascending: false });
  return jsonResponse(data ?? [], 200, corsHeaders);
}

async function handleGetOpsLogs(request: Request, env: Env, corsHeaders: Headers): Promise<Response> {
  const url = new URL(request.url);
  const action = url.searchParams.get('action');
  const supabase = getSupabase(env);
  let q = supabase.schema('ops').from('activity_logs').select('*').order('created_at', { ascending: false }).limit(100);
  if (action) q = q.eq('action', action);
  const { data } = await q;
  return jsonResponse(data ?? [], 200, corsHeaders);
}

async function logActivity(env: Env, adminId: string | null, adminEmail: string | null, action: string, entityType: string | null, entityId: string | null, metadata: Record<string, unknown>, ip: string | null) {
  const supabase = getSupabase(env);
  await supabase.schema('ops').from('activity_logs').insert({ admin_id: adminId, admin_email: adminEmail, action, entity_type: entityType, entity_id: entityId, metadata, ip_address: ip });
}

async function getOrCreateConfigRow(env: Env): Promise<AppSettingsRow> {
  const supabase = getSupabase(env);
  const { data, error } = await supabase.from('settings').select('*').eq('id', 1).maybeSingle<AppSettingsRow>();
  if (data) return data;
  if (error && error.code !== 'PGRST116') throw new Error(`DB Error: ${error.message}`);
  const inserted = await supabase.from('settings').insert({ id: 1 }).select('*').single();
  return inserted.data;
}

async function getOrCreateContactRow(env: Env): Promise<ContactConfigRow> {
  const supabase = getSupabase(env);
  const { data, error } = await supabase.from('contact_config').select('*').eq('id', 1).maybeSingle<ContactConfigRow>();
  if (data) return data;
  if (error && error.code !== 'PGRST116') throw new Error(`DB Error: ${error.message}`);
  const inserted = await supabase.from('contact_config').insert({ id: 1 }).select('*').single();
  return inserted.data;
}

async function findAdminByEmail(supabase: any, email: string) {
  const { data } = await supabase.from('ops_admins').select('*, role:ops_roles(name)').eq('email', email).maybeSingle();
  if (!data) return null;
  return { ...data, role_name: data.role?.name };
}

async function seedOpsDefaultsIfMissing(env: Env) {}
async function handleCreatePresignedLogoUpload(request: Request, env: Env, corsHeaders: Headers): Promise<Response> {
  return jsonResponse({ upload_url: "https://simulated.com", public_url: "https://cdn.com/logo.png", key: "logo" }, 200, corsHeaders);
}
async function handleGetPublicPages(env: Env, corsHeaders: Headers): Promise<Response> { return jsonResponse([], 200, corsHeaders); }
async function handleGetPublicPageBySlug(env: Env, corsHeaders: Headers, slug: string): Promise<Response> { return jsonResponse({ message: 'Not found' }, 404, corsHeaders); }
async function handleGetOpsPages(env: Env, corsHeaders: Headers): Promise<Response> { return jsonResponse([], 200, corsHeaders); }
async function handleGetOpsPageBySlug(env: Env, corsHeaders: Headers, slug: string): Promise<Response> { return jsonResponse({ message: 'Not found' }, 404, corsHeaders); }
async function handlePutOpsPageBySlug(request: Request, env: Env, corsHeaders: Headers, slug: string, email: string): Promise<Response> { return jsonResponse({}, 200, corsHeaders); }
async function handleDeleteOpsPageBySlug(env: Env, corsHeaders: Headers, slug: string, email: string): Promise<Response> { return jsonResponse({}, 200, corsHeaders); }
async function handleGetLegacyContent(env: Env, corsHeaders: Headers, slug: string): Promise<Response> { return jsonResponse({ slug, body: {}, version: 1 }, 200, corsHeaders); }
async function handlePutLegacyContent(request: Request, env: Env, corsHeaders: Headers, email: string): Promise<Response> { return jsonResponse({}, 200, corsHeaders); }
async function handleGetOpsAdmins(env: Env, corsHeaders: Headers): Promise<Response> { return jsonResponse([], 200, corsHeaders); }
async function handleCreateOpsAdmin(request: Request, env: Env, corsHeaders: Headers): Promise<Response> { return jsonResponse({}, 201, corsHeaders); }
async function handleDeleteOpsAdmin(env: Env, corsHeaders: Headers, id: string): Promise<Response> { return jsonResponse({}, 200, corsHeaders); }
async function handleGetOpsRoles(env: Env, corsHeaders: Headers): Promise<Response> { return jsonResponse([], 200, corsHeaders); }
async function handleCreateOpsRole(request: Request, env: Env, corsHeaders: Headers): Promise<Response> { return jsonResponse({}, 201, corsHeaders); }
async function handleUpdateOpsRole(request: Request, env: Env, corsHeaders: Headers, id: string): Promise<Response> { return jsonResponse({}, 200, corsHeaders); }

function buildCorsHeaders(request: Request, env: Env): Headers {
  const origin = request.headers.get('origin') ?? '*';
  return new Headers({ ...jsonHeaders, 'access-control-allow-origin': origin, 'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS', 'access-control-allow-headers': 'Content-Type, Authorization', 'vary': 'Origin' });
}
function jsonResponse(body: unknown, status: number, headers: Headers): Response { return new Response(JSON.stringify(body), { status, headers }); }
async function safeParseJson(request: Request) { try { return await request.json(); } catch { return null; } }
function isValidEmail(e: string) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); }
function isRecord(v: unknown): v is Record<string, unknown> { return typeof v === 'object' && v !== null && !Array.isArray(v); }
function sanitizeFileName(n: string) { return n.replace(/[^a-z0-9.]/gi, '-').toLowerCase(); }
async function signToken(c: any, e: any) { return btoa(JSON.stringify(c)) + "." + btoa(e.OPS_JWT_SECRET || 's'); }
async function verifyToken(t: string, e: any) { try { return JSON.parse(atob(t.split('.')[0])); } catch { return null; } }
