-- Baseline schema: versioned save, history, restore and row-level security.
-- Run with `npm run db:test` (local stack must be running).
begin;
create extension if not exists pgtap with schema extensions;
select plan(21);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.test');

-- ── User A ────────────────────────────────────────────────────────────────
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select results_eq(
  $$ select version, conflict from public.save_base_cv('{"n":1}', 0) $$,
  $$ values (1, false) $$,
  'first save creates version 1');

select results_eq(
  $$ select version, conflict from public.save_base_cv('{"n":2}', 1) $$,
  $$ values (2, false) $$,
  'save with the current version bumps it');

select results_eq(
  $$ select version, conflict from public.save_base_cv('{"n":"stale"}', 1) $$,
  $$ values (2, true) $$,
  'save with a stale version reports a conflict');

select is((select content->>'n' from public.base_cvs), '2', 'a conflicting save changes nothing');

select is((select count(*)::int from public.base_cv_versions), 1, 'second save keeps a snapshot');
select is((select content->>'n' from public.base_cv_versions), '1', 'the snapshot holds the content before the save');

select public.save_base_cv('{"n":3}', 2);
select is((select count(*)::int from public.base_cv_versions), 1, 'saves within 10 minutes add no snapshot');

reset role;
update public.base_cv_versions set created_at = now() - interval '11 minutes';
set local role authenticated;

select public.save_base_cv('{"n":4}', 3);
select is((select count(*)::int from public.base_cv_versions), 2, 'a save 10+ minutes later adds a snapshot');

select results_eq(
  $$ select version, conflict from public.restore_base_cv(
       (select id from public.base_cv_versions order by created_at limit 1), 4) $$,
  $$ values (5, false) $$,
  'restore bumps the version');
select is((select content->>'n' from public.base_cvs), '1', 'restore brings back the snapshot content');
select is(
  (select content->>'n' from public.base_cv_versions where reason = 'restore'),
  '4',
  'restore keeps the replaced content as a snapshot');

select results_eq(
  $$ select version, conflict from public.restore_base_cv(
       (select id from public.base_cv_versions order by created_at limit 1), 4) $$,
  $$ values (5, true) $$,
  'restore with a stale version reports a conflict');

select is_empty(
  $$ select * from public.restore_base_cv(gen_random_uuid(), 5) $$,
  'restore of an unknown snapshot returns nothing');

reset role;
insert into public.base_cv_versions (id, user_id, content, reason, created_at)
  values ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', '{}', 'autosave', now() - interval '2 days');
insert into public.base_cv_versions (user_id, content, reason, created_at)
  select '11111111-1111-1111-1111-111111111111', '{}', 'autosave', now() - interval '1 day' - make_interval(mins => g)
  from generate_series(1, 55) g;
set local role authenticated;

select public.save_base_cv('{"n":6}', 5);
select is((select count(*)::int from public.base_cv_versions), 50, 'only the newest 50 snapshots are kept');

-- ── User B ────────────────────────────────────────────────────────────────
reset role;
insert into public.base_cv_versions (id, user_id, content, reason)
  values ('44444444-4444-4444-4444-444444444444', '11111111-1111-1111-1111-111111111111', '{"n":"a-private"}', 'autosave');
set local role authenticated;
set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select is((select count(*)::int from public.base_cvs), 0, 'B cannot see A''s CV');
select is((select count(*)::int from public.base_cv_versions), 0, 'B cannot see A''s history');
select results_eq(
  $$ select version, conflict from public.save_base_cv('{"b":1}', 0) $$,
  $$ values (1, false) $$,
  'B gets a CV of their own');
select is((select count(*)::int from public.base_cvs), 1, 'B sees only their own CV');
select is_empty(
  $$ select * from public.restore_base_cv('44444444-4444-4444-4444-444444444444', 1) $$,
  'B cannot restore A''s snapshot');

select throws_ok(
  $$ insert into public.ai_calls (user_id, task, provider, model, status)
     values ('22222222-2222-2222-2222-222222222222', 'x', 'x', 'x', 'ok') $$,
  '42501',
  null,
  'users cannot write AI call logs');

-- ── Anonymous ─────────────────────────────────────────────────────────────
set local role anon;
select throws_ok($$ select * from public.base_cvs $$, '42501', null, 'anonymous requests cannot read CVs');

select * from finish();
rollback;
