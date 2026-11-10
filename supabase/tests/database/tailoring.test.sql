-- Tailoring: ownership, document constraints, deletion and AI task logging.
-- Run with `npm run db:test` (local stack must be running).
begin;
create extension if not exists pgtap with schema extensions;
select plan(76);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.test');

set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

insert into public.jobs (id, source, url, url_normalized) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'link', 'https://example.test/1', 'https://example.test/1');
select is((select application_status from public.jobs), 'saved', 'a new job defaults to saved');
select throws_ok(
  $$ update public.jobs set application_status = 'hired' $$,
  '23514', null, 'hired is not an application status');
select lives_ok(
  $$ update public.jobs set application_status = 'applied' $$,
  'a job can be marked applied');
select is((select application_status from public.jobs), 'applied', 'the application status is saved');
select hasnt_column('public', 'jobs', 'user_thoughts', 'jobs no longer stores job thoughts');

select lives_ok(
  $$ insert into public.tailored_cvs (id, job_id, language, content, base_snapshot, base_snapshot_at)
     values ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
             'en', '{}', '{}', now()) $$,
  'a user can create their own tailored CV');
select results_eq(
  $$ select user_id, template, version from public.tailored_cvs $$,
  $$ values ('11111111-1111-1111-1111-111111111111'::uuid, 'classic'::text, 1) $$,
  'a tailored CV defaults to its creator, classic template and version one');
select throws_ok(
  $$ insert into public.tailored_cvs (job_id, language, content, base_snapshot, base_snapshot_at)
     values ('aaaaaaaa-0000-0000-0000-000000000001', 'en', '{}', '{}', now()) $$,
  '23505', null, 'a job cannot have two tailored CVs in the same language');
select lives_ok(
  $$ insert into public.tailored_cvs (id, job_id, language, translated_from, content, base_snapshot, base_snapshot_at)
     values ('bbbbbbbb-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001',
             'ro', 'bbbbbbbb-0000-0000-0000-000000000001', '{}', '{}', now()) $$,
  'a job can have a translated CV in another language');
select throws_ok(
  $$ update public.tailored_cvs set language = 'nl' $$,
  '23514', null, 'an unsupported CV language is rejected');
select throws_ok(
  $$ update public.tailored_cvs set template = 'unknown' $$,
  '23514', null, 'an unsupported template is rejected');

select lives_ok(
  $$ insert into public.tailor_runs (job_id, tailored_cv_id, kind, sections, status)
     values ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001',
             'tailor', array['experience'], 'running') $$,
  'a user can create their own tailoring run');
select is((select user_id::text from public.tailor_runs), '11111111-1111-1111-1111-111111111111',
  'a tailoring run defaults to its creator');
select throws_ok(
  $$ update public.tailor_runs set status = 'queued' $$,
  '23514', null, 'an unsupported run status is rejected');
select throws_ok(
  $$ update public.tailor_runs set kind = 'unknown' $$,
  '23514', null, 'an unsupported run kind is rejected');
select lives_ok(
  $$ insert into public.match_scores (job_id, target, policy, labels, parts, total, band)
     values ('aaaaaaaa-0000-0000-0000-000000000001', 'base', 'match/1', '[]', '{}', 60, 'Fair') $$,
  'a user can store their own match score');
select is((select user_id::text from public.match_scores), '11111111-1111-1111-1111-111111111111',
  'a match score defaults to its creator');
select throws_ok(
  $$ update public.match_scores set target = 'unknown' $$,
  '23514', null, 'an unsupported score target is rejected');

-- User B cannot read, update, delete or create rows belonging to A.
set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select is_empty($$ select * from public.tailored_cvs $$, 'another user sees no tailored CVs');
select is_empty($$ update public.tailored_cvs set tone = 'changed' returning id $$,
  'another user cannot update tailored CVs');
select is_empty($$ delete from public.tailored_cvs returning id $$,
  'another user cannot delete tailored CVs');
select is_empty($$ select * from public.tailor_runs $$, 'another user sees no tailoring runs');
select is_empty($$ update public.tailor_runs set status = 'failed' returning id $$,
  'another user cannot update tailoring runs');
select is_empty($$ delete from public.tailor_runs returning id $$,
  'another user cannot delete tailoring runs');
select is_empty($$ select * from public.match_scores $$, 'another user sees no match scores');
select is_empty($$ update public.match_scores set total = 0 returning id $$,
  'another user cannot update match scores');
select is_empty($$ delete from public.match_scores returning id $$,
  'another user cannot delete match scores');
