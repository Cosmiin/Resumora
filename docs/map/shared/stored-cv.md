---
id: shared/stored-cv
area: shared
files: ["packages/shared/src/upgrade.ts","packages/shared/src/upgrade.test.ts"]
depends_on: ["shared/cv","shared/categories"]
contract: true
checked_hash: c2e4ace8
cited: [60f529, f203af, faf887, b17465, defcf5, 238805, f45806, 1de92f, 50158f, defcf5, ce9677, defcf5, 2c17ba, f3b63f, dbfb52, faf887, f24107, 59e5ca, faf887, c69e2a, 48de31, e0c3ae, a269dd, 3dcf49, 30a6de, 60f529, c69e2a]
decisions: ["docs/decisions/0003-one-shared-description-of-a-cv.md","docs/decisions/0009-one-fixed-set-of-cv-categories.md"]
open: []
---
Read old CVs as current content and repair stored section layouts.

- upgradeCv preserves v1 fields, sets schemaVersion 2 and initializes the six added collections, layout and enrichment timestamp. `packages/shared/src/upgrade.ts:8` -> `upgradeCv`, `packages/shared/src/upgrade.ts:18` -> `layout:`
- normalizeLayout retains the first occurrence of each known ordered section, then appends missing sections in category order. `packages/shared/src/upgrade.ts:24` -> `normalizeLayout`
- Hidden sections are filtered against the repaired order and deduplicated; only nonblank titles for known sections survive, retaining their original whitespace. `packages/shared/src/upgrade.ts:33` -> `const hidden`
- StoredCvSchema first parses the v2/v1 union, then upgrades v1 or repairs v2 layout; normalization cannot rescue input rejected by both schemas. `packages/shared/src/upgrade.ts:43` -> `StoredCvSchema`
- defaultLayout is re-exported from cv.ts rather than reimplemented. `packages/shared/src/upgrade.ts:3` -> `defaultLayout`, `packages/shared/src/upgrade.ts:5` -> `defaultLayout`
- tested by `packages/shared/src/upgrade.test.ts:58` -> `upgradeCv`

## Connections

- Used by API stored-row parsing: `apps/api/src/cv/supabase-repo.ts:11` -> `StoredCvSchema` -> `packages/shared/src/upgrade.ts:43` -> `StoredCvSchema`.
- Used by import result parsing, which also accepts stored v1 content: `packages/shared/src/imports.ts:93` -> `StoredCvSchema` -> `packages/shared/src/upgrade.ts:43` -> `StoredCvSchema`; API consumer `apps/api/src/imports/supabase-repo.ts:27` -> `ImportResultSchema`.
- Used by web page layout and section tooling: `apps/web/src/cv/page/CvDocument.tsx:2` -> `normalizeLayout`, `apps/web/src/cv/panel/SectionTools.tsx:1` -> `normalizeLayout` -> `packages/shared/src/upgrade.ts:24` -> `normalizeLayout`. PDF and DOCX exports also normalize layouts before rendering, so normalization changes affect export order, hiding and titles: `apps/web/src/export/pdf.tsx:119` -> `normalizeLayout`, `apps/web/src/export/docx.ts:150` -> `normalizeLayout` -> `packages/shared/src/upgrade.ts:24` -> `normalizeLayout`.
- Uses shared CV schemas and category order: `packages/shared/src/upgrade.ts:44` -> `CvContentSchema` -> `packages/shared/src/cv.ts:194` -> `CvContentV1Schema`, `packages/shared/src/cv.ts:196` -> `CvContentSchema`; `packages/shared/src/upgrade.ts:30` -> `SECTION_KEYS` -> `packages/shared/src/categories.ts:166` -> `SECTION_KEYS`.

## Assumptions

- Stored malformed CVs are server errors, not silently replaced with empty content: `apps/api/src/cv/supabase-repo.ts:12` -> `!parsed.success`.
- Upgrade input is already a validated v1 shape; the upgrade helper itself does not parse its argument: `packages/shared/src/upgrade.ts:8` -> `CvContentV1`, `packages/shared/src/upgrade.ts:44` -> `union`.
