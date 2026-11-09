# Tailoring round 2 · Export (C7) · progress

Branch `rebuild/tailor-r2-export` (worktree `resumora-r2-export`), stacked on `rebuild/tailor-test-fixes` (base 13f49c6).
Findings: `C:\Users\mcosm\claude\resumora\tailoring-test-findings-2.md` (C7, "Not tested this round"). Claude mode (claude-build).

## Task 1: name overlap + fit to 2 pages — done
session: r2 export · builder: claude
commit: 1605888 (base 13f49c6) · reviews: 1 (agents) · fix rounds: 0 · guard denials: 0 · weekly 40% → 41%
open: Word lays out differently from the PDF (role title not bold, dates on their own line, a gap after every bullet), so it can stay over 2 pages even with the PDF's step. Proposed to the owner, not built.

Notes:
- Reproduced before fixing: in every template, with and without a photo, the name and the titles line under it were drawn about 7pt over each other (react-pdf gives the 23pt name the body's ~16pt line height). The photo plays no part.
- Owner's rulings (2026-11-09): smallest text 10pt for Classic and Modern, 9.5pt for Compact; Word reuses the PDF's fit step.
- Review finding: an untracked scratch test (`zz-samples.test.tsx`) that was already deleted before commit; the product change had no findings, so no re-review.
- Ruling: one string added to `apps/web/src/i18n/en-tailor.ts` (`export.tooLong`), outside `apps/web/src/export/*`.
- Photo: `export-files.ts` already downloads the photo and passes it to both builders; it shows in the PDF and in Word (checked with sample files, Word opened via Word itself).
- Full suite: 2 CV editor typing tests failed once under full-suite load and pass when run alone (timing; untouched code).
