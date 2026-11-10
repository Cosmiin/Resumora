---
id: web-editor/photos
area: web-editor
files: ["apps/web/src/cv/panel/PhotoField.tsx","apps/web/src/cv/panel/shrink-photo.ts","apps/web/src/cv/panel/photo.test.tsx","apps/web/src/cv/panel/shrink-photo.test.ts"]
depends_on: ["shared/cv","db/cv-photos"]
contract: false
checked_hash: f4695c3b
cited: [b3f29f, c1e26b, c19e21, 21aa2e, 390fa8, 28516c, 9549d9, 6d8667, f1d557, 7b1305, 715da3, d4cdbb, 8d424e, a16ef3, 77862f, 63a631, 9e09e4, e7c83b, 8b29ae, 197d9f, 487da3, fcad91, b66504, 043445, 7a31e2, 1f129b, 0a2da0, 39315a, 3ad09c, 7285f5, 7b42c1, c19e21, ba7006, 715da3, d20b83, ce7e77, f05071, 29d1ba, 9545c6, 95b765, 494be2, a16ef3, db9a3c, 2558d4, e7c83b, a0d8c1, 390fa8, 0200ae, 7b42c1, bb40f3, 7140f6, b66504, f1d557, c00e14]
decisions: ["docs/decisions/0011-edit-the-cv-on-the-page.md"]
open: []
---
Upload private CV photos, shrink oversized files locally and persist crop settings.

- JPEG, PNG and WebP are accepted; unsupported types or a missing user ID fail before upload. `apps/web/src/cv/panel/PhotoField.tsx:10` -> `extensions`; `apps/web/src/cv/panel/PhotoField.tsx:43` -> `extensions.get`
- Files over 2 MiB are shrunk to JPEG locally; failure to shrink reports an error without uploading the original. `apps/web/src/cv/panel/PhotoField.tsx:12` -> `MAX_PHOTO_BYTES`; `apps/web/src/cv/panel/PhotoField.tsx:52` -> `file.size`
- Uploads use userId/randomUUID.extension paths; the CV callback stores only path and centered default crop after success. `apps/web/src/cv/panel/PhotoField.tsx:57` -> `crypto.randomUUID`; `apps/web/src/cv/panel/PhotoField.tsx:61` -> `onChange`
- A completed upload changes the CV only if the component is still mounted and its current path matches the upload's starting path. `apps/web/src/cv/panel/PhotoField.tsx:28` -> `currentPhoto.current`; `apps/web/src/cv/panel/PhotoField.tsx:46` -> `startingPath`; `apps/web/src/cv/panel/PhotoField.tsx:60` -> `currentPhoto.current.path`
- Preview URLs last one hour and are associated with the current path; inactive effects cannot replace the preview, and signing/image errors clear it. `apps/web/src/cv/panel/PhotoField.tsx:24` -> `preview?.path`; `apps/web/src/cv/panel/PhotoField.tsx:35` -> `createSignedUrl`; `apps/web/src/cv/panel/PhotoField.tsx:117` -> `onError`
- Remove clears the CV photo reference without deleting storage objects. `apps/web/src/cv/panel/PhotoField.tsx:70` -> `function remove`
- Pointer movement adjusts crop percentages opposite the drag and clamps them to 0..100; arrows move five percentage points. `apps/web/src/cv/panel/PhotoField.tsx:13` -> `percent`; `apps/web/src/cv/panel/PhotoField.tsx:75` -> `function move`; `apps/web/src/cv/panel/PhotoField.tsx:108` -> `onKeyDown`
- Zoom input ranges from 1 to 3 in 0.1 increments, and image transforms use the stored crop origin. `apps/web/src/cv/panel/PhotoField.tsx:118` -> `objectPosition`; `apps/web/src/cv/panel/PhotoField.tsx:124` -> `type="range"`
- shrinkToFit tries JPEG qualities 0.9/0.8/0.7 at each of ten scales, reducing scale by 0.75, then returns null if nothing fits. `apps/web/src/cv/panel/shrink-photo.ts:4` -> `QUALITIES`; `apps/web/src/cv/panel/shrink-photo.ts:10` -> `shrinkToFit`
- Canvas shrinking paints a white background for transparency, emits JPEG and closes ImageBitmap in finally; decoding/encoding failures return null. `apps/web/src/cv/panel/shrink-photo.ts:25` -> `try`; `apps/web/src/cv/panel/shrink-photo.ts:38` -> `fillStyle`; `apps/web/src/cv/panel/shrink-photo.ts:42` -> `"image/jpeg"`; `apps/web/src/cv/panel/shrink-photo.ts:45` -> `catch`
- tested by `apps/web/src/cv/panel/photo.test.tsx:34` -> `describe("CV photo"`; `apps/web/src/cv/panel/shrink-photo.test.ts:6` -> `describe("shrinkToFit"`

