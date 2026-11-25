-- Enrich failures: each user records and reads only their own rows.
-- Run with `npm run db:test` (local stack must be running).
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.test');

set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select lives_ok(
  $$ insert into public.enrich_failures (step, role_id, status, code) values ('check-changes', 'r1', 409, 'not_saved') $$,
  'a user can record a failure');
select results_eq(
  $$ select user_id::text, step from public.enrich_failures $$,
  $$ values ('11111111-1111-1111-1111-111111111111', 'check-changes') $$,
  'the row belongs to its creator');
select throws_ok(
  $$ insert into public.enrich_failures (user_id, step) values ('22222222-2222-2222-2222-222222222222', 'x') $$,
  '42501', null, 'a user cannot record a failure for someone else');

set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select is((select count(*)::int from public.enrich_failures), 0, 'another user cannot read the row');

set local role anon;
select throws_ok($$ select 1 from public.enrich_failures $$, '42501', null, 'signed-out visitors cannot read failures');

select * from finish();
