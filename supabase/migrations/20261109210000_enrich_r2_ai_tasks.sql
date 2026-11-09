-- Enrichment round 2: log_ai_call accepts the two new model tasks, enrich_role_description (the role's
-- two-sentence introduction) and enrich_achievements (Key achievements suggestions). Without them their
-- calls are rejected by the allowlist and never reach ai_calls.
-- tailor_tone_examples (tailoring round 2, migration 20261109200000 on its own branch) is kept in the list,
-- so whichever of the two migrations runs last keeps every name.
-- Same body, security and grants as 20261108000000_tailoring.sql; only the list changes.

create or replace function public.log_ai_call(
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
  if p_task not in (
    'cv_admit', 'cv_extract',
    'enrich_score', 'enrich_rewrite_role', 'enrich_rewrite_summary', 'enrich_skills', 'enrich_voice',
    'enrich_improve_bullet', 'enrich_brain_dump', 'enrich_role_facts',
    'enrich_role_description', 'enrich_achievements',
    'job_extract',
    'tailor_score', 'tailor_questions', 'tailor_section', 'tailor_verify', 'tailor_translate', 'tailor_letter',
    'tailor_tone_examples'
  ) then
    raise exception 'unknown ai task' using errcode = '22023';
  end if;

  insert into public.ai_calls (user_id, task, provider, model, status, error, duration_ms, input_tokens, output_tokens)
    values (v_user, p_task, p_provider, p_model, p_status, left(p_error, 500), p_duration_ms, p_input_tokens, p_output_tokens);
end;
$$;

revoke execute on function public.log_ai_call(text, text, text, text, text, int, int, int) from public, anon;
grant execute on function public.log_ai_call(text, text, text, text, text, int, int, int) to authenticated;