select throws_ok(
  $$ insert into public.tailored_cvs (user_id, job_id, language, content, base_snapshot, base_snapshot_at)
     values ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001',
             'fr', '{}', '{}', now()) $$,
  '42501', null, 'a user cannot create another user''s tailored CV');
select throws_ok(
  $$ insert into public.tailor_runs (user_id, job_id, kind, sections, status)
     values ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001',
             'tailor', array['experience'], 'running') $$,
  '42501', null, 'a user cannot create another user''s tailoring run');
select throws_ok(
  $$ insert into public.match_scores (user_id, job_id, target, policy, labels, parts)
     values ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001',
             'base', 'match/1', '[]', '{}') $$,
  '42501', null, 'a user cannot create another user''s score');

-- A row's owner must also own its job and any linked run document.
select throws_ok(
  $$ insert into public.tailored_cvs (job_id, language, content, base_snapshot, base_snapshot_at)
     values ('aaaaaaaa-0000-0000-0000-000000000001', 'fr', '{}', '{}', now()) $$,
  '42501', null, 'a user cannot create a tailored CV for another user''s job');
select throws_ok(
  $$ insert into public.tailor_runs (job_id, kind, sections, status)
     values ('aaaaaaaa-0000-0000-0000-000000000001', 'tailor', array['experience'], 'running') $$,
  '42501', null, 'a user cannot create a run for another user''s job');
select throws_ok(
  $$ insert into public.match_scores (job_id, target, policy, labels, parts)
     values ('aaaaaaaa-0000-0000-0000-000000000001', 'base', 'match/1', '[]', '{}') $$,
  '42501', null, 'a user cannot create a score for another user''s job');

insert into public.jobs (id, source, url, url_normalized) values
  ('aaaaaaaa-0000-0000-0000-000000000002', 'link', 'https://example.test/2', 'https://example.test/2');
insert into public.tailored_cvs (job_id, language, content, base_snapshot, base_snapshot_at) values
  ('aaaaaaaa-0000-0000-0000-000000000002', 'de', '{}', '{}', now());
insert into public.tailor_runs (job_id, kind, sections, status) values
  ('aaaaaaaa-0000-0000-0000-000000000002', 'tailor', array['experience'], 'running');
insert into public.match_scores (job_id, target, policy, labels, parts) values
  ('aaaaaaaa-0000-0000-0000-000000000002', 'base', 'match/1', '[]', '{}');
select throws_ok(
  $$ insert into public.tailor_runs (job_id, tailored_cv_id, kind, sections, status)
     values ('aaaaaaaa-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000001',
             'tailor', array['experience'], 'running') $$,
  '42501', null, 'a user cannot create a run referencing another user''s tailored CV');
select throws_ok(
  $$ update public.tailor_runs set tailored_cv_id = 'bbbbbbbb-0000-0000-0000-000000000001'
     where job_id = 'aaaaaaaa-0000-0000-0000-000000000002' $$,
  '42501', null, 'a user cannot update a run to reference another user''s tailored CV');
select throws_ok(
  $$ update public.tailored_cvs set job_id = 'aaaaaaaa-0000-0000-0000-000000000001'
     where job_id = 'aaaaaaaa-0000-0000-0000-000000000002' $$,
  '42501', null, 'a user cannot move their tailored CV to another user''s job');
select throws_ok(
  $$ update public.tailor_runs set job_id = 'aaaaaaaa-0000-0000-0000-000000000001'
     where job_id = 'aaaaaaaa-0000-0000-0000-000000000002' $$,
  '42501', null, 'a user cannot move their run to another user''s job');
select throws_ok(
  $$ update public.match_scores set job_id = 'aaaaaaaa-0000-0000-0000-000000000001'
     where job_id = 'aaaaaaaa-0000-0000-0000-000000000002' $$,
  '42501', null, 'a user cannot move their score to another user''s job');
delete from public.jobs where id = 'aaaaaaaa-0000-0000-0000-000000000002';
-- Owners can update rows but cannot transfer them to another user.
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select isnt_empty(
  $$ update public.tailored_cvs set template = 'modern', updated_at = now() returning id $$,
  'a user can update their own tailored CVs');
select isnt_empty(
  $$ update public.tailor_runs set status = 'waiting_user', updated_at = now() returning id $$,
  'a user can update their own tailoring runs');
select isnt_empty(
  $$ update public.match_scores set total = 70 returning id $$,
  'a user can update their own match scores');
select throws_ok(
  $$ update public.tailored_cvs set user_id = '22222222-2222-2222-2222-222222222222' $$,
  '42501', null, 'a user cannot transfer their tailored CVs');
