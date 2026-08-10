-- Chay sau schema.sql. Migration chi bo sung, khong thay doi bang CRM hien co.
create extension if not exists pgcrypto;

create table if not exists public.knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  pipeline_id uuid references public.pipelines(id) on delete set null,
  title text not null,
  source_label text,
  content text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.messenger_conversations (
  id uuid primary key default gen_random_uuid(),
  pipeline_id uuid references public.pipelines(id) on delete set null,
  page_id text not null,
  sender_psid text not null,
  bot_enabled boolean not null default true,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (page_id, sender_psid)
);

create table if not exists public.messenger_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.messenger_conversations(id) on delete cascade,
  event_id text not null unique,
  direction text not null check (direction in ('inbound', 'outbound')),
  sender_psid text not null,
  text text not null,
  provider text,
  created_at timestamptz not null default now()
);

alter table public.knowledge_documents enable row level security;
alter table public.messenger_conversations enable row level security;
alter table public.messenger_messages enable row level security;

create index if not exists idx_knowledge_documents_pipeline
  on public.knowledge_documents (pipeline_id, enabled);
create index if not exists idx_messenger_conversations_pipeline
  on public.messenger_conversations (pipeline_id, last_message_at desc);
create index if not exists idx_messenger_messages_conversation
  on public.messenger_messages (conversation_id, created_at desc);

grant all privileges on table public.knowledge_documents to service_role;
grant all privileges on table public.messenger_conversations to service_role;
grant all privileges on table public.messenger_messages to service_role;
