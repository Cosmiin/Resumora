---
id: shared/dates
area: shared
files: ["packages/shared/src/dates.ts","packages/shared/src/dates.test.ts"]
depends_on: ["shared/cv"]
contract: true
checked_hash: 8d6a1753
cited: [a398b5, 69c6a0, 60614f, 636bec, cc1b9a, 24c7d2, b114d2, 790645, c13a2e, 730a22, 85566a, 60614f, 3814a9, c13a2e, 22cba9, 742f18, cfcece, c13a2e, 9b05f2, c13a2e, 9030f8, 725171, 152903, b694c1, caa28b, 636bec, 40dbbb]
decisions: []
open: []
---
Convert typed dates into stored year/month strings and display them in the CV language.

- TypedDate distinguishes failure from success with a separate present flag; present is represented by an empty value. `packages/shared/src/dates.ts:3` -> `TypedDate`, `packages/shared/src/dates.ts:44` -> `present: true`
- Input is trimmed and lowercased; blank dates and four-digit years succeed without inventing a month. `packages/shared/src/dates.ts:41` -> `parseTypedDate`
- Year-month, month/year and month.year accept one- or two-digit months, rejecting months outside 1–12. `packages/shared/src/dates.ts:35` -> `yearMonth`, `packages/shared/src/dates.ts:47` -> `isoLike`
- Named months use a fixed alias table; unrecognized names or syntax return ok false. `packages/shared/src/dates.ts:53` -> `const named`
- Only present, prezent, now and acum mark a current date. `packages/shared/src/dates.ts:33` -> `PRESENT_WORDS`
- Formatting uses six locale-specific short-month tables; nonmatching input or an invalid month index is returned unchanged. `packages/shared/src/dates.ts:24` -> `SHORT_NAMES`, `packages/shared/src/dates.ts:62` -> `formatYearMonth`
- tested by `packages/shared/src/dates.test.ts:4` -> `parseTypedDate`

## Connections

- Used by web date input: `apps/web/src/cv/edit/DateField.tsx:2` -> `parseTypedDate` -> `packages/shared/src/dates.ts:41` -> `parseTypedDate`; formatter call `apps/web/src/cv/edit/DateField.tsx:20` -> `formatYearMonth` -> `packages/shared/src/dates.ts:62` -> `formatYearMonth`.
- Used by web PDF/DOCX output and tailoring review: `apps/web/src/export/pdf.tsx:80` -> `formatYearMonth`, `apps/web/src/export/docx.ts:123` -> `formatYearMonth`, `apps/web/src/tailor/LayoutReview.tsx:59` -> `formatYearMonth` -> `packages/shared/src/dates.ts:62` -> `formatYearMonth`. The CV page uses the same formatter for award, course and publication dates: `apps/web/src/cv/page/NewSections.tsx:35` -> `formatYearMonth` -> `packages/shared/src/dates.ts:62` -> `formatYearMonth`.
- Uses CV Locale and produces values compatible with YearMonthSchema: `packages/shared/src/dates.ts:1` -> `Locale` -> `packages/shared/src/cv.ts:224` -> `Locale`; `packages/shared/src/dates.ts:37` -> `value:` -> `packages/shared/src/cv.ts:23` -> `regex`.

## Assumptions

- The formatter expects a supported Locale; it directly indexes the locale's table. `packages/shared/src/dates.ts:65` -> `SHORT_NAMES`.
- The helper checks month range, not whether a year is historically plausible or dates are ordered. `packages/shared/src/dates.ts:35` -> `yearMonth`, `packages/shared/src/dates.ts:45` -> `test(text)`.
