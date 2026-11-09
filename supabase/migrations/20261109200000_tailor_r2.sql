-- Tailoring round 2: steering answers, Experience role by role, cached tone examples.

alter table public.tailored_cvs
  add column steering jsonb not null default '{}';

alter table public.tailor_runs
  add column role_order text[] not null default '{}',
  add column current_role_id text;

-- The tone examples shown on the steering screen, with the bullet they were made from.
alter table public.jobs
  add column tone_examples jsonb;

-- Keep the existing logging behaviour and add the tone examples task.
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
