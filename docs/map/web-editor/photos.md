---
id: web-editor/photos
area: web-editor
files: ["apps/web/src/cv/panel/PhotoField.tsx","apps/web/src/cv/panel/shrink-photo.ts","apps/web/src/cv/panel/photo.test.tsx","apps/web/src/cv/panel/shrink-photo.test.ts"]
depends_on: ["shared/cv","db/cv-photos"]
contract: false
checked_hash: 40cd038a
cited: [7883ca, 991a50, c85a14, 8804cb, e4dca0, 26230b, 07b84f, f6483d, d19811, 8b2a6f, ee304d, 12c2e0, b43c1f, b3f29f, c1e26b, c19e21, 21aa2e, 971f66, 36d424, 9549d9, 6d8667, 4d7828, 7b1305, 715da3, 472cfc, 75c5ec, a16ef3, e01836, 10ffe0, 5340d0, b930cc, 8b29ae, 197d9f, 487da3, fcad91, b66504, 043445, 84b67a, 1f3dc7, de318b, 0a30a1, 8a78a0, 60e3bd, a3c576, 6eae5b, cda4ce, e10389, 3143a1, 21cb47, dbb641, b696a6, 7285f5, 7b42c1, c19e21, ba7006, 715da3, 65776a, ce7e77, f05071, 29d1ba, 9545c6, b1c3f1, 7c3e55, b1ee80, 86a802, a16ef3, db9a3c, 2558d4, b930cc, a0d8c1, 971f66, 0200ae, 7b42c1, bb40f3, 7140f6, b66504, 4d7828, 894351]
decisions: ["docs/decisions/0011-edit-the-cv-on-the-page.md"]
open: []
---
Upload private CV photos, shrink oversized files locally and persist crop settings.

- With no photo, a styled Upload photo button opens the hidden file input and shows the format hint; uploading disables the button and changes its label. `apps/web/src/cv/panel/PhotoField.tsx:92` -> `!photo`; `apps/web/src/cv/panel/PhotoField.tsx:94` -> `input.current?.click()`; `apps/web/src/cv/panel/PhotoField.tsx:95` -> `cv.photo.uploading`; `apps/web/src/cv/panel/PhotoField.tsx:97` -> `hidden`; `apps/web/src/cv/panel/PhotoField.tsx:104` -> `cv.photo.formats`
- Existing photos start saved; successful uploads open editing, and Save only closes editing while upload, crop and zoom changes still call onChange immediately. `apps/web/src/cv/panel/PhotoField.tsx:20` -> `useState(false)`; `apps/web/src/cv/panel/PhotoField.tsx:64` -> `setEditing(true)`; `apps/web/src/cv/panel/PhotoField.tsx:148` -> `onChange`; `apps/web/src/cv/panel/PhotoField.tsx:150` -> `setEditing(false)`
- Saved photos open editing on click, Enter or Space and show a separate remove X; the photo-sized box and X remain usable when the preview fails. Upload and removal controls are absent while editing. `apps/web/src/cv/panel/PhotoField.tsx:109` -> `photo-box`; `apps/web/src/cv/panel/PhotoField.tsx:112` -> `onClick`; `apps/web/src/cv/panel/PhotoField.tsx:122` -> `event.key`; `apps/web/src/cv/panel/PhotoField.tsx:140` -> `!editing`
- JPEG, PNG and WebP are accepted; unsupported types or a missing user ID fail before upload. `apps/web/src/cv/panel/PhotoField.tsx:10` -> `extensions`; `apps/web/src/cv/panel/PhotoField.tsx:45` -> `extensions.get`
- Files over 2 MiB are shrunk to JPEG locally; failure to shrink reports an error without uploading the original. `apps/web/src/cv/panel/PhotoField.tsx:12` -> `MAX_PHOTO_BYTES`; `apps/web/src/cv/panel/PhotoField.tsx:54` -> `file.size`
- Uploads use userId/randomUUID.extension paths; the CV callback stores only path and centered default crop after success. `apps/web/src/cv/panel/PhotoField.tsx:59` -> `crypto.randomUUID`; `apps/web/src/cv/panel/PhotoField.tsx:63` -> `onChange`
- A completed upload changes the CV only if the component is still mounted and its current path matches the upload's starting path. `apps/web/src/cv/panel/PhotoField.tsx:30` -> `currentPhoto.current`; `apps/web/src/cv/panel/PhotoField.tsx:48` -> `startingPath`; `apps/web/src/cv/panel/PhotoField.tsx:62` -> `currentPhoto.current.path`
- Preview URLs last one hour and are associated with the current path; inactive effects cannot replace the preview, and signing/image errors clear it. `apps/web/src/cv/panel/PhotoField.tsx:26` -> `preview?.path`; `apps/web/src/cv/panel/PhotoField.tsx:37` -> `createSignedUrl`; `apps/web/src/cv/panel/PhotoField.tsx:136` -> `onError`
- Remove clears the CV photo reference without deleting storage objects. `apps/web/src/cv/panel/PhotoField.tsx:73` -> `function remove`
- Pointer movement adjusts crop percentages opposite the drag and clamps them to 0..100; arrows move five percentage points. `apps/web/src/cv/panel/PhotoField.tsx:13` -> `percent`; `apps/web/src/cv/panel/PhotoField.tsx:79` -> `function move`; `apps/web/src/cv/panel/PhotoField.tsx:120` -> `onKeyDown`
- Zoom input ranges from 1 to 3 in 0.1 increments, and image transforms use the stored crop origin. `apps/web/src/cv/panel/PhotoField.tsx:137` -> `objectPosition`; `apps/web/src/cv/panel/PhotoField.tsx:146` -> `type="range"`
- shrinkToFit tries JPEG qualities 0.9/0.8/0.7 at each of ten scales, reducing scale by 0.75, then returns null if nothing fits. `apps/web/src/cv/panel/shrink-photo.ts:4` -> `QUALITIES`; `apps/web/src/cv/panel/shrink-photo.ts:10` -> `shrinkToFit`
- Canvas shrinking paints a white background for transparency, emits JPEG and closes ImageBitmap in finally; decoding/encoding failures return null. `apps/web/src/cv/panel/shrink-photo.ts:25` -> `try`; `apps/web/src/cv/panel/shrink-photo.ts:38` -> `fillStyle`; `apps/web/src/cv/panel/shrink-photo.ts:42` -> `"image/jpeg"`; `apps/web/src/cv/panel/shrink-photo.ts:45` -> `catch`
- cropRectangle computes the square source region matching cover, object-position and zoom around the saved x/y origin. `apps/web/src/cv/panel/shrink-photo.ts:53` -> `cropRectangle`; `apps/web/src/cv/panel/shrink-photo.ts:55` -> `left`
- cropPhoto draws that region on a white square canvas, encodes JPEG and closes the bitmap in finally; decode/canvas/encode failure returns null. `apps/web/src/cv/panel/shrink-photo.ts:59` -> `cropPhoto`; `apps/web/src/cv/panel/shrink-photo.ts:74` -> `drawImage`; `apps/web/src/cv/panel/shrink-photo.ts:75` -> `"image/jpeg"`; `apps/web/src/cv/panel/shrink-photo.ts:79` -> `image.close()`
- Crop maths tested by `apps/web/src/cv/panel/shrink-photo.test.ts:28` -> `describe("cropRectangle"`
- Crop encoding and failures tested by `apps/web/src/export/export-files.test.ts:71` -> `crops %s`; `apps/web/src/export/export-files.test.ts:88` -> `after %s`
- tested by `apps/web/src/cv/panel/photo.test.tsx:34` -> `describe("CV photo"`; `apps/web/src/cv/panel/shrink-photo.test.ts:6` -> `describe("shrinkToFit"`

