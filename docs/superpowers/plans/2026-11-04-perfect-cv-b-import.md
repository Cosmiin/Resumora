# Perfect CV · Plan B: import that works for any layout, and the evaluation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import any CV layout (2–3 columns, sidebars, tables, scans, DOCX) into the 15 categories word for word, show where each original heading went, highlight lines that are not found in the file, and prove it on 12 synthetic CVs.

**Architecture:** PDFs go to the model as a file part (it reads the page layout); DOCX still goes as mammoth text. The prompt is built from `categories.ts`. After extraction, a source check compares every copied line with the PDF text layer. The review shows a heading → category table with "Move to" for Other. A manual `npm run eval:import` runs the real pipeline on 12 cases with answer keys.

**Tech Stack:** Cloudflare Worker (Hono), unpdf, mammoth, OpenRouter (`google/gemini-3.1-flash-lite`) then OpenAI (`gpt-5.4-mini`) through `callModel`, zod 4, vitest 5, React 19. Eval only (dev dependencies): `pdf-lib`, `docx`, headless Chrome.

**Spec:** `docs/superpowers/specs/2026-11-04-perfect-cv-design.md`
**Depends on:** Plan A (`SectionKey`, `CATEGORIES`, v2 `CvContent`, `defaultLayout`, `missingCategories`).

## Global Constraints

- Everything in Plan A's Global Constraints applies (Node PATH, checks before commit, plain words, explicit `git add` paths, never stage the other session's files).
- Secrets only in `apps/api/.dev.vars`; never print them. The eval reads keys from there.
- Privacy routing stays on (OpenRouter `provider.data_collection: "deny"` / zdr as today). OpenAI uses `max_completion_tokens`.
- Limits: at most **8 pages**; upload size limit as today; extraction timeout 150 s per attempt (as today).
- The owner's import rules in `prompts.ts` (prompt v2) are kept word for word; v3 only adds the category part and `sourceHeadings`.
- Pass bar for `eval:import` (all 12 cases): every section found and placed correctly; ≥ 95% fields correct; 0 invented lines; 100% word-for-word with diacritics; flags match; each import < 30 s and < $0.01.
- `eval:import` is never run in CI.

## Review Focus

1. **A PDF whose text layer is broken** (letters spaced out, ligatures like "ﬁ") must not mark good lines as invented → source-check test with "ﬁ" ligature and letter-spaced text in Task 6.
2. **A scan** (no text layer) must import, skip the source check, and warn "This file is a scan. Check every line." → test in Task 3 and Task 5.
3. **The provider rejects the PDF file part** (400 about file/content type) must fall back to the text path with a warning, not fail the import → test in Task 5.
4. **A heading the model returns for a category key that doesn't exist** must land in Other, never crash → test in Task 4.
5. **"Move to" on an Other section with blank lines and bullets ("• ", "- ")** must create one clean item per non-empty line → test in Task 7.

---

### Task 1: Check that the providers accept a PDF file part (do this first)

**Files:**
- Create: `apps/api/scripts/check-pdf-input.ts` (kept as a tool; tiny)

- [ ] **Step 1:** Write a script that reads `apps/api/.dev.vars`, builds a one-page PDF with `pdf-lib` (text "Ana Pop, Product Designer, ana@example.com"), and sends one chat completion per provider with `messages[1].content = [{type:"text",text:"Return the email in this PDF."},{type:"file",file:{filename:"cv.pdf",file_data:"data:application/pdf;base64,..."}}]`, using the same privacy routing as `call-model.ts`. Print provider, HTTP status, and the answer text only.
- [ ] **Step 2: Run** it: bundle with esbuild (`node -e "require('esbuild').buildSync({entryPoints:['apps/api/scripts/check-pdf-input.ts'],bundle:true,platform:'node',format:'esm',outfile:'<scratchpad>/check.mjs'})"`), then `node <scratchpad>/check.mjs`.
  Expected: both providers return `ana@example.com`.
- [ ] **Step 3: Record the result** in the spec under "Decisions from review" (one line: date, which providers accepted). If OpenRouter with zdr rejects the file part, stop and tell the user before Task 5. The agreed fallback (text path plus warning) still lets Task 5 proceed, but the user should know.
- [ ] **Step 4: Commit** `chore(api): script to check PDF input per provider` (add `pdf-lib` as a devDependency of `apps/api`).

### Task 2: `callModel` accepts file parts

