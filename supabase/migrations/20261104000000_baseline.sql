-- Resumora baseline schema.
-- Each user has one CV (base_cvs) with a version number. Saves use a version check:
-- "last save wins, but a stale version is reported as a conflict instead of overwriting".
-- base_cv_versions keeps earlier states of the CV (newest 50) so the user can restore them.

-- ── Tables ────────────────────────────────────────────────────────────────

create table public.base_cvs (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  content    jsonb not null,
  version    int not null check (version > 0),
  updated_at timestamptz not null default now()
);

create table public.base_cv_versions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  content    jsonb not null,
  -- why this earlier state was kept: during editing, before a restore / import / AI change
  reason     text not null check (reason in ('autosave', 'restore', 'import', 'ai')),
  created_at timestamptz not null default now()
);
create index base_cv_versions_user_created on public.base_cv_versions (user_id, created_at desc);

-- One row per model call, written by the API (service role) for cost tracking and debugging.
create table public.ai_calls (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  task          text not null,
  provider      text not null,
  model         text not null,
  status        text not null check (status in ('ok', 'error')),
  error         text,
  duration_ms   int,
  input_tokens  int,
  output_tokens int,
  created_at    timestamptz not null default now()
);
create index ai_calls_user_created on public.ai_calls (user_id, created_at desc);

-- ── Access: signed-in users see only their own rows ────────────────────────

alter table public.base_cvs enable row level security;
alter table public.base_cv_versions enable row level security;
alter table public.ai_calls enable row level security;

revoke all on table public.base_cvs, public.base_cv_versions, public.ai_calls from anon, authenticated;
grant select, insert, update on table public.base_cvs to authenticated;
grant select, insert, delete on table public.base_cv_versions to authenticated;
grant select on table public.ai_calls to authenticated;

create policy "own cv: read" on public.base_cvs
  for select to authenticated using (user_id = (select auth.uid()));
create policy "own cv: create" on public.base_cvs
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "own cv: update" on public.base_cvs
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "own history: read" on public.base_cv_versions
  for select to authenticated using (user_id = (select auth.uid()));
create policy "own history: create" on public.base_cv_versions
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "own history: trim" on public.base_cv_versions
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "own ai calls: read" on public.ai_calls
  for select to authenticated using (user_id = (select auth.uid()));

-- ── Saving with a version check ────────────────────────────────────────────
-- Returns the CV's version after the call. conflict = true means p_expected_version was
-- stale: nothing changed and (version, updated_at) are the current values.

create function public.save_base_cv(p_content jsonb, p_expected_version int)
returns table (version int, updated_at timestamptz, conflict boolean)
language plpgsql
security invoker
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_user uuid := auth.uid();
  v_row  public.base_cvs%rowtype;
begin
  if v_user is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  select * into v_row from public.base_cvs b where b.user_id = v_user for update;

  if not found then
    if p_expected_version <> 0 then
      return query select 0, 'epoch'::timestamptz, true;
      return;
    end if;
    insert into public.base_cvs (user_id, content, version)
      values (v_user, p_content, 1)
      on conflict (user_id) do nothing
      returning * into v_row;
    if v_row.user_id is null then -- another request created it first
      select * into v_row from public.base_cvs b where b.user_id = v_user;
      return query select v_row.version, v_row.updated_at, true;
      return;
    end if;
    return query select v_row.version, v_row.updated_at, false;
    return;
  end if;

  if v_row.version <> p_expected_version then
    return query select v_row.version, v_row.updated_at, true;
    return;
  end if;

  -- Keep the state before this save, at most once every 10 minutes.
  if not exists (
    select 1 from public.base_cv_versions h
    where h.user_id = v_user and h.created_at > now() - interval '10 minutes'
  ) then
    insert into public.base_cv_versions (user_id, content, reason) values (v_user, v_row.content, 'autosave');
  end if;

  update public.base_cvs b
    set content = p_content, version = b.version + 1, updated_at = now()
    where b.user_id = v_user
    returning * into v_row;

  perform public.trim_cv_history(v_user);
  return query select v_row.version, v_row.updated_at, false;
end;
$$;

-- Restores an earlier state. Returns no row when the snapshot doesn't exist for this user.
create function public.restore_base_cv(p_version_id uuid, p_expected_version int)
returns table (version int, updated_at timestamptz, conflict boolean)
language plpgsql
security invoker
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_user     uuid := auth.uid();
  v_snapshot jsonb;
  v_row      public.base_cvs%rowtype;
begin
  select h.content into v_snapshot
    from public.base_cv_versions h
    where h.id = p_version_id and h.user_id = v_user;
  if not found then
    return;
  end if;

  select * into v_row from public.base_cvs b where b.user_id = v_user for update;
  if not found or v_row.version <> p_expected_version then
    return query select coalesce(v_row.version, 0), coalesce(v_row.updated_at, 'epoch'::timestamptz), true;
    return;
  end if;

  insert into public.base_cv_versions (user_id, content, reason) values (v_user, v_row.content, 'restore');

  update public.base_cvs b
    set content = v_snapshot, version = b.version + 1, updated_at = now()
    where b.user_id = v_user
    returning * into v_row;

  perform public.trim_cv_history(v_user);
  return query select v_row.version, v_row.updated_at, false;
end;
$$;

-- Keeps the newest 50 snapshots for a user.
create function public.trim_cv_history(p_user uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  delete from public.base_cv_versions h
  where h.user_id = p_user
    and h.id not in (
      select h2.id from public.base_cv_versions h2
      where h2.user_id = p_user
      order by h2.created_at desc
      limit 50
    );
$$;

revoke execute on function public.save_base_cv(jsonb, int), public.restore_base_cv(uuid, int), public.trim_cv_history(uuid)
  from public, anon;
grant execute on function public.save_base_cv(jsonb, int), public.restore_base_cv(uuid, int), public.trim_cv_history(uuid)
  to authenticated;
