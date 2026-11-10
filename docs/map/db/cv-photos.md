---
id: db/cv-photos
area: db
files: ["supabase/migrations/20261108030000_cv_photos.sql", "supabase/tests/database/cv-photos.test.sql"]
depends_on: ["shared/cv"]
contract: true
checked_hash: f206680e
decisions: ["docs/decisions/0008-every-database-change-is-a-new-migration.md"]
open: []
---
Keep CV photos in a private bucket with owner-folder access.

- The bucket is private and caps files at 2097152 bytes with JPEG/PNG/WebP MIME types only. `supabase/migrations/20261108030000_cv_photos.sql:3` -> `cv-photos`
- The current original read policy permits authenticated SELECT only when bucket_id is cv-photos and the first folder matches auth.uid as text. `supabase/migrations/20261108030000_cv_photos.sql:5` -> `own cv photos: read`
- The current original upload policy uses the same folder/bucket rule for INSERT. `supabase/migrations/20261108030000_cv_photos.sql:9` -> `own cv photos: upload`
- The current original update policy checks both the old and new object folder/bucket, preventing an owner from moving a photo into another user's folder. `supabase/migrations/20261108030000_cv_photos.sql:13` -> `own cv photos: update`
- The current original delete policy permits authenticated owner-folder DELETE. `supabase/migrations/20261108030000_cv_photos.sql:18` -> `own cv photos: delete`
- These policies use path-folder ownership rather than an application photo table or CV foreign key. `supabase/migrations/20261108030000_cv_photos.sql:7` -> `storage.foldername(name)`
- tested by `supabase/tests/database/cv-photos.test.sql:46` -> `throws_ok`

## Connections

- Used directly by browser upload: `apps/web/src/cv/panel/PhotoField.tsx:58` -> `storage.from("cv-photos").upload` -> `supabase/migrations/20261108030000_cv_photos.sql:9` -> `own cv photos: upload`, `supabase/migrations/20261108030000_cv_photos.sql:3` -> `2097152`.
- Used by one-hour signed URL creation in the editor and document display: `apps/web/src/cv/panel/PhotoField.tsx:35` -> `createSignedUrl`, `apps/web/src/cv/page/CvDocument.tsx:43` -> `createSignedUrl` -> `supabase/migrations/20261108030000_cv_photos.sql:5` -> `own cv photos: read`.

## Assumptions

- Access relies on Supabase Storage's authenticated role and auth.uid; the object path itself is not proof of permission without this policy evaluation. `supabase/migrations/20261108030000_cv_photos.sql:6` -> `to authenticated`, `supabase/migrations/20261108030000_cv_photos.sql:7` -> `auth.uid()`
