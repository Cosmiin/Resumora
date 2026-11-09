-- Tailoring round 2: steering, role order, tone examples and the new AI task.
-- Run with `npm run db:test` (local stack must be running).
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

select col_not_null('public', 'tailored_cvs', 'steering', 'steering is required');
select col_default_is('public', 'tailored_cvs', 'steering', '{}'::jsonb, 'steering defaults to an empty object');
select col_not_null('public', 'tailor_runs', 'role_order', 'role order is required');
select col_default_is('public', 'tailor_runs', 'role_order', '{}'::text[], 'role order defaults to empty');
select col_is_null('public', 'tailor_runs', 'current_role_id', 'the current role may be empty');
select col_type_is('public', 'jobs', 'tone_examples', 'jsonb', 'tone examples are stored as jsonb');
select col_is_null('public', 'jobs', 'tone_examples', 'tone examples start empty');

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.test');

set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

insert into public.jobs (id, source, url, url_normalized, tone_examples) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'link', 'https://example.test/1', 'https://example.test/1',
   '{"bullet":"Ran reports","lines":[]}');
insert into public.tailored_cvs (id, job_id, language, content, base_snapshot, base_snapshot_at, steering)
  values ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
          'en', '{}', '{}', now(), '{"tone":"warm","focusRoleIds":["r1"]}');
insert into public.tailor_runs (id, job_id, tailored_cv_id, kind, sections, status, role_order, current_role_id)
  values ('cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
          'bbbbbbbb-0000-0000-0000-000000000001', 'tailor', array['experience'], 'running',
          array['r1', 'r2'], 'r1');

select is((select steering->>'tone' from public.tailored_cvs), 'warm', 'the owner can store steering');
select is((select role_order from public.tailor_runs), array['r1', 'r2'], 'the owner can store the role order');
select lives_ok(
  $$ select public.log_ai_call('tailor_tone_examples', 'test', 'test', 'ok', null, 1, 1, 1) $$,
  'tone examples calls can be logged');

-- User B sees none of user A's rows.
set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select is((select count(*)::int from public.tailored_cvs), 0, 'another user cannot read the steering');
select is((select count(*)::int from public.tailor_runs), 0, 'another user cannot read the role order');
select is((select count(*)::int from public.jobs), 0, 'another user cannot read the tone examples');
update public.tailor_runs set current_role_id = 'r2';
reset role;
select is((select current_role_id from public.tailor_runs where id = 'cccccccc-0000-0000-0000-000000000001'), 'r1', 'another user cannot move the current role');

select * from finish();
rollback;