**Files:**
- Modify: `apps/api/src/ai/call-model.ts`
- Modify: `apps/api/test/call-model.test.ts`

**Interfaces:**
- Produces:
  - `type UserPart = { type: "text"; text: string } | { type: "pdf"; filename: string; base64: string }`
  - `ModelRequest.user: string | UserPart[]`
  - `class AiInputRejectedError extends Error` thrown when **every** provider answers 400/415/422 with a body mentioning `file`, `pdf`, `content type` or `unsupported` (case-insensitive) — such errors are not retried on the same provider.
  - Request mapping for both providers: text → `{type:"text",text}`; pdf → `{type:"file",file:{filename,file_data:"data:application/pdf;base64,"+base64}}`.
  - `ai_calls` logging is unchanged (do not log file bytes).

- [ ] **Step 1: Write failing tests:**
  - `sends a PDF part in the provider's file format` → fake fetch captures the body; `messages[1].content[1].file.file_data` starts with `data:application/pdf;base64,`.
  - `a plain string user message is sent as before` (existing behaviour).
  - `a rejected file part on both providers throws AiInputRejectedError` → both return 400 `{"error":{"message":"File input not supported"}}`.
  - `a rejected file part on OpenRouter falls through to OpenAI` → OpenRouter 400 as above, OpenAI 200 → result returned.
- [ ] **Step 2: Run** `npm test -w apps/api -- call-model`. Expected: FAIL.
- [ ] **Step 3: Implement** the type, the mapping and the error. Keep the file under ~300 lines; if it grows past that, move the message-building into `apps/api/src/ai/messages.ts`.
- [ ] **Step 4: Run** again. Expected: PASS.
- [ ] **Step 5: Commit** `feat(api): send PDF files to the model`.

### Task 3: Page limit and scans in text extraction

**Files:**
- Modify: `apps/api/src/imports/extract-text.ts`
- Modify: `apps/api/test/extract-text.test.ts`

**Interfaces:**
- Produces:
  - `extractText(bytes, format): Promise<{ text: string; pages: number; isScan: boolean }>` (was `Promise<string>`)
  - `MAX_PAGES = 8`; new failure `too_many_pages: "This file has more than 8 pages. Upload your CV on its own."`
  - A PDF whose text has fewer than `MIN_TEXT_CHARS` non-space characters → `isScan: true` (no longer an error). A DOCX with too little text still throws `no_text`. Update the `no_text` message to "We couldn't read text from this Word file."

- [ ] **Step 1: Write failing tests:** `a 9-page PDF fails with too_many_pages`; `an image-only PDF is a scan, not a failure` (make one with `pdf-lib` and an embedded PNG); `a normal PDF reports its page count`; `an empty DOCX still fails with no_text`.
- [ ] **Step 2: Run** `npm test -w apps/api -- extract-text`. Expected: FAIL.
- [ ] **Step 3: Implement** using `getDocumentProxy(bytes).numPages`.
- [ ] **Step 4: Run** again. Expected: PASS.
- [ ] **Step 5: Commit** `feat(api): accept scanned PDFs, limit imports to 8 pages`.

### Task 4: Draft v3, prompt built from the categories

**Files:**
- Modify: `packages/shared/src/imports.ts` (draft schema, `toCvContent`, `ImportResultSchema`)
- Modify: `packages/shared/src/imports.test.ts`
- Modify: `apps/api/src/imports/prompts.ts`
- Create: `apps/api/test/prompts.test.ts`

