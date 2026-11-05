-- Base CV enrichment: cached role results, a History copy before AI changes,
-- and AI call logging from request handlers.

-- ── cv_insights: one cached result per role. Losing it costs only tokens. ──

create table public.cv_insights (
  user_id     uuid not null references auth.users (id) on delete cascade,
  role_id     text not null,
  fingerprint text not null,
  policy      text not null,
  result      jsonb not null,
  updated_at  timestamptz not null default now(),
  primary key (user_id, role_id)
);

alter table public.cv_insights enable row level security;

revoke all on table public.cv_insights from anon, authenticated;
grant select, insert, update, delete on table public.cv_insights to authenticated;

create policy "own insights: read" on public.cv_insights
  for select to authenticated using (user_id = (select auth.uid()));
create policy "own insights: create" on public.cv_insights
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "own insights: update" on public.cv_insights
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own insights: delete" on public.cv_insights
  for delete to authenticated using (user_id = (select auth.uid()));

-- ── History copy taken before an AI change ─────────────────────────────────
-- Copies the caller's current saved CV into History, then keeps the newest 50.
-- SECURITY DEFINER with a fixed reason: callers can only ask for an 'ai' copy of their own CV.

create function public.snapshot_base_cv(p_reason text)
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
    where b.user_id = v_user;

  perform public.trim_cv_history(v_user);
end;
$$;

-- ── AI call log from request handlers ──────────────────────────────────────
-- The user id always comes from the sign-in, never from the caller.

create function public.log_ai_call(
  p_task text, p_provider text, p_model text, p_status text, p_error text,
  p_duration_ms int, p_input_tokens int, p_output_tokens int
)
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
  if p_task not in ('cv_admit', 'cv_extract', 'enrich_score', 'enrich_rewrite_role', 'enrich_rewrite_summary', 'enrich_skills', 'enrich_voice') then
    raise exception 'unknown ai task' using errcode = '22023';
  end if;

  insert into public.ai_calls (user_id, task, provider, model, status, error, duration_ms, input_tokens, output_tokens)
    values (v_user, p_task, p_provider, p_model, p_status, left(p_error, 500), p_duration_ms, p_input_tokens, p_output_tokens);
end;
$$;

revoke execute on function public.snapshot_base_cv(text), public.log_ai_call(text, text, text, text, text, int, int, int)
  from public, anon;
grant execute on function public.snapshot_base_cv(text), public.log_ai_call(text, text, text, text, text, int, int, int)
  to authenticated;
