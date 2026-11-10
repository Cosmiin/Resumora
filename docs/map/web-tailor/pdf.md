---
id: web-tailor/pdf
area: web-tailor
files: ["apps/web/src/export/pdf.tsx","apps/web/src/export/pdf.test.tsx"]
depends_on: ["shared/cv","shared/categories","shared/dates","web-editor/templates","web-editor/document","web-tailor/fit","web-tailor/pdf-fonts","web-tailor/docx","shared/stored-cv","web-tailor/letter-page","shared/tailoring"]
contract: false
checked_hash: a2a4114f
cited: [211905, 24914c, 6e9300, 4a4928, 7684bc, 3b9f34, f50668, 0f7dc9, c3ff85, 5f2e14, eb9b6b, 260a93, f24107, 8b06fc, aa7136, 7c5b5e, 8a07f2, 3bd4ec, de99d3, 317494, 349ece, 1b1679, 950911, c2d4f9, 7f4895, ac9456, 6e9300, 4a4928, 802453, 895e8c, 82c10f, 6f4f70, 18c71d, d5327f, bac527, 5c549f, 3bbf3f, 69af33, 4ef88f, e3eddb, d91ed6, 5607bc, a831ac, 05d7d6, aaec5d, 211905, 6c5831, 0f7dc9, 110546, c28cfa, b169ea, f6c8d3, f24107, faf887, b17465, 5f2e14, df7a9a, c3ff85, d3e550, 1ec158, a2f028, 2938dd, 5d3ac5, a70e43, 24914c, de99d3, 5135fa, 2fa248, 0c913a, 0f7dc9]
decisions: []
open: []
---
Render CV and letter PDF documents with normalized sections and embedded font families.

- buildCvPdf removes hidden items before rendering and registers fonts; photos require a declared photo slot, metadata and non-WebP bytes. `apps/web/src/export/pdf.tsx:33` -> `withoutHidden`; `apps/web/src/export/pdf.tsx:36` -> `photo !== null`
- Classic uses serif fonts, modern/compact sans; modern accent is green, and tight themes lower spacing and margins from 54 to 40 points. `apps/web/src/export/pdf.tsx:12` -> `TEMPLATES`; `apps/web/src/export/pdf.tsx:18` -> `TIGHT`; `apps/web/src/export/pdf.tsx:40` -> `padding`
- Name size is body+12 with its own lineHeight; headings reserve 24 points ahead of themselves. `apps/web/src/export/pdf.tsx:43` -> `name`; `apps/web/src/export/pdf.tsx:53` -> `minPresenceAhead`
- Sections is an exhaustive Record<SectionKey,ReactElement[]>; adding a SectionKey requires a renderer entry. `apps/web/src/export/pdf.tsx:82` -> `Record<SectionKey`
- Technical/professional skill groups render separately with localized labels; unclearSkills is not included. `apps/web/src/export/pdf.tsx:90` -> `skills`
- Role-shaped entries include company, location, optional project URL, localized date range, description and every bullet. `apps/web/src/export/pdf.tsx:71` -> `roles`
- Course/award/publication/interest lines omit whitespace-only bullets; interests use separate entries only if any nonblank line exists, otherwise one joined paragraph. `apps/web/src/export/pdf.tsx:66` -> `lined`; `apps/web/src/export/pdf.tsx:109` -> `interests`
- normalizeLayout precedes filtering hidden/empty sections; custom titles override localized category labels, and other uses each custom item's own heading. `apps/web/src/export/pdf.tsx:119` -> `normalizeLayout`; `apps/web/src/export/pdf.tsx:135` -> `layout.order.filter`; `apps/web/src/export/pdf.tsx:112` -> `other`
- CV output is an A4 document with locale metadata; header-right photos follow the flex-1 name/title/contact column in a row, contained in a 72-point square. `apps/web/src/export/pdf.tsx:123` -> `Document`; `apps/web/src/export/pdf.tsx:41` -> `flexDirection`; `apps/web/src/export/pdf.tsx:127` -> `flex: 1`; `apps/web/src/export/pdf.tsx:132` -> `Image`
- fitCvPdf renders progressively until two pages fit, or returns the final candidate with fits=false; it passes unchanged content into each build. `apps/web/src/export/pdf.tsx:155` -> `fitToPages`
- Letters use Newsreader fallback fonts at 11pt, 54-point padding and an A4 page. `apps/web/src/export/pdf.tsx:169` -> `PDF_FONTS.letter`; `apps/web/src/export/pdf.tsx:186` -> `A4`
- Letter output orders contact, localized date, company/role joined by middle dot, greeting, paragraphs, sign-off and name; it does not use LetterPage's localized subject prefix. `apps/web/src/export/pdf.tsx:174` -> `recipient`
- tested by `apps/web/src/export/pdf.test.tsx:117` -> `describe`
- tested by `apps/web/src/export/pdf.test.tsx:312` -> `describe`

