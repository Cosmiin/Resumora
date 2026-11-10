---
id: web-tailor/translation
area: web-tailor
files: ["apps/web/src/tailor/TailorToolbar.tsx","apps/web/src/tailor/translate.test.tsx"]
depends_on: ["web-tailor/client-document","web-tailor/client-actions","shared/tailoring","api-tailor/translate","shared/cv"]
contract: false
checked_hash: 6d427b48
decisions: []
open: []
---
Open existing language copies or request translated replacements.

- Copies are queried only while the menu is open, under [tailored-list,jobId]. `apps/web/src/tailor/TailorToolbar.tsx:34` -> `useQuery`
- Languages come from TailorLanguageSchema.options excluding the current language. `apps/web/src/tailor/TailorToolbar.tsx:59` -> `options.filter`
- Existing copies always offer Open; missing copies offer Translate; only translated copies offer Translate again. `apps/web/src/tailor/TailorToolbar.tsx:65` -> `copy`; `apps/web/src/tailor/TailorToolbar.tsx:73` -> `!copy`
- Translate again first shows an inline replacement confirmation; original copies cannot be selected for replacement from this menu. `apps/web/src/tailor/TailorToolbar.tsx:67` -> `confirming`; `apps/web/src/tailor/TailorToolbar.tsx:75` -> `translatedFrom`
- Translation uses current.id as source, closes the menu and navigates to the returned cv id; the flagged count is not consumed. `apps/web/src/tailor/TailorToolbar.tsx:41` -> `tailoredCvId`
- Failure sets a local alert and clears busy without navigation; generation buttons disable while another language is busy. `apps/web/src/tailor/TailorToolbar.tsx:44` -> `catch`; `apps/web/src/tailor/TailorToolbar.tsx:74` -> `disabled`
- tested by `apps/web/src/tailor/translate.test.tsx:44` -> `describe`

## Connections

- Uses translate and listTailored; exact HTTP contracts are in client-actions/client-document. `apps/web/src/tailor/TailorToolbar.tsx:41` -> `translate`; `apps/web/src/tailor/tailored-api.ts:41` -> `translate`; `apps/web/src/tailor/TailorToolbar.tsx:34` -> `listTailored`; `apps/web/src/tailor/tailored-api.ts:14` -> `listTailored`
- Uses /jobs/:id/cv?cv=<id>, consumed by the document picker. `apps/web/src/tailor/TailorToolbar.tsx:35` -> `navigate`; `apps/web/src/tailor/TailoredCvPage.tsx:55` -> `search.get`
- Uses global tailored-menu-pop positioning and tailored-confirm wrapping. `apps/web/src/tailor/TailorToolbar.tsx:55` -> `tailored-menu-pop`; `apps/web/src/styles/tailor.css:149` -> `.tailored-menu-pop`; `apps/web/src/tailor/TailorToolbar.tsx:68` -> `tailored-confirm`; `apps/web/src/styles/tailor.css:154` -> `.tailored-confirm`

## Assumptions

- Menu copy lookup relies on the job-scoped query and server response; list-load errors fall through to undefined copy lookups because rendering only tests isPending. `apps/web/src/tailor/TailorToolbar.tsx:57` -> `copies.isPending`; `apps/web/src/tailor/TailorToolbar.tsx:60` -> `copies.data?`
