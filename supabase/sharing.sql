-- Chay sau schema.sql de bat tinh nang chia se lead an toan.
create extension if not exists pgcrypto;

create table if not exists public.pipeline_shares (
  id uuid primary key default gen_random_uuid(),
  pipeline_id uuid not null unique references public.pipelines(id) on delete cascade,
  token text not null unique,
  password_hash text not null,
  enabled boolean not null default true,
  visible_columns jsonb not null default '["received_at","phone","note","company_name","full_name","email"]'::jsonb,
  column_order jsonb not null default '["received_at","phone","note","company_name","full_name","email"]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_pipeline_shares_token
  on public.pipeline_shares(token);

grant all privileges on table public.pipeline_shares to service_role;
