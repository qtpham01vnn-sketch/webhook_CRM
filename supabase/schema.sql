-- Mini SaaS CRM Lead Management
-- Chay file nay trong Supabase Dashboard > SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.pipelines (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  webhook_slug text not null unique,
  redirect_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  pipeline_id uuid not null references public.pipelines(id) on delete cascade,
  full_name text,
  phone text,
  email text,
  note text,
  company_name text,
  raw_metadata jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now()
);

create index if not exists idx_leads_pipeline_id
  on public.leads (pipeline_id);

create index if not exists idx_leads_phone
  on public.leads (phone);

-- Ho tro sap xep danh sach lead moi nhat trong tung pipeline.
create index if not exists idx_leads_pipeline_received_at
  on public.leads (pipeline_id, received_at desc);

