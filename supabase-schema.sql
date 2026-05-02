-- Final Supabase Schema for Temp Backend (Aligned with Real Backend)

-- Create schemas
CREATE SCHEMA IF NOT EXISTS app;
CREATE SCHEMA IF NOT EXISTS ops;

-- 1. App Settings (Aligned)
CREATE TABLE IF NOT EXISTS app.settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    brand_name TEXT NOT NULL DEFAULT 'Transfer Legacy',
    logo_url TEXT NULL,
    support_email TEXT NULL,
    support_phone TEXT NULL,
    support_address TEXT NULL,
    waitlist_enabled BOOLEAN NOT NULL DEFAULT true,
    theme_config JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO app.settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- 2. Waitlist (Aligned)
CREATE TABLE IF NOT EXISTS app.waitlist (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    name TEXT NULL,
    meta JSONB NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    is_deleted BOOLEAN NOT NULL DEFAULT false
);

-- 3. Contact Config
CREATE TABLE IF NOT EXISTS app.contact_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    office_address TEXT NULL,
    map_embed_url TEXT NULL,
    emails JSONB NOT NULL DEFAULT '[]',
    phones JSONB NOT NULL DEFAULT '[]',
    social_links JSONB NOT NULL DEFAULT '{}',
    working_hours JSONB NOT NULL DEFAULT '[]',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO app.contact_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- 4. Contact Messages
CREATE TABLE IF NOT EXISTS app.contact_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    subject TEXT NULL,
    message TEXT NOT NULL,
    metadata JSONB NULL DEFAULT '{}',
    is_read BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Audit Logs
CREATE TABLE IF NOT EXISTS ops.activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID NULL,
    admin_email TEXT NULL,
    action TEXT NOT NULL,
    entity_type TEXT NULL,
    entity_id TEXT NULL,
    metadata JSONB NULL DEFAULT '{}',
    ip_address TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- DATA MIGRATION: Copy existing waitlist data from public.waitlist to app.waitlist
-- We do not delete the public.waitlist table.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'waitlist') THEN
        INSERT INTO app.waitlist (id, email, meta, created_at)
        SELECT id, email, metadata, created_at 
        FROM public.waitlist
        ON CONFLICT (email) DO NOTHING;
    END IF;
    
    -- Also migrate from app_config if it existed in public
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'app_config') THEN
        UPDATE app.settings s
        SET 
            brand_name = ac.brand_name,
            logo_url = ac.logo_url,
            support_email = ac.support_email,
            waitlist_enabled = ac.waitlist_enabled,
            theme_config = ac.theme_config
        FROM public.app_config ac
        WHERE s.id = 1;
    END IF;
END $$;
