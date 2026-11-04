-- At most 10 imports per user per 24 hours, enforced here so parallel uploads can't race past the
-- API's own check. The advisory lock serializes concurrent inserts for the same user.
create function public.check_import_limit()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtext('cv_imports:' || new.user_id::text));
  if (select count(*) from public.cv_imports i
      where i.user_id = new.user_id and i.created_at > now() - interval '24 hours') >= 10 then
    raise exception 'import_limit' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger cv_imports_limit
  before insert on public.cv_imports
  for each row execute function public.check_import_limit();
