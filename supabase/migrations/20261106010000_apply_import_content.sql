-- apply_import gets an optional p_content. When given, it is saved instead of the stored import
-- result, so the API can keep each matching role's notes when a CV is imported again.
-- Everything else is unchanged: the version check, the 'import' History copy, the security settings.
-- A new argument would add a second function, so the old one is dropped first.
-- Users can already save any valid content with save_base_cv, so this gives no new power.
-- The content checks on base_cvs and base_cv_versions still apply to whatever is saved.

drop function if exists public.apply_import(uuid, int);

create or replace function public.apply_import(p_import_id uuid, p_expected_version int, p_content jsonb default null)
returns table (version int, updated_at timestamptz, conflict boolean)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_user    uuid := auth.uid();
  v_content jsonb;
  v_row     public.base_cvs%rowtype;
begin
  if v_user is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  select i.result->'content' into v_content
    from public.cv_imports i
    where i.id = p_import_id and i.user_id = v_user and i.status = 'ready'
    for update;
  if not found or v_content is null then
    return;
  end if;

  -- The API passes the imported CV with the old notes carried over. Use it instead of the stored result.
  v_content := coalesce(p_content, v_content);

  select * into v_row from public.base_cvs b where b.user_id = v_user for update;

  if not found then
    if p_expected_version <> 0 then
      return query select 0, 'epoch'::timestamptz, true;
      return;
    end if;
    insert into public.base_cvs (user_id, content, version)
      values (v_user, v_content, 1)
      returning * into v_row;
  else
    if v_row.version <> p_expected_version then
      return query select v_row.version, v_row.updated_at, true;
      return;
    end if;
    -- Always keep the CV being replaced, regardless of the 10-minute autosave rule.
    insert into public.base_cv_versions (user_id, content, reason) values (v_user, v_row.content, 'import');
    update public.base_cvs b
      set content = v_content, version = b.version + 1, updated_at = now()
      where b.user_id = v_user
      returning * into v_row;
    perform public.trim_cv_history(v_user);
  end if;

  update public.cv_imports i set status = 'applied', updated_at = now() where i.id = p_import_id;
  return query select v_row.version, v_row.updated_at, false;
end;
$$;

revoke execute on function public.apply_import(uuid, int, jsonb) from public, anon;
grant execute on function public.apply_import(uuid, int, jsonb) to authenticated;
