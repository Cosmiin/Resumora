-- After an account is deleted, its last access token keeps working for up to an hour.
-- Files are not tied to the account the way table rows are, so that token could still read or upload files.
-- This rule closes it: file access needs an account that still exists.

-- SECURITY DEFINER because signed-in users cannot read auth.users. It answers only about the caller.
create function public.account_exists()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from auth.users where id = auth.uid());
$$;
revoke execute on function public.account_exists() from public, anon;
grant execute on function public.account_exists() to authenticated;

-- Restrictive: it is required on top of the per-bucket "own folder" rules, for every kind of access.
create policy "deleted accounts: no file access" on storage.objects
  as restrictive for all to authenticated
  using (public.account_exists())
  with check (public.account_exists());
