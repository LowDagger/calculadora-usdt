create extension if not exists pgcrypto;
create table if not exists public.devices (
  id uuid primary key default gen_random_uuid(), secret_hash text not null check (length(secret_hash) = 64),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(), device_id uuid not null references public.devices(id) on delete cascade,
  endpoint text unique not null, p256dh text not null, auth text not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.rate_alerts (
  id uuid primary key default gen_random_uuid(), device_id uuid not null references public.devices(id) on delete cascade,
  rate_type text not null check (rate_type in ('p2p','bcv')), measurement text not null check (measurement in ('ves','percent')),
  direction text not null check (direction in ('up','down','any')), threshold numeric not null check (threshold > 0 and threshold <= 100000),
  baseline_rate numeric not null check (baseline_rate > 0), recurring boolean not null default false, active boolean not null default true,
  last_observed_rate numeric, last_observed_provider_timestamp timestamptz, last_triggered_at timestamptz, cooldown_until timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists rate_alerts_active_idx on public.rate_alerts(active, rate_type);
create index if not exists rate_alerts_device_idx on public.rate_alerts(device_id, created_at desc);
create index if not exists push_subscriptions_device_idx on public.push_subscriptions(device_id);
alter table public.devices enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.rate_alerts enable row level security;
revoke all on public.devices, public.push_subscriptions, public.rate_alerts from anon, authenticated;
create or replace function public.enforce_active_alert_limit() returns trigger language plpgsql as $$
begin
  if new.active and (select count(*) from public.rate_alerts where device_id = new.device_id and active and id <> new.id) >= 5 then
    raise exception 'maximum five active alerts per device';
  end if; return new;
end $$;
drop trigger if exists rate_alert_limit on public.rate_alerts;
create trigger rate_alert_limit before insert or update of active on public.rate_alerts for each row execute function public.enforce_active_alert_limit();
