---
id: shared/categories
area: shared
files: ["packages/shared/src/categories.ts","packages/shared/src/categories.test.ts","packages/shared/src/flags.ts","packages/shared/src/flags.test.ts"]
depends_on: ["shared/cv","shared/stored-cv"]
contract: true
checked_hash: 4eb0a4ab
cited: [0f1363, 03e70c, e94151, 554c0c, d42ec7, a12e17, 4eb828, a15cb1, 017b4d, e6e043, 4548d4, c571f2, 363ac5, 5eef48, a44633, 6f4224, 7a2284, 8e23cf, 27a2fb, 1a6587, 2f37a2, b24e37, 9028fb, 4a29b6, 85316d, f3b63f, 4548d4, 60da42, 0f7dc9, 110546, 60da42, d888e4, a9c9c9, 1bd21d, 1f2235, d83b80, 8e23cf, 27a2fb, 10ef92, d35cd3, faf887, 3bf5ba, 34fa07, d35cd3]
decisions: ["docs/decisions/0009-one-fixed-set-of-cv-categories.md"]
open: []
---
Keep category labels, section ordering and missing-content flags consistent across import and editing.

- SectionKey excludes header; CategoryKey adds it, while FlagLevel is only missing or tip. `packages/shared/src/categories.ts:15` -> `other`, `packages/shared/src/categories.ts:17` -> `CategoryKey`
- Category records require labels for six languages and synonyms for English and Romanian only. `packages/shared/src/categories.ts:21` -> `Category`
- Header, summary, achievements, experience, skills and education carry missing flags; languages carries tip. `packages/shared/src/categories.ts:34` -> `flag:`, `packages/shared/src/categories.ts:41` -> `flag:`, `packages/shared/src/categories.ts:51` -> `flag:`, `packages/shared/src/categories.ts:61` -> `flag:`, `packages/shared/src/categories.ts:71` -> `flag:`, `packages/shared/src/categories.ts:81` -> `flag:`, `packages/shared/src/categories.ts:91` -> `flag:`
- CATEGORY indexes the list by key; SECTION_KEYS preserves list order while excluding header. `packages/shared/src/categories.ts:162` -> `CATEGORY`
- Empty skills means all three skill arrays are empty; achievements are `{id,text}` objects, and the section is empty when every object has blank trimmed text (including an empty list), while most sections use list length only. `packages/shared/src/flags.ts:12` -> `skills`, `packages/shared/src/flags.ts:19` -> `b.text.trim()`, `packages/shared/src/cv.ts:25` -> `BulletSchema`, `packages/shared/src/cv.ts:200` -> `achievements:`
- Missing name and email produce independent header flags even when sections are hidden. `packages/shared/src/flags.ts:27` -> `headerFlags`
- Tailored-section visibility requires not hidden and either content or an explicitly opened section; shownEmptyFlags follows normalized page order. `packages/shared/src/flags.ts:39` -> `isSectionShown`, `packages/shared/src/flags.ts:44` -> `shownEmptyFlags`
- missingCategories skips hidden, populated and unflagged sections after header flags. `packages/shared/src/flags.ts:53` -> `missingCategories`
- tested by `packages/shared/src/categories.test.ts:4` -> `categories`
- tested by `packages/shared/src/flags.test.ts:4` -> `missingCategories`

## Connections

- Used by API extraction prompt generation: `apps/api/src/imports/prompts.ts:83` -> `CATEGORIES` -> `packages/shared/src/categories.ts:30` -> `CATEGORIES`; the generated prompt is passed to the extraction model at `apps/api/src/imports/process.ts:67` -> `extractPrompt` -> `apps/api/src/imports/prompts.ts:91` -> `extractPrompt`.
- Used by web page labels and section types: `apps/web/src/cv/page/CvDocument.tsx:2` -> `CATEGORY` -> `packages/shared/src/categories.ts:162` -> `CATEGORY`, `packages/shared/src/categories.ts:1` -> `SectionKey`.
- Used by exhaustive PDF/DOCX section maps: adding SectionKey requires both maps to gain a renderer, and each exporter indexes them while walking layout order. `apps/web/src/export/pdf.tsx:82` -> `sections`, `apps/web/src/export/docx.ts:123` -> `sections` -> `packages/shared/src/categories.ts:1` -> `SectionKey`; rendering `apps/web/src/export/pdf.tsx:133` -> `sections[key]`, `apps/web/src/export/docx.ts:152` -> `sections[key]`.
- Used by web overview/import flags and FlagLevel rendering: `apps/web/src/cv/panel/Overview.tsx:2` -> `shownEmptyFlags`, `apps/web/src/imports/ImportSummary.tsx:1` -> `missingCategories`, `apps/web/src/cv/edit/MissingBox.tsx:1` -> `FlagLevel` -> `packages/shared/src/flags.ts:44` -> `shownEmptyFlags`, `packages/shared/src/flags.ts:53` -> `missingCategories`, `packages/shared/src/categories.ts:19` -> `FlagLevel`.
- Uses layout repair before deciding visibility: `packages/shared/src/flags.ts:40` -> `normalizeLayout` -> `packages/shared/src/upgrade.ts:24` -> `normalizeLayout`.

## Assumptions

- Missing email flags test only blankness, not a valid email address: `packages/shared/src/flags.ts:30` -> `email.trim`.
- Visibility checks depend on caller-supplied opened state; hidden individual items still count toward most section lengths: `packages/shared/src/flags.ts:23` -> `cv[key].length`, `packages/shared/src/flags.ts:40` -> `opened.has`.
