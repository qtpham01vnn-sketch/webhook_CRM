grant usage on schema public to anon, authenticated, service_role;

grant all privileges on table public.pipelines to service_role;
grant all privileges on table public.leads to service_role;

grant select, insert, update, delete on table public.pipelines to authenticated;
grant select, insert, update, delete on table public.leads to authenticated;
