-- Run after schema.sql. This migration only adds Messenger and grounded-AI data.
create extension if not exists pgcrypto;

create table if not exists public.knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  pipeline_id uuid references public.pipelines(id) on delete set null,
  title text not null,
  document_type text not null default 'standard',
  source_label text,
  version text,
  page_reference text,
  effective_from date,
  effective_to date,
  approval_status text not null default 'approved',
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Keep the migration safe when an earlier Messenger preview was already installed.
alter table public.knowledge_documents add column if not exists document_type text not null default 'standard';
alter table public.knowledge_documents add column if not exists source_label text;
alter table public.knowledge_documents add column if not exists version text;
alter table public.knowledge_documents add column if not exists page_reference text;
alter table public.knowledge_documents add column if not exists effective_from date;
alter table public.knowledge_documents add column if not exists effective_to date;
alter table public.knowledge_documents add column if not exists approval_status text not null default 'approved';
alter table public.knowledge_documents add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.knowledge_documents add column if not exists enabled boolean not null default true;
alter table public.knowledge_documents add column if not exists updated_at timestamptz not null default now();

create table if not exists public.product_catalog (
  id uuid primary key default gen_random_uuid(),
  pipeline_id uuid references public.pipelines(id) on delete cascade,
  product_code text not null,
  name text not null,
  category text,
  dimensions text,
  color text,
  unit text not null default 'm2',
  specifications jsonb not null default '{}'::jsonb,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pipeline_id, product_code)
);

create table if not exists public.price_lists (
  id uuid primary key default gen_random_uuid(),
  pipeline_id uuid references public.pipelines(id) on delete cascade,
  name text not null,
  version text not null,
  effective_from date not null default current_date,
  effective_to date,
  approval_status text not null default 'draft',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pipeline_id, name, version)
);

create table if not exists public.product_prices (
  id uuid primary key default gen_random_uuid(),
  price_list_id uuid not null references public.price_lists(id) on delete cascade,
  product_id uuid not null references public.product_catalog(id) on delete cascade,
  region text not null default 'all',
  customer_group text not null default 'all',
  minimum_quantity numeric not null default 0,
  unit_price numeric(18, 2) not null check (unit_price >= 0),
  currency text not null default 'VND',
  unit text not null default 'm2',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (price_list_id, product_id, region, customer_group, minimum_quantity)
);

create table if not exists public.messenger_conversations (
  id uuid primary key default gen_random_uuid(),
  pipeline_id uuid references public.pipelines(id) on delete set null,
  page_id text not null,
  sender_psid text not null,
  bot_enabled boolean not null default true,
  status text not null default 'collecting',
  full_name text,
  phone text,
  email text,
  company_name text,
  need text,
  lead_id uuid references public.leads(id) on delete set null,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (page_id, sender_psid)
);

alter table public.messenger_conversations add column if not exists status text not null default 'collecting';
alter table public.messenger_conversations add column if not exists full_name text;
alter table public.messenger_conversations add column if not exists phone text;
alter table public.messenger_conversations add column if not exists email text;
alter table public.messenger_conversations add column if not exists company_name text;
alter table public.messenger_conversations add column if not exists need text;
alter table public.messenger_conversations add column if not exists lead_id uuid references public.leads(id) on delete set null;
alter table public.messenger_conversations add column if not exists updated_at timestamptz not null default now();

create table if not exists public.messenger_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.messenger_conversations(id) on delete cascade,
  event_id text not null unique,
  direction text not null check (direction in ('inbound', 'outbound')),
  sender_psid text not null,
  text text not null,
  provider text,
  grounding jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.messenger_messages add column if not exists grounding jsonb not null default '{}'::jsonb;

alter table public.knowledge_documents enable row level security;
alter table public.product_catalog enable row level security;
alter table public.price_lists enable row level security;
alter table public.product_prices enable row level security;
alter table public.messenger_conversations enable row level security;
alter table public.messenger_messages enable row level security;

create index if not exists idx_knowledge_documents_pipeline
  on public.knowledge_documents (pipeline_id, approval_status, enabled);
create index if not exists idx_product_catalog_pipeline_code
  on public.product_catalog (pipeline_id, product_code);
create index if not exists idx_price_lists_pipeline_effective
  on public.price_lists (pipeline_id, approval_status, effective_from desc);
create index if not exists idx_product_prices_product
  on public.product_prices (product_id, price_list_id);
create index if not exists idx_messenger_conversations_pipeline
  on public.messenger_conversations (pipeline_id, last_message_at desc);
create index if not exists idx_messenger_messages_conversation
  on public.messenger_messages (conversation_id, created_at desc);

grant all privileges on table public.knowledge_documents to service_role;
grant all privileges on table public.product_catalog to service_role;
grant all privileges on table public.price_lists to service_role;
grant all privileges on table public.product_prices to service_role;
grant all privileges on table public.messenger_conversations to service_role;
grant all privileges on table public.messenger_messages to service_role;
