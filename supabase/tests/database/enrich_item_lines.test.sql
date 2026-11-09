-- Round 2 · other sections (E6): enrich_item_lines is logged, and every earlier task name still is.
-- Run with `npm run db:test` (local stack must be running).
begin;
create extension if not exists pgtap with schema extensions;
select plan(3);

insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111', 'a@example.test');
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select lives_ok(
  $$ select public.log_ai_call('enrich_item_lines', 'p', 'm', 'ok', null, 1, 1, 1) $$,
  'item lines calls can be logged');
select lives_ok(
  $$ do $d$
     declare t text;
     begin
       foreach t in array array[
         'cv_admit', 'cv_extract',
         'enrich_score', 'enrich_rewrite_role', 'enrich_rewrite_summary', 'enrich_skills', 'enrich_voice',
         'enrich_improve_bullet', 'enrich_brain_dump', 'enrich_role_facts',
         'enrich_role_description', 'enrich_achievements',
         'job_extract',
         'tailor_score', 'tailor_questions', 'tailor_section', 'tailor_verify', 'tailor_translate', 'tailor_letter',
         'tailor_tone_examples'
       ] loop
         perform public.log_ai_call(t, 'p', 'm', 'ok', null, 1, 1, 1);
       end loop;
     end $d$ $$,
  'every earlier task name is still accepted');
select throws_ok(
  $$ select public.log_ai_call('enrich_made_up', 'p', 'm', 'ok', null, 1, 1, 1) $$,
  '22023', 'unknown ai task', 'an unknown task is still refused');

select * from finish();
rollback;
