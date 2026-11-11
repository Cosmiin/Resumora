-- Account preferences: one private row per user, removed with the account.
-- Run with `npm run db:test` (local stack must be running).
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.test');

set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select lives_ok(
  $$ insert into public.user_preferences (display_name) values ('Ana Popescu') $$,
  'a user can create their preferences');
select results_eq(
  $$ select user_id::text, default_template, tailoring_language from public.user_preferences $$,
  $$ values ('11111111-1111-1111-1111-111111111111', 'classic', 'job') $$,
  'the row belongs to its creator and starts with the defaults');
select throws_ok(
  $$ insert into public.user_preferences (display_name) values ('Again') $$,
  '23505', null, 'a user has one row only');
select throws_ok(
  $$ insert into public.user_preferences (user_id) values ('22222222-2222-2222-2222-222222222222') $$,
  '42501', null, 'a user cannot create a row for someone else');
select throws_ok(
  $$ update public.user_preferences set default_template = 'fancy' $$,
  '23514', null, 'an unknown template is rejected');
select throws_ok(
  $$ update public.user_preferences set tailoring_language = 'xx' $$,
  '23514', null, 'an unknown tailoring language is rejected');
select throws_ok(
  $$ update public.user_preferences set display_name = repeat('a', 121) $$,
  '23514', null, 'a name over 120 characters is rejected');
select lives_ok(
  $$ update public.user_preferences set default_template = 'modern', tailoring_language = 'ro' $$,
  'a user can update their own preferences');
select throws_ok(
  $$ delete from public.user_preferences $$,
  '42501', null, 'a user cannot delete the row directly');

-- User B sees and changes nothing of user A's.
set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select is((select count(*)::int from public.user_preferences), 0, 'another user cannot read the row');
select is_empty(
  $$ update public.user_preferences set display_name = 'Hacked' returning 1 $$,
  'another user cannot update the row');

-- Signed-out visitors have no access at all.
set local role anon;
select throws_ok($$ select 1 from public.user_preferences $$, '42501', null, 'signed-out visitors cannot read preferences');

-- Deleting the login removes the row.
reset role;
delete from auth.users where id = '11111111-1111-1111-1111-111111111111';
select is((select count(*)::int from public.user_preferences where user_id = '11111111-1111-1111-1111-111111111111'), 0,
  'the row is removed with the account');

select * from finish();
rollback;