## Connections

- Used by HeaderEdit to store photo metadata through setBasics: `apps/web/src/cv/edit/sections/HeaderEdit.tsx:86` -> `<PhotoField`; `apps/web/src/cv/panel/PhotoField.tsx:16` -> `PhotoField`
- Upload uses the private bucket's owner-folder INSERT policy and duplicates its MIME/size bounds: `apps/web/src/cv/panel/PhotoField.tsx:58` -> `storage.from("cv-photos").upload`; `supabase/migrations/20261108030000_cv_photos.sql:9` -> `own cv photos: upload`; `supabase/migrations/20261108030000_cv_photos.sql:11` -> `auth.uid()`; `apps/web/src/cv/panel/PhotoField.tsx:12` -> `2097152`; `supabase/migrations/20261108030000_cv_photos.sql:3` -> `2097152`
- Signed previews use the owner-folder SELECT policy, both in the field and the read-only document: `apps/web/src/cv/panel/PhotoField.tsx:35` -> `createSignedUrl`; `apps/web/src/cv/page/CvDocument.tsx:43` -> `createSignedUrl`; `supabase/migrations/20261108030000_cv_photos.sql:5` -> `own cv photos: read`; `supabase/migrations/20261108030000_cv_photos.sql:7` -> `storage.foldername`
- Uses the local resize helper before storage upload: `apps/web/src/cv/panel/PhotoField.tsx:53` -> `shrinkPhoto`; `apps/web/src/cv/panel/shrink-photo.ts:23` -> `shrinkPhoto`
- Uses global .no-print to omit photo controls when printing: `apps/web/src/cv/panel/PhotoField.tsx:87` -> `no-print`; `apps/web/src/styles/cv-page.css:184` -> `.no-print`
- Crop controls copy shared schema bounds rather than deriving them: percent clamps x/y to 0..100 and the range input fixes zoom to 1..3, so bound changes require updating both UI and schema. `apps/web/src/cv/panel/PhotoField.tsx:13` -> `percent`; `packages/shared/src/cv.ts:143` -> `x: z.number()`; `packages/shared/src/cv.ts:144` -> `y: z.number()`; `apps/web/src/cv/panel/PhotoField.tsx:124` -> `min={1} max={3}`; `packages/shared/src/cv.ts:145` -> `zoom: z.number()`

## Assumptions

- The userId path prefix is not authorization by itself; authenticated owner-folder policies must remain enforced. `apps/web/src/cv/panel/PhotoField.tsx:57` -> `userId`; `supabase/migrations/20261108030000_cv_photos.sql:10` -> `to authenticated`; `supabase/migrations/20261108030000_cv_photos.sql:11` -> `auth.uid()`
- The resize path requires createImageBitmap, canvas 2D and canvas.toBlob; unsupported/failed operations yield a shrink failure. `apps/web/src/cv/panel/shrink-photo.ts:26` -> `createImageBitmap`; `apps/web/src/cv/panel/shrink-photo.ts:35` -> `getContext`; `apps/web/src/cv/panel/shrink-photo.ts:42` -> `toBlob`
- Old or abandoned uploads remain stored because removing a photo only clears metadata and late uploads can be ignored. `apps/web/src/cv/panel/PhotoField.tsx:60` -> `currentPhoto.current`; `apps/web/src/cv/panel/PhotoField.tsx:71` -> `onChange(null)`
