-- E6 Task 9: tailoring answers about a project are saved on that project.
-- Run with `npm run db:test` (local stack must be running).
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111', 'a@example.test');
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
insert into public.base_cvs (user_id, content, version, updated_at) values (auth.uid(),
  '{"experience":[{"id":"role-1","notes":[]}],"projects":[{"id":"project-1","notes":[]}],"volunteering":[{"id":"volunteer-1","notes":[]}]}', 1, '2000-01-01Z');

select results_eq(
  $$ select version from public.add_job_notes('project-1',
    '[{"id":"project-note","jobId":"aaaaaaaa-0000-4000-8000-000000000001","question":"Q","answer":"A","via":["type"],"askedAt":"2026-02-01T00:00:00Z"}]') $$,
  $$ values (2) $$, 'a project accepts job answers and bumps the version');
select is((select content #>> '{projects,0,notes,0,id}' from public.base_cvs), 'project-note', 'the project answer is saved on the project');
select is((select content #> '{experience,0,notes}' from public.base_cvs), '[]'::jsonb, 'roles are unchanged');
select results_eq(
  $$ select version from public.add_job_notes('volunteer-1',
    '[{"id":"volunteer-note","jobId":"aaaaaaaa-0000-4000-8000-000000000001","question":"Q","answer":"A","via":["type"],"askedAt":"2026-02-01T00:00:00Z"}]') $$,
  $$ values (3) $$, 'volunteering still accepts job answers');

select * from finish();
rollback;
