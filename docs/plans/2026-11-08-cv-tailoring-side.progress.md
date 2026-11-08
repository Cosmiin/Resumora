# CV tailoring — side lane progress (branch `rebuild/tailor-side`, from `07dabe6`)

session: Tailoring S1 · Side · Tasks 8, 23a (side session started by Tailoring 00, local_eddc9931-19f5-40f7-ba00-9eb4021eaa78)

## Rulings
- Task 8: the plan lists `apps/api/src/ai/call-model.test.ts`, which does not exist; the tests live in `apps/api/test/call-model.test.ts`. The brief's scope was changed to that file and Codex added the tests there.
- Task 23 is split: **23a** (this branch) is the template registry, CSS and the `CvDocument` `template` prop only. The toolbar dropdown, `TailorToolbar.tsx`, the `PATCH /v1/tailored/:id` call and the "switching calls the PATCH" test stay for **Task 23b**, done with Task 23's remaining scope once Part 4 creates the toolbar.
- Task 23a: `apps/web/src/i18n/en.ts` added to scope so the three template labels resolve through `t()` (it is the only strings file). Size estimate 180 lines (the plan's 220 included the toolbar).
- Whole-branch review uses a combined brief of Tasks 8 and 23a, not the full plan, so the reviewer doesn't flag the 25 tasks this lane doesn't own.
- This progress file is committed with the whole-branch review pass, so its cost line excludes that last review; the final message gives that number.

## Task 8: Cheap/strong model tier — done
commit: 26e50f8 · codex: build 01a1bb47-eae4-7a12-9088-485c22dddb66, review 01a1bb4e-b568-7af0-b9f4-48272e423000 · codex tokens: 781671 (1124799 with the branch-review fix) · fix rounds: 1 (test file path), +1 from the branch review · guard denials: 1 (shell edit of the brief whose text named apps/)
open: the owner sets real strong model ids in `.dev.vars`; no caller uses `tier: "strong"` yet (Task 9 onward).

## Task 23a: Template registry with Classic, Modern, Compact (no toolbar) — done
commit: 5322115 · codex: build 01a1bb50-26fe-79e1-a11f-091c44c98b6d, review 01a1bb56-039d-7c31-9060-61e85d47e8b3 · codex tokens: 1034817 · fix rounds: 1 (scope fail from my untracked progress file, plus en.ts label keys) · guard denials: 1 (shell move whose text named apps/)
open: Task 23b (toolbar dropdown + PATCH save + its test); only `en.ts` has the labels, like every other string.

## Whole-branch review — done
review 1 (01a1bb58-3143-7e01-a3dd-bc536557c3c3): fix, one medium finding: `StreamRequest.tier` in `stream-model.ts` had no callers (the plan uses the strong tier only through `callModel`). Fix: Task 8's build session restored `stream-model.ts` to its base content (now 1015596 tokens for that session). This fix and this file go into one commit once a branch review passes; `git log` shows that commit.
review 2 (01a1bb5b-afba-71b3-adc8-8932caf089e9): fix, only finding was this file describing that commit as already made; reworded.
open: if a later task streams with the strong tier, add `tier` to `StreamRequest` then.

## Cost
codex tokens: 2489472 across 6 Codex sessions (Task 8 1124799, Task 23a 1034817, branch reviews 1 and 2 194806 + 135050), not counting the passing branch review that admits this file (its count is in `tools/codex-log.jsonl` and the side session's final message) · Claude context: ≈80k (estimate) · guard denials: 2 (both shell commands whose text named apps/; no work-around used)

---

session: Tailoring S2 · Side · Tasks 24a, 25a, 24b (side session started by Tailoring 00, local_eddc9931-19f5-40f7-ba00-9eb4021eaa78)

## Rulings (Tailoring S2)
- Task 24 is split: **24a** is `exportFileName` only and **24b** the pure PDF builders. `ExportMenu.tsx`, `print.css`, `exportPdf(kind)`, the toolbar button, the unreviewed-items warning and `export.test.tsx` stay with the rest of Task 24, after Parts 4–5. (Tailoring S2)
- Task 24a: empty parts are skipped and runs of `_` collapse, so `R&D / QA` gives `RD_QA`; all parts empty gives `CV.<ext>`. (Tailoring S2)
- Task 25 is split: **25a** is the builders only; the ExportMenu entry and the download with `exportFileName(..., "docx")` stay with the rest of Task 25. (Tailoring S2)
- Task 25a: `docx` pinned at 9.15.2, the version the API workspace already had (9.15.3 was 2 days old). `jszip` 3.10.2 is a web devDependency for the unzip test. (Tailoring S2)
- Task 25a: the letter input is a local type in `export/docx.ts`, `LetterDocxInput = { greeting?, paragraphs: string[], signOff? }` plus `LetterHeader = { name, contact?, company?, role?, date? }`. Task 21 adapts its letter shape to it; `pdf.tsx` imports the same types. (Tailoring S2)
- Tasks 25a and 24b: no photo field exists yet (Task 26), so a template with `showsPhoto` draws nothing in both builders. (Tailoring S2)
- Task 24b, PDF library (picked by Tailoring 00 from a Codex scout): `@react-pdf/renderer` 4.9.0 (MIT), real `<Text>` and A4 page flow. It reads neither WOFF2 nor variable fonts, so the PDF uses static `.woff` files: `@fontsource/newsreader` 5.3.0, `@fontsource/instrument-sans` 5.3.0, `@fontsource/source-serif-4` 5.3.1, regular and bold. Romanian `ș ț ă î â` are in Fontsource's latin-ext files: each font is registered as a latin and a latin-ext family and styles use react-pdf's array `fontFamily` fallback. Classic = Source Serif 4, Modern and Compact = Instrument Sans, the letter = Newsreader. `unpdf` 2.1.0 (already used by the API) is a web devDependency to extract text in the test. (Tailoring S2)
- Task 24b: react-pdf adds 55 transitive packages (~520 lockfile lines), so the brief's size limit was raised to cover them. One of them, `@swc/helpers`, resolved to 0.5.24 (published 4 days earlier); the lockfile holds it at 0.5.23, with the integrity checked against the registry. (Tailoring S2)

## Task 24a: Export file name — done (Tailoring S2)
commit: 4fc7e7f · codex: build 01a1bb90-d2a6-76a0-88fe-776abf70d31c, review 01a1bb95-32f6-7973-94eb-209d94b3cb1c · codex tokens: 630112 · fix rounds: 0 · guard denials: 0
open: the menu and download use it with Task 24's remaining scope.

## Task 25a: DOCX builders (no menu) — done (Tailoring S2)
commit: 224bf63 · codex: build 01a1bb97-3fb7-7ab2-a950-78ce5c40c883, review 01a1bb9e-720d-7301-b861-7bb55f37813e · codex tokens: 951860 · fix rounds: 0 · guard denials: 1 (commit message text named the API folder; reworded)
open: ExportMenu entry and download (Task 25 remainder); the photo (Task 26).

## Task 24b: PDF builders with @react-pdf/renderer (no menu) — done (Tailoring S2)
commit: fb0d4ba · codex: build 01a1bba1-9fff-7133-905e-19444d64c4b9, review 01a1bbac-50c2-7123-828a-7417a486b24d · codex tokens: 1763450 · fix rounds: 1 (size limit from the lockfile, plus the `@swc/helpers` pin) · guard denials: 0
open: `exportPdf(kind)`, ExportMenu, `print.css` and the warning (Task 24 remainder); the photo (Task 26); a manual check that the PDF fonts load in the built app (the tests read the `.woff` files from `node_modules`).

## Open (Tailoring S2)
- Task 24 remainder: `ExportMenu.tsx`, `print.css`, `exportPdf(kind)` calling `buildCvPdf`/`buildLetterPdf` and saving with `exportFileName`, the unreviewed-items warning and `export.test.tsx`.
- Task 25 remainder: the DOCX entry in the menu, saving with `exportFileName(..., "docx")`.
- Task 21: produce `LetterDocxInput` + `LetterHeader` for both builders.
- Task 26: draw the photo in `docx.ts` and `pdf.tsx` when `showsPhoto`.
- Under full-suite load two editor tests timed out once inside a Codex build run; every official `-Test` run passed.

## Cost (Tailoring S2)
codex tokens: 3345422 across 6 Codex sessions (24a 630112, 25a 951860, 24b 1763450), not counting the whole-branch review that admits this file · Claude context: ≈60k (estimate) · guard denials: 1
