-- Jobs: privacy, constraints and the daily extraction limit.
-- Run with `npm run db:test` (local stack must be running).
begin;
create extension if not exists pgtap with schema extensions;
select plan(30);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.test');

-- User A creates a job and its first run in the same statement.
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select lives_ok(
  $$ insert into public.jobs (id, source, url, url_normalized, status)
     values ('aaaaaaaa-0000-0000-0000-000000000001', 'extension',
             'https://example.test/jobs/1', 'https://example.test/jobs/1', 'queued') $$,
  'a user can create a job');
select is(
  (select count(*)::int from public.job_runs where job_id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  1, 'creating a job adds exactly one run');
select is((select user_id::text from public.jobs), '11111111-1111-1111-1111-111111111111',
  'the job belongs to its creator');
select is((select user_id::text from public.job_runs), '11111111-1111-1111-1111-111111111111',
  'the automatic run belongs to the job owner');
select results_eq(
  $$ select attempts, version, edited_by_user from public.jobs $$,
  $$ values (0, 1, false) $$,
  'a new job has no attempts or edits and starts at version one');
select throws_ok(
  $$ insert into public.jobs (source, url, url_normalized)
     values ('link', 'https://example.test/jobs/1#title', 'https://example.test/jobs/1') $$,
  '23505', null, 'a duplicate normalized URL is rejected for the same user');
select throws_ok(
  $$ insert into public.jobs (source, url, url_normalized, status)
     values ('link', 'https://example.test/invalid', 'https://example.test/invalid', 'done') $$,
  '23514', null, 'done is not a job status');
select throws_ok(
  $$ insert into public.jobs (source, url, url_normalized)
     values ('email', 'https://example.test/invalid', 'https://example.test/invalid') $$,
  '23514', null, 'email is not a job source');
select throws_ok(
  $$ update public.jobs set error_code = 'unknown_error' $$,
  '23514', null, 'an unknown error code is rejected');

-- User B cannot read or change A's job or read A's runs.
set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select is_empty($$ select * from public.jobs $$, 'another user sees no jobs');
select is_empty(
  $$ update public.jobs set title = 'changed' where id = 'aaaaaaaa-0000-0000-0000-000000000001' returning id $$,
  'another user cannot update a job');
select is_empty(
  $$ delete from public.jobs where id = 'aaaaaaaa-0000-0000-0000-000000000001' returning id $$,
  'another user cannot delete a job');
select is_empty($$ select * from public.job_runs $$, 'another user sees no runs');
select throws_ok(
  $$ insert into public.jobs (user_id, source, url, url_normalized)
     values ('11111111-1111-1111-1111-111111111111', 'link', 'https://example.test/other', 'https://example.test/other') $$,
  '42501', null, 'a user cannot create another user''s job');
select throws_ok(
  $$ insert into public.job_runs (user_id)
     values ('11111111-1111-1111-1111-111111111111') $$,
  '42501', null, 'a user cannot create another user''s run');

-- User A can edit and delete the job, but cannot change or remove its run.
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select is_empty(
  $$ update public.job_runs set created_at = now() - interval '25 hours' returning id $$,
  'a user cannot update their own run');
select is_empty($$ delete from public.job_runs returning id $$, 'a user cannot delete their own run');
select lives_ok(
  $$ update public.jobs set title = 'Engineer', updated_at = now()
     where id = 'aaaaaaaa-0000-0000-0000-000000000001' $$,
  'a user can update their own job');
select is((select title from public.jobs), 'Engineer', 'the job edit is saved');
select throws_ok(
  $$ update public.jobs set user_id = '22222222-2222-2222-2222-222222222222' $$,
  '42501', null, 'a user cannot transfer their job to someone else');
select lives_ok(
  $$ delete from public.jobs where id = 'aaaaaaaa-0000-0000-0000-000000000001' $$,
  'a user can delete their own job');
select is((select count(*)::int from public.job_runs where job_id is null), 1,
  'deleting a job keeps its run with a null job id');

-- One older run is ignored while the retained recent run still uses a place.
insert into public.job_runs (created_at) values (now() - interval '25 hours');
select is(
  (select count(*)::int from public.job_runs
   where user_id = '11111111-1111-1111-1111-111111111111' and created_at < now() - interval '24 hours'),
  1, 'a directly inserted run defaults to the signed-in user');
select lives_ok(
  $$ insert into public.job_runs (job_id) select null::uuid from generate_series(1, 29) $$,
  'an older run does not prevent thirty recent runs');
select is(
  (select count(*)::int from public.job_runs where created_at > now() - interval '24 hours'),
  30, 'the user has thirty runs in the last twenty-four hours');
select throws_ok(
  $$ insert into public.jobs (source, url, url_normalized)
     values ('link', 'https://example.test/over-limit', 'https://example.test/over-limit') $$,
  'P0001', 'job_limit', 'a new job is rejected at the daily run limit');
select is((select count(*)::int from public.jobs), 0, 'the rejected job insert leaves the job count unchanged');
select is((select count(*)::int from public.job_runs), 31, 'the rejected job adds no run');
select throws_ok(
  $$ insert into public.job_runs (job_id) values (null) $$,
  'P0001', 'job_limit', 'a direct run insert also obeys the daily limit');

set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select lives_ok(
  $$ insert into public.jobs (source, url, url_normalized)
     values ('link', 'https://example.test/jobs/1', 'https://example.test/jobs/1') $$,
  'another user can create a job when A has reached the limit');

select * from finish();
rollback;
