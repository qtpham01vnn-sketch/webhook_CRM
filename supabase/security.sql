-- Bao ve du lieu CRM khoi truy cap truc tiep bang anon/authenticated key.
-- Backend dung service_role nen van hoat dong va bo qua RLS.

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'pipelines',
    'leads',
    'pipeline_shares',
    'pipeline_forms',
    'knowledge_documents',
    'messenger_conversations',
    'messenger_messages'
  ]
  loop
    if to_regclass('public.' || table_name) is not null then
      execute format('alter table public.%I enable row level security', table_name);
      execute format(
        'revoke all privileges on table public.%I from anon, authenticated',
        table_name
      );
      execute format(
        'grant all privileges on table public.%I to service_role',
        table_name
      );
    end if;
  end loop;
end
$$;
