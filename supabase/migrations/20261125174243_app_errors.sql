-- App errors (25 Nov): what the browser saw go wrong, so a red message on the site can be traced to its cause.
-- kind 'message': a red message shown (its text and the page); 'request': a request to our API that failed (path,
-- HTTP status, error code, request id; no status when it never came back); 'step': a failed step of preparing Enrich
-- changes (which step, which role). Only AI call failures were recorded before (ai_calls). Diagnostics only: nothing
-- in the app reads these rows back.

create table public.app_errors (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind        text not null check (kind in ('message', 'request', 'step')),
  page        text check (length(page) <= 200),
  step        text check (length(step) <= 40),
  role_id     text check (length(role_id) <= 100),
  path        text check (length(path) <= 200),
  status      int,
  code        text check (length(code) <= 100),
  message     text check (length(message) <= 500),
  request_id  text check (length(request_id) <= 100),
  created_at  timestamptz not null default now()
);
create index app_errors_user_created on public.app_errors (user_id, created_at desc);

alter table public.app_errors enable row level security;
revoke all on table public.app_errors from anon, authenticated;
grant select, insert on table public.app_errors to authenticated;

create policy "own app errors: read" on public.app_errors
  for select to authenticated using (user_id = (select auth.uid()));
create policy "own app errors: create" on public.app_errors
  for insert to authenticated with check (user_id = (select auth.uid()));