## Connections

- Extending TemplateId also requires PDF TEMPLATES/TIGHT, DOCX STYLES/TIGHT and fit FONT entries: both renderers index their maps by the registry-selected id, beyond the separate exhaustive SectionKey maps. `apps/web/src/cv/page/templates.ts:7` -> `TemplateId`; `apps/web/src/export/pdf.tsx:12` -> `TEMPLATES`; `apps/web/src/export/pdf.tsx:18` -> `TIGHT`; `apps/web/src/export/pdf.tsx:38` -> `selectedTemplate.id`; `apps/web/src/export/docx.ts:19` -> `STYLES`; `apps/web/src/export/docx.ts:25` -> `TIGHT`; `apps/web/src/export/docx.ts:167` -> `selectedTemplate.id`; `apps/web/src/export/fit.ts:7` -> `FONT`
- Extending the CV locale set also reaches skill-group and category labels: both renderers index them directly by content.locale. `apps/web/src/export/pdf.tsx:91` -> `SKILL_GROUPS`; `apps/web/src/export/pdf.tsx:137` -> `CATEGORY`; `apps/web/src/export/docx.ts:142` -> `SKILL_GROUPS`; `apps/web/src/export/docx.ts:163` -> `CATEGORY`; `apps/web/src/cv/page/blocks.ts:9` -> `Record<Locale`; `packages/shared/src/categories.ts:23` -> `label`
- Letter greetings/sign-offs use the separate TailorLanguage-indexed WORDS map; adding a tailoring language reaches that map through export letterParts as well as the on-screen letter. `packages/shared/src/tailor.ts:4` -> `TailorLanguageSchema`; `apps/web/src/tailor/LetterPage.tsx:5` -> `WORDS`; `apps/web/src/export/export-files.ts:52` -> `letterWords`

- Uses the template registry for fallback and photo slots, alongside renderer-specific theme maps. `apps/web/src/export/pdf.tsx:35` -> `getTemplate`; `apps/web/src/cv/page/templates.ts:10` -> `TEMPLATES[0]`; `apps/web/src/cv/page/templates.ts:4` -> `photo: null`
- Uses shared item hiding and layout normalization; DOCX has a parallel exhaustive section map that must change with categories too. `apps/web/src/export/pdf.tsx:33` -> `withoutHidden`; `packages/shared/src/cv.ts:283` -> `withoutHidden`; `apps/web/src/export/pdf.tsx:82` -> `Record<SectionKey`; `apps/web/src/export/docx.ts:133` -> `Record<SectionKey`
- Uses font registration at both CV and letter entry points. `apps/web/src/export/pdf.tsx:34` -> `registerPdfFonts`; `apps/web/src/export/pdf.tsx:167` -> `registerPdfFonts`; `apps/web/src/export/pdf-fonts.ts:24` -> `registerPdfFonts`

- Uses normalizeLayout to keep the first occurrence of known ordered keys, append missing keys in category order, deduplicate/filter hidden keys and discard blank titles. `apps/web/src/export/pdf.tsx:119` -> `normalizeLayout`; `packages/shared/src/upgrade.ts:24` -> `normalizeLayout`; `packages/shared/src/upgrade.ts:33` -> `hidden`

## Assumptions

- Both CV formats select printable fields rather than dump stored data: unclearSkills, role/project/volunteering notes and facts, separate firstName/lastName and internal metadata are not printed; names use fullName, while education notes are printed. `apps/web/src/export/pdf.tsx:71` -> `roles`; `apps/web/src/export/pdf.tsx:88` -> `item.notes`; `apps/web/src/export/pdf.tsx:90` -> `skills`; `apps/web/src/export/pdf.tsx:128` -> `b.fullName`; `apps/web/src/export/docx.ts:106` -> `b.fullName`; `apps/web/src/export/docx.ts:125` -> `roles`; `apps/web/src/export/docx.ts:139` -> `item.notes`; `apps/web/src/export/docx.ts:141` -> `skills`
- Shared photo x/y/zoom crop settings are ignored in both formats: PDF contains the whole image in a 72-point square and DOCX scales it into a 96-pixel square; both exclude WebP photos. `packages/shared/src/cv.ts:141` -> `photo`; `apps/web/src/export/pdf.tsx:36` -> `image`; `apps/web/src/export/pdf.tsx:132` -> `Image`; `apps/web/src/export/docx.ts:74` -> `webp`; `apps/web/src/export/docx.ts:95` -> `scale`

- Input must already be valid CvContent; rendering reads its arrays directly and does not schema-parse them. `apps/web/src/export/pdf.tsx:27` -> `CvContent`; `apps/web/src/export/pdf.tsx:82` -> `sections`
