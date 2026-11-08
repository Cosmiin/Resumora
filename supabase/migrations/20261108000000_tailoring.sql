-- Tailored documents, resumable runs and match scores belong to one saved job.
alter table public.jobs
  add column user_thoughts text check (char_length(user_thoughts) <= 2000),
  add column application_status text not null default 'saved'
    check (application_status in ('saved', 'tailored', 'applied', 'interview', 'offer', 'rejected'));

create table public.tailored_cvs (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  job_id            uuid not null references public.jobs (id) on delete cascade,
  language          text not null check (language in ('ro', 'en', 'fr', 'de', 'es', 'it')),
  translated_from   uuid references public.tailored_cvs (id) on delete set null,
  content           jsonb not null,
  base_snapshot     jsonb not null,
  base_snapshot_at  timestamptz not null,
  template          text not null default 'classic' check (template in ('classic', 'modern', 'compact')),
  tone              text,
  instruction       text,
  review            jsonb,
  score             jsonb,
  cover_letter      jsonb,
  version           int not null default 1,
  created_at        timestamptz not null default now(),
  -- As with jobs, writers set updated_at when changing the row.
  updated_at        timestamptz not null default now(),
  unique (job_id, language)
);

create table public.tailor_runs (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  job_id           uuid not null references public.jobs (id) on delete cascade,
  tailored_cv_id   uuid references public.tailored_cvs (id) on delete cascade,
  kind             text not null check (kind in ('tailor', 'retailor', 'section', 'translate', 'cover_letter')),
  sections         text[] not null,
  status           text not null check (status in ('running', 'waiting_user', 'done', 'failed')),
  current_section  text,
  questions        jsonb,
  answers          jsonb,
  proposals        jsonb,
  error_code       text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table public.match_scores (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  job_id          uuid not null references public.jobs (id) on delete cascade,
  target          text not null check (target in ('base', 'tailored')),
  tailored_cv_id  uuid,
  policy          text not null,
  labels          jsonb not null,
  parts           jsonb not null,
  total           int,
  band            text,
  created_at      timestamptz not null default now()
);
create index match_scores_job_target_created on public.match_scores (job_id, target, created_at desc);

alter table public.tailored_cvs enable row level security;
alter table public.tailor_runs enable row level security;
alter table public.match_scores enable row level security;
revoke all on table public.tailored_cvs, public.tailor_runs, public.match_scores from anon, authenticated;
grant select, insert, update, delete on table public.tailored_cvs, public.tailor_runs, public.match_scores
  to authenticated;

create policy "own tailored cvs: read" on public.tailored_cvs
  for select to authenticated using (user_id = auth.uid());
create policy "own tailored cvs: create" on public.tailored_cvs
  for insert to authenticated with check (
    user_id = auth.uid()
    and exists (select 1 from public.jobs j where j.id = tailored_cvs.job_id and j.user_id = auth.uid())
  );
create policy "own tailored cvs: update" on public.tailored_cvs
  for update to authenticated using (user_id = auth.uid()) with check (
    user_id = auth.uid()
    and exists (select 1 from public.jobs j where j.id = tailored_cvs.job_id and j.user_id = auth.uid())
  );
create policy "own tailored cvs: delete" on public.tailored_cvs
  for delete to authenticated using (user_id = auth.uid());

create policy "own tailor runs: read" on public.tailor_runs
  for select to authenticated using (user_id = auth.uid());
create policy "own tailor runs: create" on public.tailor_runs
  for insert to authenticated with check (
    user_id = auth.uid()
    and exists (select 1 from public.jobs j where j.id = tailor_runs.job_id and j.user_id = auth.uid())
    and (tailored_cv_id is null or exists (
      select 1 from public.tailored_cvs c
      where c.id = tailor_runs.tailored_cv_id and c.user_id = auth.uid()
    ))
  );
create policy "own tailor runs: update" on public.tailor_runs
  for update to authenticated using (user_id = auth.uid()) with check (
    user_id = auth.uid()
    and exists (select 1 from public.jobs j where j.id = tailor_runs.job_id and j.user_id = auth.uid())
    and (tailored_cv_id is null or exists (
      select 1 from public.tailored_cvs c
      where c.id = tailor_runs.tailored_cv_id and c.user_id = auth.uid()
    ))
  );
create policy "own tailor runs: delete" on public.tailor_runs
  for delete to authenticated using (user_id = auth.uid());

create policy "own match scores: read" on public.match_scores
  for select to authenticated using (user_id = auth.uid());
create policy "own match scores: create" on public.match_scores
  for insert to authenticated with check (
    user_id = auth.uid()
    and exists (select 1 from public.jobs j where j.id = match_scores.job_id and j.user_id = auth.uid())
  );
create policy "own match scores: update" on public.match_scores
  for update to authenticated using (user_id = auth.uid()) with check (
    user_id = auth.uid()
    and exists (select 1 from public.jobs j where j.id = match_scores.job_id and j.user_id = auth.uid())
  );
create policy "own match scores: delete" on public.match_scores
  for delete to authenticated using (user_id = auth.uid());

-- Keep the existing logging behaviour and add the six tailoring tasks.
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
    'tailor_score', 'tailor_questions', 'tailor_section', 'tailor_verify', 'tailor_translate', 'tailor_letter'
  ) then
    raise exception 'unknown ai task' using errcode = '22023';
  end if;

  insert into public.ai_calls (user_id, task, provider, model, status, error, duration_ms, input_tokens, output_tokens)
    values (v_user, p_task, p_provider, p_model, p_status, left(p_error, 500), p_duration_ms, p_input_tokens, p_output_tokens);
end;
$$;

revoke execute on function public.log_ai_call(text, text, text, text, text, int, int, int) from public, anon;
grant execute on function public.log_ai_call(text, text, text, text, text, int, int, int) to authenticated;
