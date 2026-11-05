-- Voice sessions: count and record in one step, so parallel requests cannot all pass the daily limit.
-- The inserted row is the success log for that session. A failed attempt still uses one of the
-- day's sessions: there is no way to release a row, so a user cannot free their own quota.

create function public.reserve_voice_session(p_model text, p_limit int)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_used int;
begin
  if v_user is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  -- One reservation at a time per user; the lock is released when the transaction ends.
  perform pg_advisory_xact_lock(hashtextextended('voice:' || v_user::text, 0));

  select count(*) into v_used
    from public.ai_calls
   where user_id = v_user
     and task = 'enrich_voice'
     and status = 'ok'
     and created_at >= now() - interval '24 hours';

  if v_used >= p_limit then
    return false;
  end if;

  insert into public.ai_calls (user_id, task, provider, model, status)
    values (v_user, 'enrich_voice', 'openai', left(p_model, 100), 'ok');
  return true;
end;
$$;

revoke execute on function public.reserve_voice_session(text, int) from public, anon;
grant execute on function public.reserve_voice_session(text, int) to authenticated;