**Interfaces:**
- Consumes: `CATEGORIES`, `SectionKey`, `defaultLayout`.
- Produces:
  - `ImportDraftSchema` gains: `achievements: string[]`, `volunteering` (same item shape as `experience`), `awards: {name,issuer,date,description}[]`, `courses: {name,provider,date}[]`, `publications: {title,publisher,date,url}[]`, `interests: string[]`, `sourceHeadings: {heading: string; category: string}[]`. (`category` is a plain string in the draft so an unknown key doesn't fail the parse.)
  - `type SourceHeading = { heading: string; category: SectionKey }`
  - `ImportResultSchema` = `{ content, warnings, sourceHeadings: SourceHeading[] (default []), unsourcedLines: string[] (default []), isScan: boolean (default false) }`. The defaults keep old stored results valid.
  - `toCvContent(draft)` returns `ImportResult` with the new lists mapped (ids, clips, dates exactly like the existing lists) and `sourceHeadings` mapped: an unknown category → `"other"`, with a warning.
  - `buildExtractPrompt(): string` in `prompts.ts` = the existing v2 rules + a generated "Categories" part: per `SectionKey`, `- <key>: <label.en> / <label.ro> (also: <synonyms en and ro, comma-separated>)`, + rules: "Place content by meaning, not by heading. Headings not in the list go to the category whose content fits; if none fits, put the section in `custom` with its heading copied exactly." and "List every heading in the file, exactly as written, in `sourceHeadings` with the category its content went to." `extractPrompt` becomes `buildExtractPrompt()`.

- [ ] **Step 1: Write failing tests:**
  - shared: `toCvContent maps achievements, volunteering, awards, courses, publications and interests`; `an unknown sourceHeadings category becomes other with a warning`; `ImportResultSchema accepts an old result without sourceHeadings`.
  - api `prompts.test.ts`: `the prompt names every category and every synonym` (loop over `CATEGORIES`); `the owner's rules are kept` → assert 3–4 key sentences from the current v2 prompt are still present (copy them exactly from `prompts.ts`).
- [ ] **Step 2: Run** `npm test -w packages/shared -- imports && npm test -w apps/api -- prompts`. Expected: FAIL.
- [ ] **Step 3: Implement.** `imports.ts` is near 190 lines; if it passes ~300, move the per-list mapping into `packages/shared/src/import-mapping.ts`.
- [ ] **Step 4: Run** both. Expected: PASS.
- [ ] **Step 5: Commit** `feat(import): prompt v3 built from the category list`.

### Task 5: Pipeline sends the PDF, with fallback

**Files:**
- Modify: `apps/api/src/imports/process.ts`
- Modify: `apps/api/test/process.test.ts`

**Interfaces:**
- Consumes: `extractText` (Task 3), `UserPart`, `AiInputRejectedError` (Task 2), `buildExtractPrompt` (Task 4), `findUnsourcedLines` (Task 6 — implement Task 6 first if running in order is not possible; otherwise stub-call it here and wire it in Task 6).
- Produces: `processImport` flow:
  1. `extractText` → `{text, pages, isScan}`.
  2. Admit: text (first 8,000 chars) when not a scan; the PDF part when it is a scan.
  3. Extract: PDF → `[{type:"text",text:"Organize this CV."},{type:"pdf",filename:"cv.pdf",base64}]`; DOCX → `<document>…</document>` text as today.
  4. On `AiInputRejectedError` for a non-scan PDF: retry the extract with the text path and add the warning "We read this file as plain text, so text from different columns may be mixed. Check the result." For a scan, rethrow as `ImportFailure("ai_unavailable")`.
  5. `isScan` → warning "This file is a scan. Check every line." and `result.isScan = true`.

- [ ] **Step 1: Write failing tests** with the fake model deps already used in `process.test.ts`:
  - `a PDF is sent to the model as a file` (the captured extract request has a `pdf` part).
  - `a DOCX is sent as text`.
  - `a rejected PDF part falls back to text with a warning`.
  - `a scan is admitted from the file and carries the scan warning`.
- [ ] **Step 2: Run** `npm test -w apps/api -- process`. Expected: FAIL.
- [ ] **Step 3: Implement.** Base64 with a chunked `btoa` (Workers have no `Buffer` by default).
- [ ] **Step 4: Run** again. Expected: PASS.
- [ ] **Step 5: Commit** `feat(import): send PDFs as files, fall back to text`.

### Task 6: Source check (lines not found in the file)

**Files:**
- Create: `apps/api/src/imports/source-check.ts`, `apps/api/test/source-check.test.ts`
- Modify: `apps/api/src/imports/process.ts` (fill `unsourcedLines` when not a scan)

**Interfaces:**
- Produces: `normalizeForCheck(s: string): string`; `findUnsourcedLines(content: CvContent, source: string): string[]` (returns original, un-normalised lines; max 50).
- Algorithm (not determined by the tests alone):
  - Normalise: NFKC (turns "ﬁ" into "fi"), lower-case, unify `‐‑‒–—−` → `-`, `‘’‚‛` → `'`, `“”„‟` → `"`, strip bullet marks `•·▪●◦‣*` and leading `-`, collapse whitespace to one space, trim. Do **not** remove diacritics. Also make a "squeezed" version of the source with all spaces removed to catch letter-spaced text.
  - Lines checked: `basics.summary` split into sentences (`/(?<=[.!?])\s+/`), every bullet (experience, volunteering, achievements), `description` of roles, names/titles of items in every list, `custom[].details` split by line, skills, interests.
  - A line passes if its normalised form is a substring of the normalised source, or its squeezed form is a substring of the squeezed source, or ≥ 90% of its words (length ≥ 2) appear in the source **in order** (greedy forward scan over the source's word list). Lines shorter than 3 characters are skipped.

- [ ] **Step 1: Write failing tests:**
  - `a line copied exactly passes`; `a line split across two text-layer lines passes`; `a hyphenated line break passes` ("manage-\nment" vs "management": also join `-\n` in the source before normalising).
  - `a made-up bullet is reported`.
  - `a lost diacritic is reported` (source "Cluj-Napoca, România", CV "Romania").
  - `the ﬁ ligature and letter-spaced text pass` (source "Proﬁle" and "P R O D U C T"; CV "Profile", "PRODUCT").
- [ ] **Step 2: Run** `npm test -w apps/api -- source-check`. Expected: FAIL.
- [ ] **Step 3: Implement**, and in `process.ts` set `result.unsourcedLines = isScan ? [] : findUnsourcedLines(result.content, text)`.
- [ ] **Step 4: Run** `npm test -w apps/api`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(import): highlight lines not found in the file`.

### Task 7: Review shows headings, Move to, flags and unsourced lines

**Files:**
- Create: `packages/shared/src/move-other.ts`, `packages/shared/src/move-other.test.ts`
- Create: `apps/web/src/imports/HeadingMap.tsx`
- Modify: `apps/web/src/imports/ImportSummary.tsx`, `ImportScreen.tsx`, `apps/web/src/i18n/en.ts`
- Modify: `apps/web/src/imports/imports.test.tsx`

**Interfaces:**
- Consumes: `ImportResult` (Task 4), `missingCategories`, `CATEGORY`.
- Produces:
  - `MOVE_TARGETS = ["certifications","courses","awards","interests","languages","projects"] as const`; `moveOtherTo(cv: CvContent, customId: string, target: (typeof MOVE_TARGETS)[number]): CvContent` — splits `details` by line, strips bullet marks and blank lines, one item per line into the target's main text field (`name`, or `title` for publications — not a target; `name` for languages with `level: ""`), removes the custom entry. Pure.
  - `HeadingMap` props: `{ headings: SourceHeading[]; content: CvContent; onMove(customId: string, target): void }` — table columns "In your file", "Placed in", "Items" (count per category), Other rows get a "Move to" `<select>`.
  - `ImportSummary` shows, in order: the scan warning (if any), the heading table, missing flags (gentle wording, from `CATEGORY[key].why`), "We couldn't find these lines in your file:" with the lines (if any), then the existing warnings. The edited content (after Move to) is what Apply sends.

- [ ] **Step 1: Write failing tests:**
  - shared: `moveOtherTo splits lines into items and removes the custom entry` (details `"• B category\n\n- Since 2010"` → 2 items "B category", "Since 2010"); `moving into languages sets an empty level`.
  - web: `the review lists each original heading with its category`; `Move to moves an Other section and Apply sends the moved content`; `unsourced lines are listed`; `a scan shows the scan warning`; `missing sections are flagged under the table`.
- [ ] **Step 2: Run** `npm test -w packages/shared -- move-other && npm test -w apps/web -- imports`. Expected: FAIL.
- [ ] **Step 3: Implement.** All new UI text goes in `en.ts`. Style with the existing tokens (mockup 2).
- [ ] **Step 4: Run** the full check. Expected: green.
- [ ] **Step 5: Commit** `feat(web): show where each heading went in the import review`.

### Task 8: The 12 evaluation cases

**Files:**
- Create: `apps/api/eval/import/generate.ts` (builds all cases)
- Create: `apps/api/eval/import/templates/<case>.html` (11 HTML templates) and `apps/api/eval/import/templates/docx-tables.ts`
- Create: `apps/api/eval/import/cases/<case>/expected.json` (answer keys, hand-written) and the generated `cv.pdf` / `cv.docx` (checked in)
- Modify: `apps/api/package.json` (devDependencies `pdf-lib`, `docx`; script `"eval:generate"`)

**Interfaces:**
- Produces: case folders named `01-one-column`, `02-two-column`, `03-three-column`, `04-colour-sidebar`, `05-layout-tables`, `06-icon-headings`, `07-romanian`, `08-odd-headings`, `09-no-skills`, `10-scan`, `11-docx-tables`, `12-long-four-pages`. `expected.json` = `{ "content": <CvContent v2 without ids>, "headings": SourceHeading[], "flags": Flag[] }`.
- Rules: invented people only, `example.com` emails, `+40 700 000 0xx` phones. The Romanian case uses ș, ț, ă, î, â in names, headings and bullets. Case 08 uses headings like "What I've built", "Toolbox", "Where I studied", "Hobby-uri". Case 09 has no skills section (expect a skills flag). Case 10 = case 04 rendered to PNG and wrapped in an image-only PDF with `pdf-lib`. Case 11 uses a 2-column Word table for layout.
- PDFs are printed with headless Chrome: `"C:/Program Files/Google/Chrome/Application/chrome.exe" --headless --disable-gpu --no-pdf-header-footer --print-to-pdf=<out> <file:///template.html>`; PNG with `--screenshot --window-size=1240,1754`.

- [ ] **Step 1:** Write the templates and answer keys together (the key is copied from the template text, so they match by construction).
- [ ] **Step 2: Run** `npm run eval:generate -w apps/api`. Expected: 12 folders, each with a file and `expected.json`; case 10's PDF has no text layer (`extractText` gives `isScan: true`).
- [ ] **Step 3: Commit** `test(import): twelve synthetic CVs with answer keys`.

### Task 9: `npm run eval:import`

**Files:**
- Create: `apps/api/eval/import/run.eval.ts`, `apps/api/eval/import/score.ts`, `apps/api/eval/import/score.test.ts`
- Create: `apps/api/vitest.eval.config.ts` (includes only `eval/**/*.eval.ts`, timeout 10 min, reads `.dev.vars` into `process.env`)
- Modify: `apps/api/package.json` (`"eval:import": "vitest run --config vitest.eval.config.ts"`), root `package.json` (`"eval:import": "npm run eval:import -w apps/api"`)

**Interfaces:**
- Produces: `scoreCase(expected, actual: ImportResult): { sectionsOk: boolean; fieldAccuracy: number; invented: string[]; diacriticsOk: boolean; flagsOk: boolean }`. Field accuracy = matching leaf strings / expected leaf strings, compared after whitespace collapse only (case and diacritics must match). Items are matched by best title/name match, not by position. `invented` = actual leaf strings with no source in the template text (reuse `findUnsourcedLines` against the template's text).
- The runner calls `processImport` with real `providersFromEnv`, times each case, reads cost from the `ai_calls` entries the fake logger captures (tokens × the provider's price per token; put prices in one constant with a comment and the date), and prints one row per case plus totals and PASS/FAIL against the pass bar.

- [ ] **Step 1: Write failing tests** for `scoreCase` (unit, runs in normal `npm test`): `identical content scores 1.0`; `a missing bullet lowers accuracy`; `a changed diacritic fails diacriticsOk`; `items in a different order still match`.
- [ ] **Step 2: Run** `npm test -w apps/api -- score`. Expected: FAIL.
- [ ] **Step 3: Implement** `score.ts`, then `run.eval.ts`.
- [ ] **Step 4: Run** `npm test -w apps/api -- score` (PASS), then `npm run eval:import` and save the printed table.
- [ ] **Step 5: Commit** `test(import): manual evaluation of the import pipeline`.

### Task 10: Reach the pass bar

- [ ] **Step 1:** If any case fails, change **only** the generated category part of the prompt, the synonyms in `categories.ts`, or `toCvContent` mapping. Keep the owner's rules as they are. Re-run `npm run eval:import` after each change.
- [ ] **Step 2:** If a case can't pass after three rounds, stop and report the case, the failing check and the model output to the user. Don't loosen the pass bar.
- [ ] **Step 3:** Write the final table into `apps/api/eval/import/RESULTS.md` (date, models, per-case rows, totals).
- [ ] **Step 4: Commit** `test(import): evaluation results`.

### Task 11: Decision record

- [ ] **Step 1:** `docs/decisions/NNNN-cv-files-go-to-the-model-as-files.md` (next free number): PDFs are sent as files so the model sees the layout; DOCX stays text; text-path fallback with a warning; every copied line is checked against the text layer. `affects: [file:apps/api/src/imports/process.ts, file:apps/api/src/imports/source-check.ts, file:apps/api/src/ai/call-model.ts]`, `concepts: [queue]`.
- [ ] **Step 2: Commit** only that file: `docs: decision record for sending CV files to the model`.
