-- Application status: five values, and what the migration does to a job that was marked tailored.
-- Run with `npm run db:test` (local stack must be running).
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111', 'a@example.test');
insert into public.jobs (id, user_id, source, url, url_normalized, version, updated_at) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'link',
   'https://example.test/1', 'https://example.test/1', 4, '2026-11-01T10:00:00Z');

-- Back to the state before the migration: the old check, and this job marked tailored.
alter table public.jobs drop constraint jobs_application_status_check;
update public.jobs set application_status = 'tailored' where id = 'aaaaaaaa-0000-0000-0000-000000000001';

-- The migration's statements (20261112000000_application_status.sql); the old check is already dropped above.
update public.jobs set application_status = 'saved' where application_status = 'tailored';
alter table public.jobs
  add constraint jobs_application_status_check
    check (application_status in ('saved', 'applied', 'interview', 'offer', 'rejected'));

prepare the_job as select application_status, version, updated_at from public.jobs
  where id = 'aaaaaaaa-0000-0000-0000-000000000001';
select results_eq('the_job', $$ values ('saved', 4, '2026-11-01T10:00:00Z'::timestamptz) $$,
  'a job that was tailored is now saved, with its version and updated_at untouched');
select is((select count(*) from public.jobs where application_status = 'tailored'), 0::bigint, 'no job is left tailored');

select throws_ok(
  $$ update public.jobs set application_status = 'tailored' where id = 'aaaaaaaa-0000-0000-0000-000000000001' $$,
  '23514', null, 'tailored is no longer an application status');
select throws_ok(
  $$ insert into public.jobs (user_id, source, url, url_normalized, application_status)
     values ('11111111-1111-1111-1111-111111111111', 'link', 'https://example.test/2', 'https://example.test/2', 'tailored') $$,
  '23514', null, 'a new job cannot be tailored either');
select lives_ok($$ update public.jobs set application_status = 'applied' where id = 'aaaaaaaa-0000-0000-0000-000000000001' $$, 'applied is a status');
select lives_ok($$ update public.jobs set application_status = 'interview' where id = 'aaaaaaaa-0000-0000-0000-000000000001' $$, 'interview is a status');
select lives_ok($$ update public.jobs set application_status = 'offer' where id = 'aaaaaaaa-0000-0000-0000-000000000001' $$, 'offer is a status');
select lives_ok($$ update public.jobs set application_status = 'rejected' where id = 'aaaaaaaa-0000-0000-0000-000000000001' $$, 'rejected is a status');
select lives_ok($$ update public.jobs set application_status = 'saved' where id = 'aaaaaaaa-0000-0000-0000-000000000001' $$, 'saved is a status');

select * from finish();
rollback;
