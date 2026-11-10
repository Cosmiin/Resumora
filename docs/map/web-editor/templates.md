---
id: web-editor/templates
area: web-editor
files: ["apps/web/src/cv/page/templates.ts","apps/web/src/cv/page/templates.css","apps/web/src/cv/page/templates.test.tsx"]
depends_on: []
contract: false
checked_hash: c1f8ac61
cited: [9c4583, 27ff79, 8b2d72, ddb6e7, 956369, c932aa, bb1327, 1a86c0, fe74fc, bd89ef, ef3921, d7f35c, ecaa25, d95a99, 5d1288, 13e1c9, 37d243, 8b2d72, fe74fc, 059bb1, 677c53, 9fd7c6, ef3921, b51f2e, 956369, 388785, 2f5020, 0a2da0, 13e1c9, f4bd55, ddb6e7, 05d7d6]
decisions: ["docs/decisions/0011-edit-the-cv-on-the-page.md"]
open: []
---
Select a document look and align editable headings with read-only templates.

- The template list contains classic, modern and compact; TemplateId derives from that list. `apps/web/src/cv/page/templates.ts:1` -> `TEMPLATES`; `apps/web/src/cv/page/templates.ts:7` -> `TemplateId`
- Unknown or absent template IDs fall back to the first template, classic. `apps/web/src/cv/page/templates.ts:9` -> `getTemplate`
- Classic and modern permit photos; compact disables photos through metadata. `apps/web/src/cv/page/templates.ts:2` -> `showsPhoto: true`; `apps/web/src/cv/page/templates.ts:4` -> `showsPhoto: false`
- Classic uses the document font; modern uses the sans font and accented underlined section labels. `apps/web/src/cv/page/templates.css:1` -> `.cv-page.cv-template-classic`; `apps/web/src/cv/page/templates.css:17` -> `.cv-page.cv-template-modern`; `apps/web/src/cv/page/templates.css:26` -> `.cv-section-label`
- Compact uses 1.35 line height and reduced header, section, block, bullet and skill-row spacing. `apps/web/src/cv/page/templates.css:32` -> `.cv-page.cv-template-compact`; `apps/web/src/cv/page/templates.css:42` -> `.cv-header`; `apps/web/src/cv/page/templates.css:50` -> `.cv-block`; `apps/web/src/cv/page/templates.css:58` -> `.cv-skill-row`
- Editable heading inputs receive template-specific overrides separately from read-only section labels. `apps/web/src/cv/page/templates.css:63` -> `input.cv-label`; `apps/web/src/cv/page/templates.css:65` -> `.cv-section-heading`
- tested by `apps/web/src/cv/page/templates.test.tsx:17` -> `describe("CV templates"`

## Connections

- Used by read-only and editable page wrappers: `apps/web/src/cv/page/CvDocument.tsx:203` -> `getTemplate`; `apps/web/src/cv/edit/EditablePage.tsx:92` -> `getTemplate`; `apps/web/src/cv/page/templates.ts:9` -> `getTemplate`
- Template classes extend the global .cv-page/.cv-section/.cv-block rules: `apps/web/src/cv/page/templates.css:32` -> `.cv-page`; `apps/web/src/styles/cv-page.css:2` -> `.cv-page`; `apps/web/src/cv/page/templates.css:46` -> `.cv-section`; `apps/web/src/styles/cv-page.css:24` -> `.cv-section`; `apps/web/src/cv/page/templates.css:50` -> `.cv-block`; `apps/web/src/styles/cv-page.css:18` -> `.cv-block`
- Photo metadata is consumed by read-only rendering; editable HeaderEdit always mounts PhotoField: `apps/web/src/cv/page/templates.ts:4` -> `showsPhoto`; `apps/web/src/cv/page/CvDocument.tsx:36` -> `showsPhoto`; `apps/web/src/cv/edit/EditablePage.tsx:93` -> `HeaderEdit`; `apps/web/src/cv/edit/sections/HeaderEdit.tsx:86` -> `PhotoField`

## Assumptions

- Styles rely on the template class sharing an element with cv-page and on global CSS variables being available. `apps/web/src/cv/page/CvDocument.tsx:203` -> `cv-page`; `apps/web/src/cv/page/templates.css:2` -> `var(--font-document)`
- The fallback assumes TEMPLATES has a first entry; the const declaration currently supplies one. `apps/web/src/cv/page/templates.ts:2` -> `id: "classic"`; `apps/web/src/cv/page/templates.ts:10` -> `TEMPLATES[0]`
