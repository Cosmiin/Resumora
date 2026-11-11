-- One row of account preferences per user: the name shown in the app and the defaults new documents start with.
create table public.user_preferences (
  user_id             uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  display_name        text check (char_length(display_name) <= 120),
  default_template    text not null default 'classic' check (default_template in ('classic', 'modern', 'compact')),
  -- 'job' = the job ad's language, 'cv' = the base CV's language, otherwise always that language.
  tailoring_language  text not null default 'job'
    check (tailoring_language in ('job', 'cv', 'ro', 'en', 'fr', 'de', 'es', 'it')),
  updated_at          timestamptz not null default now()
);

alter table public.user_preferences enable row level security;
revoke all on table public.user_preferences from anon, authenticated;
-- No delete: the row goes away with the account.
grant select, insert, update on table public.user_preferences to authenticated;

create policy "own preferences: read" on public.user_preferences
  for select to authenticated using (user_id = auth.uid());
create policy "own preferences: create" on public.user_preferences
  for insert to authenticated with check (user_id = auth.uid());
create policy "own preferences: update" on public.user_preferences
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