## Connections

- Used by HeaderEdit to store photo metadata through setBasics: `apps/web/src/cv/edit/sections/HeaderEdit.tsx:70` -> `<PhotoField`; `apps/web/src/cv/panel/PhotoField.tsx:16` -> `PhotoField`
- Upload uses the private bucket's owner-folder INSERT policy and duplicates its MIME/size bounds: `apps/web/src/cv/panel/PhotoField.tsx:60` -> `storage.from("cv-photos").upload`; `supabase/migrations/20261108030000_cv_photos.sql:9` -> `own cv photos: upload`; `supabase/migrations/20261108030000_cv_photos.sql:11` -> `auth.uid()`; `apps/web/src/cv/panel/PhotoField.tsx:12` -> `2097152`; `supabase/migrations/20261108030000_cv_photos.sql:3` -> `2097152`
- Signed previews use the owner-folder SELECT policy, both in the field and the read-only document: `apps/web/src/cv/panel/PhotoField.tsx:37` -> `createSignedUrl`; `apps/web/src/cv/page/CvPhoto.tsx:14` -> `createSignedUrl`; `supabase/migrations/20261108030000_cv_photos.sql:5` -> `own cv photos: read`; `supabase/migrations/20261108030000_cv_photos.sql:7` -> `storage.foldername`
- Uses the local resize helper before storage upload: `apps/web/src/cv/panel/PhotoField.tsx:55` -> `shrinkPhoto`; `apps/web/src/cv/panel/shrink-photo.ts:23` -> `shrinkPhoto`
- Used by exportFile to supply the saved square as JPEG to both builders. `apps/web/src/export/export-files.ts:36` -> `cropPhoto`; `apps/web/src/export/export-files.ts:38` -> `type: "jpeg"`
- Uses global .no-print to omit photo controls when printing: `apps/web/src/cv/panel/PhotoField.tsx:91` -> `no-print`; `apps/web/src/styles/cv-page.css:185` -> `.no-print`
- Crop controls copy shared schema bounds rather than deriving them: percent clamps x/y to 0..100 and the range input fixes zoom to 1..3, so bound changes require updating both UI and schema. `apps/web/src/cv/panel/PhotoField.tsx:13` -> `percent`; `packages/shared/src/cv.ts:143` -> `x: z.number()`; `packages/shared/src/cv.ts:144` -> `y: z.number()`; `apps/web/src/cv/panel/PhotoField.tsx:146` -> `min={1} max={3}`; `packages/shared/src/cv.ts:145` -> `zoom: z.number()`

## Assumptions

- The userId path prefix is not authorization by itself; authenticated owner-folder policies must remain enforced. `apps/web/src/cv/panel/PhotoField.tsx:59` -> `userId`; `supabase/migrations/20261108030000_cv_photos.sql:10` -> `to authenticated`; `supabase/migrations/20261108030000_cv_photos.sql:11` -> `auth.uid()`
- The resize path requires createImageBitmap, canvas 2D and canvas.toBlob; unsupported/failed operations yield a shrink failure. `apps/web/src/cv/panel/shrink-photo.ts:26` -> `createImageBitmap`; `apps/web/src/cv/panel/shrink-photo.ts:35` -> `getContext`; `apps/web/src/cv/panel/shrink-photo.ts:42` -> `toBlob`
- Old or abandoned uploads remain stored because removing a photo only clears metadata and late uploads can be ignored. `apps/web/src/cv/panel/PhotoField.tsx:62` -> `currentPhoto.current`; `apps/web/src/cv/panel/PhotoField.tsx:74` -> `onChange(null)`
