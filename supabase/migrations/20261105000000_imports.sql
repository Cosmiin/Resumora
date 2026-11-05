-- CV imports: an uploaded file is read by the queue consumer (service role), which stores the
-- organized result on the import row. The user reviews it and applies it with apply_import().

create table public.cv_imports (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  file_name    text not null check (char_length(file_name) <= 255),
  storage_path text not null,
  status       text not null default 'queued'
               check (status in ('queued', 'processing', 'ready', 'failed', 'applied')),
  error        text,
  result       jsonb check (result is null or (jsonb_typeof(result) = 'object' and octet_length(result::text) <= 524288)),
  attempts     int not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index cv_imports_user_created on public.cv_imports (user_id, created_at desc);

alter table public.cv_imports enable row level security;
revoke all on table public.cv_imports from anon, authenticated;
-- Users create imports and read their own. Everything else is written by the consumer
-- (service role) or by apply_import(), so a user can't mark an import ready or change its result.
grant select on table public.cv_imports to authenticated;
grant insert (id, file_name, storage_path) on table public.cv_imports to authenticated;

create policy "own imports: read" on public.cv_imports
  for select to authenticated using (user_id = auth.uid());
create policy "own imports: create" on public.cv_imports
  for insert to authenticated with check (user_id = auth.uid());

-- ── Uploaded files: private bucket, one folder per user (<userId>/<importId>.<ext>) ──

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'cv-imports', 'cv-imports', false, 5242880,
  array['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
);

create policy "own import files: upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'cv-imports' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own import files: read" on storage.objects
  for select to authenticated
  using (bucket_id = 'cv-imports' and (storage.foldername(name))[1] = auth.uid()::text);

-- ── Apply ──────────────────────────────────────────────────────────────────
-- Replaces the user's CV with a ready import's result, keeping the previous CV in history.
-- Returns no row when the import isn't the caller's or isn't ready (e.g. already applied).
--
-- SECURITY DEFINER: users have no update rights on cv_imports, so this function is the only
-- way to mark an import applied. It therefore checks auth.uid() itself on every query.
-- It is the one definer function in the schema; all others are security invoker.
create function public.apply_import(p_import_id uuid, p_expected_version int)
returns table (version int, updated_at timestamptz, conflict boolean)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_user    uuid := auth.uid();
  v_content jsonb;
  v_row     public.base_cvs%rowtype;
begin
  if v_user is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  select i.result->'content' into v_content
    from public.cv_imports i
    where i.id = p_import_id and i.user_id = v_user and i.status = 'ready'
    for update;
  if not found or v_content is null then
    return;
  end if;

  select * into v_row from public.base_cvs b where b.user_id = v_user for update;

  if not found then
    if p_expected_version <> 0 then
      return query select 0, 'epoch'::timestamptz, true;
      return;
    end if;
    insert into public.base_cvs (user_id, content, version)
      values (v_user, v_content, 1)
      returning * into v_row;
  else
    if v_row.version <> p_expected_version then
      return query select v_row.version, v_row.updated_at, true;
      return;
    end if;
    -- Always keep the CV being replaced, regardless of the 10-minute autosave rule.
    insert into public.base_cv_versions (user_id, content, reason) values (v_user, v_row.content, 'import');
    update public.base_cvs b
      set content = v_content, version = b.version + 1, updated_at = now()
      where b.user_id = v_user
      returning * into v_row;
    perform public.trim_cv_history(v_user);
  end if;

  update public.cv_imports i set status = 'applied', updated_at = now() where i.id = p_import_id;
  return query select v_row.version, v_row.updated_at, false;
end;
$$;

revoke execute on function public.apply_import(uuid, int) from public, anon;
grant execute on function public.apply_import(uuid, int) to authenticated;
