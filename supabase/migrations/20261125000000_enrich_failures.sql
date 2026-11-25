-- Enrich failures (25 Nov): when a step of "preparing your changes" fails, the browser records which step, which role
-- and why (HTTP status, error code, request id, or "no answer" when the request never came back). Only AI call
-- failures were recorded before (ai_calls), so a failure on our own server left no trace. Read-only diagnostics:
-- nothing in the app reads these rows back.

create table public.enrich_failures (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  step        text not null check (length(step) <= 40),
  role_id     text check (length(role_id) <= 100),
  status      int,
  code        text check (length(code) <= 100),
  message     text check (length(message) <= 500),
  request_id  text check (length(request_id) <= 100),
  created_at  timestamptz not null default now()
);
create index enrich_failures_user_created on public.enrich_failures (user_id, created_at desc);

alter table public.enrich_failures enable row level security;
revoke all on table public.enrich_failures from anon, authenticated;
grant select, insert on table public.enrich_failures to authenticated;

create policy "own enrich failures: read" on public.enrich_failures
  for select to authenticated using (user_id = (select auth.uid()));
create policy "own enrich failures: create" on public.enrich_failures
  for insert to authenticated with check (user_id = (select auth.uid()));
