-- The API merges newer notes into the version before restoring it.
drop function if exists public.restore_base_cv(uuid, int);

create function public.restore_base_cv(p_version_id uuid, p_expected_version int, p_content jsonb)
returns table (version int, updated_at timestamptz, conflict boolean)
language plpgsql
security invoker
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_user     uuid := auth.uid();
  v_row      public.base_cvs%rowtype;
begin
  perform 1
    from public.base_cv_versions h
    where h.id = p_version_id and h.user_id = v_user;
  if not found then
    return;
  end if;

  select * into v_row from public.base_cvs b where b.user_id = v_user for update;
  if not found or v_row.version <> p_expected_version then
    return query select coalesce(v_row.version, 0), coalesce(v_row.updated_at, 'epoch'::timestamptz), true;
    return;
  end if;

  if p_content is null or jsonb_typeof(p_content) <> 'object' then
    raise exception 'content must be a JSON object' using errcode = '22023';
  end if;

  insert into public.base_cv_versions (user_id, content, reason) values (v_user, v_row.content, 'restore');

  update public.base_cvs b
    set content = p_content, version = b.version + 1, updated_at = now()
    where b.user_id = v_user
    returning * into v_row;

  perform public.trim_cv_history(v_user);
  return query select v_row.version, v_row.updated_at, false;
end;
$$;

revoke execute on function public.restore_base_cv(uuid, int, jsonb) from public, anon;
grant execute on function public.restore_base_cv(uuid, int, jsonb) to authenticated;
