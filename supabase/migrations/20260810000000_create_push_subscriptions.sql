create extension if not exists pgcrypto;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  enabled boolean not null default true,
  constraint push_subscriptions_endpoint_length
    check (octet_length(endpoint) between 1 and 2048),
  constraint push_subscriptions_p256dh_format
    check (char_length(p256dh) between 80 and 120 and p256dh ~ '^[A-Za-z0-9_-]+$'),
  constraint push_subscriptions_auth_format
    check (char_length(auth) between 16 and 64 and auth ~ '^[A-Za-z0-9_-]+$')
);

create index if not exists push_subscriptions_enabled_idx
  on public.push_subscriptions (enabled)
  where enabled = true;

alter table public.push_subscriptions enable row level security;

revoke all on table public.push_subscriptions from anon, authenticated;

comment on table public.push_subscriptions is
  'Anonymous Web Push delivery data. Accessible only from trusted server-side code.';
