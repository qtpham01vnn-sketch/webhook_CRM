create extension if not exists pgcrypto;

create table if not exists public.pipeline_forms (
  id uuid primary key default gen_random_uuid(),
  pipeline_id uuid not null unique references public.pipelines(id) on delete cascade,
  fields jsonb not null default '[{"key":"full_name","label":"Họ và tên","type":"text","required":true},{"key":"phone","label":"Số điện thoại","type":"tel","required":true},{"key":"email","label":"Email","type":"email","required":false},{"key":"note","label":"Nội dung tư vấn","type":"textarea","required":false},{"key":"company_name","label":"Tên doanh nghiệp","type":"text","required":false}]'::jsonb,
  title text not null default 'Đăng ký tư vấn',
  submit_label text not null default 'Gửi thông tin',
  success_message text not null default 'Cảm ơn anh/chị! Thông tin đã được gửi thành công.',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_pipeline_forms_pipeline_id
  on public.pipeline_forms(pipeline_id);

grant all privileges on table public.pipeline_forms to service_role;
