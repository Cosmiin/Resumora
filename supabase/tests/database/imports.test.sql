-- Imports: privacy of import rows and uploaded files, and apply_import.
-- Run with `npm run db:test` (local stack must be running).
begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.test');

-- ── User A creates an import ───────────────────────────────────────────────
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select lives_ok(
  $$ insert into public.cv_imports (id, file_name, storage_path)
     values ('aaaaaaaa-0000-0000-0000-000000000001', 'cv.pdf', '11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000001.pdf') $$,
  'a user can create an import');
select is((select status from public.cv_imports), 'queued', 'a new import is queued');
select is((select user_id::text from public.cv_imports), '11111111-1111-1111-1111-111111111111', 'the import belongs to its creator');

select throws_ok(
  $$ update public.cv_imports set status = 'ready' $$,
  '42501', null,
  'a user cannot change an import directly');

select lives_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values ('cv-imports', '11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000001.pdf', '11111111-1111-1111-1111-111111111111') $$,
  'a user can upload into their own folder');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values ('cv-imports', '22222222-2222-2222-2222-222222222222/x.pdf', '11111111-1111-1111-1111-111111111111') $$,
  '42501', null,
  'a user cannot upload into another user''s folder');

-- The consumer (service role) marks it ready.
reset role;
update public.cv_imports
  set status = 'ready',
      result = '{"content":{"n":"imported"},"warnings":[]}'
  where id = 'aaaaaaaa-0000-0000-0000-000000000001';
insert into public.cv_imports (id, user_id, file_name, storage_path, status, result) values
  ('aaaaaaaa-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'b.pdf', 'x', 'processing', null);

-- ── User B can see none of it ──────────────────────────────────────────────
set local role authenticated;
set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select is((select count(*)::int from public.cv_imports), 0, 'another user sees no imports');
select is((select count(*)::int from storage.objects where bucket_id = 'cv-imports'), 0, 'another user sees no uploaded files');
select is_empty(
  $$ select * from public.apply_import('aaaaaaaa-0000-0000-0000-000000000001', 0) $$,
  'another user cannot apply the import');

-- ── User A applies ─────────────────────────────────────────────────────────
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select results_eq(
  $$ select version, conflict from public.apply_import('aaaaaaaa-0000-0000-0000-000000000001', 0) $$,
  $$ values (1, false) $$,
  'a first-ever CV is applied as version 1');
select is((select count(*)::int from public.base_cv_versions), 0, 'no snapshot when there was no CV before');
select is((select status from public.cv_imports where id = 'aaaaaaaa-0000-0000-0000-000000000001'), 'applied', 'the import is marked applied');

select is_empty(
  $$ select * from public.apply_import('aaaaaaaa-0000-0000-0000-000000000001', 1) $$,
  'apply_import only once');

select is_empty(
  $$ select * from public.apply_import('aaaaaaaa-0000-0000-0000-000000000002', 1) $$,
  'an import that is not ready cannot be applied');

-- A second import over an existing CV.
reset role;
insert into public.cv_imports (id, user_id, file_name, storage_path, status, result) values
  ('aaaaaaaa-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'c.pdf', 'x', 'ready',
   '{"content":{"n":"second"},"warnings":[]}');
set local role authenticated;

select results_eq(
  $$ select version, conflict from public.apply_import('aaaaaaaa-0000-0000-0000-000000000003', 0) $$,
  $$ values (1, true) $$,
  'a stale version reports a conflict');

select results_eq(
  $$ select version, conflict from public.apply_import('aaaaaaaa-0000-0000-0000-000000000003', 1) $$,
  $$ values (2, false) $$,
  'apply over an existing CV bumps the version');
select results_eq(
  $$ select reason, content->>'n' from public.base_cv_versions $$,
  $$ values ('import'::text, 'imported'::text) $$,
  'the previous CV is kept as an import snapshot');

-- ── Daily limit, enforced in the database so parallel uploads can't get past it ──
set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select lives_ok(
  $$ insert into public.cv_imports (file_name, storage_path)
     select 'f.pdf', '22222222-2222-2222-2222-222222222222/' || g || '.pdf' from generate_series(1, 10) g $$,
  'ten imports within 24 hours are allowed');
select throws_ok(
  $$ insert into public.cv_imports (file_name, storage_path) values ('f.pdf', '22222222-2222-2222-2222-222222222222/x.pdf') $$,
  'P0001', 'import_limit',
  'an 11th import within 24 hours is refused');

select * from finish();
rollback;
