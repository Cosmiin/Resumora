-- CV photos: private bucket and access limited to the user's folder.
begin;
create extension if not exists pgtap with schema extensions;
select plan(15);
-- Supabase Storage guards direct SQL deletion; this transaction tests its RLS policies.
set local storage.allow_delete_query = 'true';

select is((select public from storage.buckets where id = 'cv-photos'), false, 'the photo bucket is private');
select is((select file_size_limit from storage.buckets where id = 'cv-photos'), 2097152::bigint, 'photos are limited to 2 MB');
select is((select allowed_mime_types from storage.buckets where id = 'cv-photos'),
  array['image/jpeg', 'image/png', 'image/webp'], 'only JPEG, PNG and WebP are allowed');

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.test');

set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select lives_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values ('cv-photos', '11111111-1111-1111-1111-111111111111/photo.jpg', '11111111-1111-1111-1111-111111111111') $$,
  'A can upload a photo into A''s folder');
select is((select count(*)::int from storage.objects where bucket_id = 'cv-photos'), 1, 'A can read A''s photo');

set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select is((select count(*)::int from storage.objects where bucket_id = 'cv-photos'), 0, 'B cannot read A''s photo');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values ('cv-photos', '11111111-1111-1111-1111-111111111111/b.png', '22222222-2222-2222-2222-222222222222') $$,
  '42501', null, 'B cannot upload into A''s folder');
select is_empty(
  $$ update storage.objects set metadata = '{}' where bucket_id = 'cv-photos' returning name $$,
  'B cannot update A''s photo');
select is_empty(
  $$ delete from storage.objects where bucket_id = 'cv-photos' returning name $$,
  'B cannot delete A''s photo');

set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select results_eq(
  $$ update storage.objects set metadata = '{"size":123}' where bucket_id = 'cv-photos' returning name $$,
  $$ values ('11111111-1111-1111-1111-111111111111/photo.jpg'::text) $$,
  'A can update A''s photo');
select throws_ok(
  $$ update storage.objects set name = '22222222-2222-2222-2222-222222222222/photo.jpg' where bucket_id = 'cv-photos' $$,
  '42501', null, 'A cannot move a photo into B''s folder');

set local role anon;
set local request.jwt.claims to '{"role":"anon"}';
select is((select count(*)::int from storage.objects where bucket_id = 'cv-photos'), 0, 'anonymous users cannot read photos');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('cv-photos', '11111111-1111-1111-1111-111111111111/anon.jpg') $$,
  '42501', null, 'anonymous users cannot upload photos');

set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select results_eq(
  $$ delete from storage.objects where bucket_id = 'cv-photos' returning name $$,
  $$ values ('11111111-1111-1111-1111-111111111111/photo.jpg'::text) $$,
  'A can delete A''s photo');
select is((select count(*)::int from storage.objects where bucket_id = 'cv-photos'), 0, 'the photo was removed');

select * from finish();
rollback;