select throws_ok(
  $$ update public.tailor_runs set user_id = '22222222-2222-2222-2222-222222222222' $$,
  '42501', null, 'a user cannot transfer their tailoring runs');
select throws_ok(
  $$ update public.match_scores set user_id = '22222222-2222-2222-2222-222222222222' $$,
  '42501', null, 'a user cannot transfer their scores');

select lives_ok(
  $$ select public.log_ai_call(task, 'p', 'm', 'ok', null, 1, 1, 1)
     from unnest(array['tailor_score', 'tailor_questions', 'tailor_section',
                       'tailor_verify', 'tailor_translate', 'tailor_letter']) as task $$,
  'all six tailoring AI tasks can be logged');
select throws_ok(
  $$ select public.log_ai_call('tailor_nope', 'p', 'm', 'ok', null, 1, 1, 1) $$,
  '22023', 'unknown ai task', 'unknown tailoring AI tasks are rejected');

-- Removing an original keeps the translation and removes its runs.
select isnt_empty(
  $$ delete from public.tailored_cvs where id = 'bbbbbbbb-0000-0000-0000-000000000001' returning id $$,
  'a user can delete their own tailored CV');
select results_eq(
  $$ select language, translated_from from public.tailored_cvs $$,
  $$ values ('ro'::text, null::uuid) $$,
  'deleting the original keeps its translation with no source');
select is_empty($$ select * from public.tailor_runs $$, 'deleting a tailored CV deletes its runs');

-- Keep a run linked to a CV and a job-only run to test both deletion paths.
insert into public.tailor_runs (job_id, tailored_cv_id, kind, sections, status) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002',
   'translate', array['summary'], 'done'),
  ('aaaaaaaa-0000-0000-0000-000000000001', null, 'section', array['skills'], 'running');
insert into public.match_scores (job_id, target, tailored_cv_id, policy, labels, parts) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'tailored', 'bbbbbbbb-0000-0000-0000-000000000002',
   'match/1', '[]', '{}');
select isnt_empty(
  $$ delete from public.jobs where id = 'aaaaaaaa-0000-0000-0000-000000000001' returning id $$,
  'a user can delete the job');
select is_empty($$ select * from public.tailored_cvs $$, 'deleting a job deletes its tailored CVs');
select is_empty($$ select * from public.tailor_runs $$, 'deleting a job deletes all its tailoring runs');
select is_empty($$ select * from public.match_scores $$, 'deleting a job deletes its base and tailored scores');

-- Job answers update only the caller's CV, with no history snapshot.
select throws_ok($$ select public.add_job_notes('role-1', '[]') $$,
  'P0002', 'role_not_found', 'a missing CV reports role_not_found');
set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
insert into public.base_cvs (user_id, content, version, updated_at) values
  (auth.uid(), '{"experience":[{"id":"role-1","notes":[]}]}', 1, '2000-01-01Z');
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
insert into public.base_cvs (user_id, content, version, updated_at)
select auth.uid(), jsonb_build_object('experience', jsonb_build_array(
  jsonb_build_object('id', 'role-1', 'title', 'Engineer', 'notes',
    '[{"id":"enrichment","question":"Q","answer":"Keep me","via":["type"],"askedAt":"2025-01-01T00:00:00Z"}]'::jsonb ||
    jsonb_agg(jsonb_build_object('id', 'job-' || i, 'jobId', 'aaaaaaaa-0000-4000-8000-000000000001',
      'question', 'Q', 'answer', 'Answer ' || i, 'via', jsonb_build_array('type'),
      'askedAt', '2026-01-' || lpad(i::text, 2, '0') || 'T00:00:00Z') order by i desc)),
  jsonb_build_object('id', 'role-2', 'notes', '[]'::jsonb)),
  'volunteering', '[{"id":"volunteer-1","notes":[]}]'::jsonb), 7, '2000-01-01Z'
from generate_series(1, 25) as i;
select results_eq(
  $$ select * from public.add_job_notes('role-1',
    '[{"id":"job-26","jobId":"aaaaaaaa-0000-4000-8000-000000000001","question":"Q","answer":"New answer","via":["voice"],"askedAt":"2026-02-01T00:00:00Z"}]') $$,
  $$ values (8, now()) $$, 'adding job answers returns version +1 and the new timestamp');
select results_eq($$ select version, updated_at from public.base_cvs $$,
  $$ values (8, now()) $$, 'the returned version and timestamp are saved');
