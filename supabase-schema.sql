create table if not exists public.waitlist (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  position bigserial,
  created_at timestamptz not null default now(),
  confirmed boolean not null default false,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists waitlist_email_idx on public.waitlist (email);

alter table public.waitlist enable row level security;

drop policy if exists "service role manages waitlist" on public.waitlist;
create policy "service role manages waitlist"
  on public.waitlist
  for all
  to service_role
  using (true)
  with check (true);
