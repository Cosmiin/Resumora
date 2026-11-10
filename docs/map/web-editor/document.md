---
id: web-editor/document
area: web-editor
files: ["apps/web/src/cv/page/CvDocument.tsx","apps/web/src/cv/page/NewSections.tsx","apps/web/src/cv/page/blocks.ts","apps/web/src/cv/page/cv-document.test.tsx"]
depends_on: ["web-editor/templates","shared/cv","shared/categories","shared/dates","shared/stored-cv","db/cv-photos"]
contract: false
checked_hash: 4ea911e3
decisions: ["docs/decisions/0011-edit-the-cv-on-the-page.md"]
open: []
---
Render read-only CV content for previews and reviews with localized labels and optional change marks.

- The document defaults to classic; where mark is called, inferred marks take priority over changed marks, while focus can add a separate class. `apps/web/src/cv/page/CvDocument.tsx:30` -> `template =`; `apps/web/src/cv/page/CvDocument.tsx:31` -> `const mark`
- Photos render only for templates that show them; signed URLs are path-bound, last one hour and are cleared on signing/image failure. `apps/web/src/cv/page/CvDocument.tsx:36` -> `showsPhoto`; `apps/web/src/cv/page/CvDocument.tsx:43` -> `createSignedUrl`; `apps/web/src/cv/page/CvDocument.tsx:208` -> `onError`
- Technical/professional skill rows are separate; unclear skills are included only when showUnsorted is true, and empty rows are omitted. `apps/web/src/cv/page/CvDocument.tsx:52` -> `skillRows`
- The sections record is exhaustive over shared SectionKey, while normalized order and hidden flags determine the displayed sequence. `apps/web/src/cv/page/CvDocument.tsx:77` -> `Record<SectionKey`; `apps/web/src/cv/page/CvDocument.tsx:221` -> `layout.order.filter`
- Custom sections each display their own heading and details rather than one shared other heading. `apps/web/src/cv/page/CvDocument.tsx:188` -> `other:`
- Education displays school as the primary title and degree/field underneath, unlike the editable education row. `apps/web/src/cv/page/CvDocument.tsx:122` -> `edu.school`; `apps/web/src/cv/page/CvDocument.tsx:125` -> `edu.degree`
- NewSections first removes hidden courses/awards/publications/interests using withoutHidden; an unsupported key returns no body. `apps/web/src/cv/page/NewSections.tsx:34` -> `withoutHidden`; `apps/web/src/cv/page/NewSections.tsx:98` -> `default:`
- Optional item lines with whitespace-only text are omitted; interest output becomes individual blocks only when any interest has a nonblank line. `apps/web/src/cv/page/NewSections.tsx:9` -> `lines.filter`; `apps/web/src/cv/page/NewSections.tsx:94` -> `cv.interests.some`
- Projects and volunteering show role-shaped fields including project URL when present; their stored notes/facts are not rendered. `apps/web/src/cv/page/NewSections.tsx:55` -> `v.title`; `apps/web/src/cv/page/NewSections.tsx:59` -> `"url" in v`; `apps/web/src/cv/page/NewSections.tsx:63` -> `v.bullets.map`
- PRESENT and SKILL_GROUPS are exhaustive Record<Locale,...> maps for six CV locales, independent of interface translations. `apps/web/src/cv/page/blocks.ts:4` -> `Record<Locale`; `apps/web/src/cv/page/blocks.ts:9` -> `Record<Locale`
- Date ranges use UTC Intl formatting only for YYYY-MM; other values pass through, current overrides endDate, and empty endpoints are dropped. `apps/web/src/cv/page/blocks.ts:18` -> `formatDate`; `apps/web/src/cv/page/blocks.ts:25` -> `formatRange`
- tested by `apps/web/src/cv/page/cv-document.test.tsx:60` -> `describe("CvDocument"`; `apps/web/src/cv/page/cv-document.test.tsx:17` -> `describe("CV document photos"`

## Connections

