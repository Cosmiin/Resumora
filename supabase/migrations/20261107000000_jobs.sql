-- Saved jobs and extraction runs. Deleting a job does not give a run back.
create table public.jobs (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  source          text not null check (source in ('link', 'extension')),
  url             text not null,
  url_normalized  text not null,
  status          text not null default 'queued'
                  check (status in ('queued', 'processing', 'ready', 'needs_text', 'failed')),
  error_code      text check (error_code in ('fetch_blocked', 'page_empty', 'not_a_job', 'ai_failed')),
  raw_text        text,
  json_ld         jsonb,
  attempts        int not null default 0,
  title           text,
  company         text,
  location        text,
  extracted       jsonb,
  edited_by_user  boolean not null default false,
  version         int not null default 1,
  created_at      timestamptz not null default now(),
  -- As with cv_imports, writers set updated_at when changing the row.
  updated_at      timestamptz not null default now(),
  unique (user_id, url_normalized)
);
create index jobs_user_created on public.jobs (user_id, created_at desc);

create table public.job_runs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  job_id      uuid references public.jobs (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index job_runs_user_created on public.job_runs (user_id, created_at);

alter table public.jobs enable row level security;
alter table public.job_runs enable row level security;
revoke all on table public.jobs, public.job_runs from anon, authenticated;
grant select, insert, update, delete on table public.jobs, public.job_runs to authenticated;

create policy "own jobs: read" on public.jobs
  for select to authenticated using (user_id = auth.uid());
create policy "own jobs: create" on public.jobs
  for insert to authenticated with check (user_id = auth.uid());
create policy "own jobs: update" on public.jobs
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own jobs: delete" on public.jobs
  for delete to authenticated using (user_id = auth.uid());

-- No update or delete policy: those statements affect no runs, even for the owner.
create policy "own job runs: read" on public.job_runs
  for select to authenticated using (user_id = auth.uid());
create policy "own job runs: create" on public.job_runs
  for insert to authenticated with check (user_id = auth.uid());

-- Serialize inserts for each user so concurrent requests cannot pass the daily limit.
create function public.check_job_limit()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtext('job_runs:' || new.user_id::text));
  if (select count(*) from public.job_runs r
      where r.user_id = new.user_id and r.created_at > now() - interval '24 hours') >= 30 then
    raise exception 'job_limit' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger job_runs_limit
  before insert on public.job_runs
  for each row execute function public.check_job_limit();

-- The run and job are inserted together; job_limit also undoes the job insert.
create function public.add_job_run()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into public.job_runs (user_id, job_id) values (new.user_id, new.id);
  return new;
end;
$$;

create trigger jobs_add_run
  after insert on public.jobs
  for each row execute function public.add_job_run();
