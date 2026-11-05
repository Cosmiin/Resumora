-- History copy before an AI change: skip it when History's newest copy already holds the same CV.
-- Every rewrite (and every Try again) asks for a copy; without this, repeated copies of an unchanged
-- CV push the user's real earlier versions out of the 50 that History keeps.

create or replace function public.snapshot_base_cv(p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if p_reason is distinct from 'ai' then
    raise exception 'unsupported snapshot reason' using errcode = '22023';
  end if;

  insert into public.base_cv_versions (user_id, content, reason)
    select b.user_id, b.content, p_reason
    from public.base_cvs b
    where b.user_id = v_user
      and b.content is distinct from (
        select h.content
        from public.base_cv_versions h
        where h.user_id = v_user
        order by h.created_at desc
        limit 1
      );

  perform public.trim_cv_history(v_user);
end;
$$;

revoke execute on function public.snapshot_base_cv(text) from public, anon;
grant execute on function public.snapshot_base_cv(text) to authenticated;
