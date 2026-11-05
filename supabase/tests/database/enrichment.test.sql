-- Enrichment: cv_insights privacy, snapshot_base_cv, log_ai_call and reserve_voice_session.
-- Run with `npm run db:test` (local stack must be running).
begin;
create extension if not exists pgtap with schema extensions;
select plan(28);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.test');

-- ── User A stores and reads an insight ─────────────────────────────────────
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select lives_ok(
  $$ insert into public.cv_insights (user_id, role_id, fingerprint, policy, result)
     values ('11111111-1111-1111-1111-111111111111', 'r1', 'fp', 'score/1', '{"roleId":"r1"}') $$,
  'a user can store their own insight');
select is((select count(*)::int from public.cv_insights), 1, 'a user reads their own insight');

-- Focus mode: predicted results live in `pending` on the same row.
select col_type_is('public', 'cv_insights', 'pending', 'jsonb', 'cv_insights.pending is jsonb');
select is(
  (select pending from public.cv_insights where role_id = 'r1'),
  '[]'::jsonb, 'a new insight starts with no pending predictions');
select isnt_empty(
  $$ update public.cv_insights set pending = '[{"fingerprint":"fp2"}]' where role_id = 'r1' returning 1 $$,
  'a user can store pending predictions on their own insight');

-- ── User B sees none of it ─────────────────────────────────────────────────
set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select is((select count(*)::int from public.cv_insights), 0, 'another user sees no insights');
select is_empty(
  $$ update public.cv_insights set fingerprint = 'x' where role_id = 'r1' returning 1 $$,
  'another user cannot update an insight');
select is_empty(
  $$ delete from public.cv_insights where role_id = 'r1' returning 1 $$,
  'another user cannot delete an insight');
select throws_ok(
  $$ insert into public.cv_insights (user_id, role_id, fingerprint, policy, result)
     values ('11111111-1111-1111-1111-111111111111', 'r2', 'fp', 'score/1', '{}') $$,
  '42501', null,
  'a user cannot store an insight for someone else');

-- User A's row 'r1' holds pending = '[{"fingerprint":"fp2"}]': user B can neither read nor overwrite it.
select is_empty(
  $$ select pending from public.cv_insights where role_id = 'r1' $$,
  'another user cannot read pending predictions');
select is_empty(
  $$ update public.cv_insights set pending = '[]' where role_id = 'r1' returning 1 $$,
  'another user cannot overwrite pending predictions');

-- ── Signed-out visitors ────────────────────────────────────────────────────
set local role anon;
set local request.jwt.claims to '{"role":"anon"}';

select throws_ok(
  $$ select * from public.cv_insights $$,
  '42501', null,
  'a signed-out visitor cannot read insights');
select throws_ok(
  $$ select public.snapshot_base_cv('ai') $$,
  '42501', null,
  'a signed-out visitor cannot call snapshot_base_cv');
select throws_ok(
  $$ select public.log_ai_call('enrich_score', 'p', 'm', 'ok', null, 1, 1, 1) $$,
  '42501', null,
  'a signed-out visitor cannot call log_ai_call');

-- ── History copy before AI changes ─────────────────────────────────────────
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

insert into public.base_cvs (user_id, content, version)
  values ('11111111-1111-1111-1111-111111111111', '{"n":"current"}', 1);

select lives_ok($$ select public.snapshot_base_cv('ai') $$, 'a user can copy their CV to History');
select is(
  (select count(*)::int from public.base_cv_versions where reason = 'ai' and content = '{"n":"current"}'),
  1, 'the copy holds the current CV with reason ai');

-- A second copy of the same CV (a rewrite, then Try again) adds nothing.
select public.snapshot_base_cv('ai');
select is((select count(*)::int from public.base_cv_versions), 1, 'two copies of the same CV leave one row');

-- After the CV changes, the next copy is kept.
update public.base_cvs set content = '{"n":"edited"}' where user_id = '11111111-1111-1111-1111-111111111111';
select public.snapshot_base_cv('ai');
select is((select count(*)::int from public.base_cv_versions), 2, 'a copy of a changed CV is kept');

do $$
begin
  for i in 1..60 loop
    update public.base_cvs set content = jsonb_build_object('n', i) where user_id = '11111111-1111-1111-1111-111111111111';
    perform public.snapshot_base_cv('ai');
  end loop;
end
$$;
select is((select count(*)::int from public.base_cv_versions), 50, 'History keeps 50 rows');

select throws_ok(
  $$ select public.snapshot_base_cv('import') $$,
  '22023', null,
  'any reason other than ai is rejected');

-- ── AI call log ────────────────────────────────────────────────────────────
select lives_ok(
  $$ select public.log_ai_call('enrich_score', 'p', 'm', 'ok', null, 12, 3, 4) $$,
  'a user can log an AI call');
select is(
  (select user_id::text from public.ai_calls where task = 'enrich_score'),
  '11111111-1111-1111-1111-111111111111',
  'the logged call belongs to the signed-in user');
select throws_ok(
  $$ select public.log_ai_call('not_a_task', 'p', 'm', 'ok', null, 1, 1, 1) $$,
  '22023', null,
  'an unknown task is rejected');

-- ── Voice sessions: 20 a day per user ───────────────────────────────────────
select is(
  (select count(*)::int from (select public.reserve_voice_session('m', 20) as ok from generate_series(1, 20)) s where s.ok),
  20, 'twenty voice sessions are reserved in a day');
select is(public.reserve_voice_session('m', 20), false, 'the 21st voice session is refused');
select is(
  (select count(*)::int from public.ai_calls where task = 'enrich_voice'),
  20, 'a refused reservation writes no row');

set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select is(public.reserve_voice_session('m', 20), true, 'another user''s sessions do not count');

set local role anon;
set local request.jwt.claims to '{"role":"anon"}';
select throws_ok(
  $$ select public.reserve_voice_session('m', 20) $$,
  '42501', null,
  'a signed-out visitor cannot reserve a voice session');

select * from finish();
rollback;
