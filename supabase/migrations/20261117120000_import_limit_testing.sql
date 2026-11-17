-- Raise the daily import limit from 10 to 1000 while the owner tests; keep in step with
-- IMPORTS_PER_DAY in apps/api/src/imports/repo.ts. Same body as 20261105010000_import_limit.sql.
create or replace function public.check_import_limit()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtext('cv_imports:' || new.user_id::text));
  if (select count(*) from public.cv_imports i
      where i.user_id = new.user_id and i.created_at > now() - interval '24 hours') >= 1000 then
    raise exception 'import_limit' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
