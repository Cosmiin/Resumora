-- App errors: each user records and reads only their own rows.
-- Run with `npm run db:test` (local stack must be running).
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.test');

set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select lives_ok(
  $$ insert into public.app_errors (kind, step, role_id, status, code) values ('step', 'check-changes', 'r1', 409, 'not_saved') $$,
  'a user can record an error');
select results_eq(
  $$ select user_id::text, kind from public.app_errors $$,
  $$ values ('11111111-1111-1111-1111-111111111111', 'step') $$,
  'the row belongs to its creator');
select throws_ok(
  $$ insert into public.app_errors (kind) values ('other') $$,
  '23514', null, 'an unknown kind is rejected');
select throws_ok(
  $$ insert into public.app_errors (user_id, kind) values ('22222222-2222-2222-2222-222222222222', 'message') $$,
  '42501', null, 'a user cannot record an error for someone else');

set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select is((select count(*)::int from public.app_errors), 0, 'another user cannot read the row');

set local role anon;
select throws_ok($$ select 1 from public.app_errors $$, '42501', null, 'signed-out visitors cannot read errors');

select * from finish();