- Used by history, import review and guided tailoring review: `apps/web/src/cv/Editor.tsx:216` -> `<CvDocument`; `apps/web/src/imports/ImportScreen.tsx:133` -> `<CvDocument`; `apps/web/src/tailor/GuidedReview.tsx:99` -> `<CvDocument`; `apps/web/src/cv/page/CvDocument.tsx:30` -> `CvDocument`
- Uses localized maps indexed by shared Locale, and an exhaustive section map indexed by shared SectionKey: `apps/web/src/cv/page/blocks.ts:4` -> `PRESENT`; `packages/shared/src/cv.ts:223` -> `Locale`; `apps/web/src/cv/page/CvDocument.tsx:77` -> `sections`; `packages/shared/src/categories.ts:1` -> `SectionKey`
- Uses signed photo access governed by the owner-folder SELECT policy: `apps/web/src/cv/page/CvDocument.tsx:43` -> `createSignedUrl`; `supabase/migrations/20261108030000_cv_photos.sql:5` -> `own cv photos: read`; `supabase/migrations/20261108030000_cv_photos.sql:7` -> `auth.uid()`
- Uses shared hidden-item filtering and date formatting: `apps/web/src/cv/page/NewSections.tsx:34` -> `withoutHidden`; `packages/shared/src/cv.ts:283` -> `withoutHidden`; `apps/web/src/cv/page/NewSections.tsx:35` -> `formatYearMonth`; `packages/shared/src/dates.ts:62` -> `formatYearMonth`
- Uses global .cv-page/.cv-block/.cv-text rules for document sizing, block spacing and preserved line breaks: `apps/web/src/cv/page/CvDocument.tsx:203` -> `cv-page`; `apps/web/src/styles/cv-page.css:2` -> `.cv-page`; `apps/web/src/cv/page/CvDocument.tsx:26` -> `cv-block`; `apps/web/src/styles/cv-page.css:18` -> `.cv-block`; `apps/web/src/cv/page/NewSections.tsx:17` -> `cv-text`; `apps/web/src/styles/cv-page.css:37` -> `white-space: pre-line`
- Uses global change/focus classes, with print suppression for change colors: `apps/web/src/cv/page/CvDocument.tsx:31` -> `cv-mark-inferred`; `apps/web/src/styles/tailor.css:137` -> `.cv-mark-inferred`; `apps/web/src/styles/tailor.css:136` -> `.cv-mark-changed`; `apps/web/src/styles/tailor.css:138` -> `@media print`; `apps/web/src/cv/page/CvDocument.tsx:32` -> `cv-mark-focus`; `apps/web/src/styles/tailor.css:174` -> `.guide-page .cv-mark-focus`
- CvDocument passes only the key, CV and date formatter to newSectionBody, with no marking callback or focus value. Its achievements, volunteering, projects, awards, courses, publications and interests bodies therefore do not receive change/inferred/focus classes; project/volunteering bullets render plain li elements even when their IDs are highlighted or focused. `apps/web/src/cv/page/CvDocument.tsx:73` -> `newSectionBody(key, cv, roleRange)`; `apps/web/src/cv/page/NewSections.tsx:28` -> `newSectionBody`; `apps/web/src/cv/page/NewSections.tsx:36` -> `switch (key)`; `apps/web/src/cv/page/NewSections.tsx:64` -> `<li key={bullet.id}>`

## Assumptions

- Photo paths are opaque storage references; access relies on the authenticated storage policy, not on possession of a path. `apps/web/src/cv/page/CvDocument.tsx:43` -> `storage.from`; `supabase/migrations/20261108030000_cv_photos.sql:7` -> `storage.foldername`
- Locale and section keys must match the shared schema/union for direct indexed lookups to succeed. `apps/web/src/cv/page/CvDocument.tsx:53` -> `SKILL_GROUPS[cv.locale]`; `apps/web/src/cv/page/CvDocument.tsx:59` -> `CATEGORY[key]`
- Signed URLs are refreshed only when the path dependency changes, so a continuously mounted preview has no scheduled expiry refresh. `apps/web/src/cv/page/CvDocument.tsx:43` -> `3600`; `apps/web/src/cv/page/CvDocument.tsx:47` -> `[path]`
