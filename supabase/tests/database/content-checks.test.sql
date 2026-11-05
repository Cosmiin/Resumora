-- Content stored directly (bypassing the API) must still be a JSON object of sane size.
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

insert into auth.users (id, email) values ('55555555-5555-5555-5555-555555555555', 'c@example.test');
set local role authenticated;
set local request.jwt.claims to '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated"}';

select throws_ok(
  $$ insert into public.base_cvs (user_id, content, version)
     values ('55555555-5555-5555-5555-555555555555', '[1,2,3]', 1) $$,
  '23514', null, 'a CV must be a JSON object');

select throws_ok(
  $$ insert into public.base_cvs (user_id, content, version)
     values ('55555555-5555-5555-5555-555555555555',
             jsonb_build_object('big', repeat('x', 600000)), 1) $$,
  '23514', null, 'a CV over 512 KB is rejected');

select throws_ok(
  $$ insert into public.base_cv_versions (user_id, content, reason)
     values ('55555555-5555-5555-5555-555555555555', '"text"', 'autosave') $$,
  '23514', null, 'a snapshot must be a JSON object');

select lives_ok(
  $$ select public.save_base_cv('{"basics":{}}', 0) $$,
  'normal content still saves');

select * from finish();
rollback;
