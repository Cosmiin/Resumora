-- A deleted account's leftover token cannot reach files any more.
-- Run with `npm run db:test` (local stack must be running).
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111', 'a@example.test');

set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select is(public.account_exists(), true, 'an existing account is recognised');
select lives_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values ('cv-photos', '11111111-1111-1111-1111-111111111111/photo.jpg', '11111111-1111-1111-1111-111111111111') $$,
  'an existing account can still upload into its own folder');
select is((select count(*)::int from storage.objects where bucket_id = 'cv-photos'), 1, 'and read its own file');

-- The account is deleted; the same token is used again.
reset role;
delete from auth.users where id = '11111111-1111-1111-1111-111111111111';
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select is(public.account_exists(), false, 'a deleted account is recognised as gone');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values ('cv-imports', '11111111-1111-1111-1111-111111111111/late.pdf', '11111111-1111-1111-1111-111111111111') $$,
  '42501', null, 'the leftover token cannot upload a file');
select is((select count(*)::int from storage.objects), 0, 'and cannot read any file');

select * from finish();
rollback;
