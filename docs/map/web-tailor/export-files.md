---
id: web-tailor/export-files
area: web-tailor
files: ["apps/web/src/export/export-files.ts","apps/web/src/export/export-files.test.ts","apps/web/src/export/export.test.tsx"]
depends_on: ["web-tailor/pdf","web-tailor/docx","web-tailor/file-name","web-tailor/letter-page","web-editor/templates","db/cv-photos","shared/tailoring"]
contract: false
checked_hash: c5224a81
cited: [b95b6e, adb6f4, 3faeb3, 0744e7, 584dec, 5607bc, d9b7f6, 4692a1, 5c53f8, 70bd25, c7d13e, cd291d, b00a98, ab7614, dc62da, ba7006, ce7e77, f05071, 70bd25, 9dd2e6, 2d3981, 2092c1, b28967, b95b6e, dc62da, cb3929, f05071]
decisions: []
open: []
---
Build downloads in the browser from saved CV content and optional private photo bytes.

- unreviewedItems returns text for kept inferred items not reviewed, with empty text fallback and no deduplication. `apps/web/src/export/export-files.ts:17` -> `unreviewedItems`
- Photo download is skipped without photo metadata or when the template has no photo slot; download errors and unsupported MIME types silently omit the image. `apps/web/src/export/export-files.ts:28` -> `PHOTO_TYPES`; `apps/web/src/export/export-files.ts:33` -> `photo === null`
- Letter export throws if no coverLetter, uses current date unless supplied, and splits body into trimmed blank-line paragraphs. `apps/web/src/export/export-files.ts:47` -> `throw`; `apps/web/src/export/export-files.ts:53` -> `paragraphs`
- Letter headers use current CV basics and job company/title; shared letterWords supplies the greeting/sign-off. `apps/web/src/export/export-files.ts:52` -> `letterWords`; `apps/web/src/export/export-files.ts:56` -> `greeting`
- Browser download uses an object URL and detached anchor click, then revokes the URL in a zero-delay timer. `apps/web/src/export/export-files.ts:61` -> `save`
- Builders load dynamically; letters use only the chosen renderer and append Cover letter to the role filename component. `apps/web/src/export/export-files.ts:80` -> `import`
- Every CV export fits via PDF first, including DOCX; DOCX receives the PDF-selected FitStep. `apps/web/src/export/export-files.ts:85` -> `fitCvPdf`
- CV downloads occur even when fits=false; returned pages/fits are from the PDF measurement, and letter exports return undefined. `apps/web/src/export/export-files.ts:82` -> `undefined`; `apps/web/src/export/export-files.ts:89` -> `save`
- tested by `apps/web/src/export/export-files.test.ts:36` -> `describe`
- tested by `apps/web/src/export/export.test.tsx:35` -> `it`

## Connections

- Uses Supabase Storage cv-photos download; the bucket is private and read policy requires the first path folder to equal auth.uid(). `apps/web/src/export/export-files.ts:35` -> `cv-photos`; `supabase/migrations/20261108030000_cv_photos.sql:3` -> `false`; `supabase/migrations/20261108030000_cv_photos.sql:5` -> `own cv photos: read`; `supabase/migrations/20261108030000_cv_photos.sql:7` -> `auth.uid()`
- Uses PDF fit and DOCX renderer with the same content/template/photo. `apps/web/src/export/export-files.ts:85` -> `fitCvPdf`; `apps/web/src/export/pdf.tsx:148` -> `fitCvPdf`; `apps/web/src/export/export-files.ts:88` -> `buildCvDocx`; `apps/web/src/export/docx.ts:62` -> `buildCvDocx`
- Used by DoneScreen and GuidedReview-compatible export warnings to count unchecked guesses. `apps/web/src/tailor/DoneScreen.tsx:42` -> `unreviewedItems`; `apps/web/src/export/export-files.ts:17` -> `unreviewedItems`

## Assumptions

- Photo paths are passed directly to Storage and depend on its owner-folder policy; authorization failure degrades to export without a photo. `apps/web/src/export/export-files.ts:35` -> `download(photo.path)`; `apps/web/src/export/export-files.ts:37` -> `return undefined`; `supabase/migrations/20261108030000_cv_photos.sql:7` -> `storage.foldername`