select is((select count(*)::int from public.base_cvs,
  jsonb_array_elements(content #> '{experience,0,notes}') as note where note ? 'jobId'),
  25, 'only 25 job answers remain');
select is_empty($$ select note from public.base_cvs,
  jsonb_array_elements(content #> '{experience,0,notes}') as note where note ->> 'id' = 'job-1' $$,
  'the oldest job answer is removed even when stored last');
select is((select content #> '{experience,0,notes,0}' from public.base_cvs),
  '{"id":"enrichment","question":"Q","answer":"Keep me","via":["type"],"askedAt":"2025-01-01T00:00:00Z"}'::jsonb,
  'older enrichment notes are preserved');
select is((select content #> '{experience,0,notes,25}' from public.base_cvs),
  '{"id":"job-26","jobId":"aaaaaaaa-0000-4000-8000-000000000001","question":"Q","answer":"New answer","via":["voice"],"askedAt":"2026-02-01T00:00:00Z"}'::jsonb,
  'the new answer is appended unchanged');
select is((select content #- '{experience,0,notes}' from public.base_cvs),
  '{"experience":[{"id":"role-1","title":"Engineer"},{"id":"role-2","notes":[]}],"volunteering":[{"id":"volunteer-1","notes":[]}]}'::jsonb,
  'role text and other roles are unchanged');
select is_empty($$ select * from public.base_cv_versions $$, 'job answers create no history snapshot');
select throws_ok($$ select public.add_job_notes('missing-role', '[]') $$,
  'P0002', 'role_not_found', 'a missing role reports role_not_found');
select is((select version from public.base_cvs), 8, 'a missing role does not bump the version');
select results_eq(
  $$ select version from public.add_job_notes('volunteer-1',
    '[{"id":"volunteer-note","jobId":"aaaaaaaa-0000-4000-8000-000000000001","question":"Q","answer":"A","via":["type"],"askedAt":"2026-02-01T00:00:00Z"}]') $$,
  $$ values (9) $$, 'volunteering roles accept job answers and bump the version');
select is((select content #>> '{volunteering,0,notes,0,id}' from public.base_cvs),
  'volunteer-note', 'the volunteering answer is saved');
set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select results_eq($$ select content, version, updated_at from public.base_cvs $$,
  $$ values ('{"experience":[{"id":"role-1","notes":[]}]}'::jsonb, 1, '2000-01-01Z'::timestamptz) $$,
  'another user with the same role id has unchanged content, version and timestamp');
select throws_ok($$ select public.add_job_notes('role-2', '[]') $$,
  'P0002', 'role_not_found', 'another user cannot add answers to the caller''s other role');
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select results_eq($$ select version, content #> '{experience,1,notes}' from public.base_cvs $$,
  $$ values (9, '[]'::jsonb) $$, 'another user cannot change the original CV');

-- Refuse valid notes when their UTF-8 bytes would make the next autosave too large.
update public.base_cvs set content = jsonb_build_object(
  'experience', '[{"id":"role-1","notes":[]}]'::jsonb,
  'projects', (select jsonb_agg(jsonb_build_object(
    'id', 'project-' || i, 'name', '', 'description', repeat(chr(233), 4000), 'url', ''))
    from generate_series(1, 32) as i));
select ok((select octet_length(jsonb_build_object('content', content, 'version', version)::text) <= 262144
  from public.base_cvs), 'the CV fits before adding notes');
create temporary table cv_before_notes as select content, version, updated_at from public.base_cvs;
select throws_ok(
  $$ select public.add_job_notes('role-1', (select jsonb_agg(jsonb_build_object(
    'id', 'large-note-' || i, 'jobId', 'aaaaaaaa-0000-4000-8000-000000000001',
    'question', 'Q', 'answer', repeat(chr(233), 2000), 'via', jsonb_build_array('type'),
    'askedAt', '2026-02-01T00:00:00Z')) from generate_series(1, 2) as i)) $$,
  '54000', 'content_too_large', 'notes exceeding the CV byte limit are rejected');
select results_eq($$ select content, version, updated_at from public.base_cvs $$,
  $$ select content, version, updated_at from cv_before_notes $$,
  'oversized notes leave content, version and timestamp unchanged');

set local role anon;
set local request.jwt.claims to '{"role":"anon"}';
select throws_ok($$ select * from public.tailored_cvs $$, '42501', null,
  'a signed-out visitor cannot read tailored CVs');
select throws_ok($$ select * from public.tailor_runs $$, '42501', null,
  'a signed-out visitor cannot read tailoring runs');
select throws_ok($$ select * from public.match_scores $$, '42501', null,
  'a signed-out visitor cannot read scores');

select throws_ok($$ select public.add_job_notes('role-1', '[]') $$, '42501', null,
  'a signed-out visitor cannot add job answers');

select * from finish();
rollback;
