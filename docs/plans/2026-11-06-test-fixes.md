# Fixes from the local browser test (2026-11-06)

Source: `docs/plans/2026-11-06-local-test-findings.md` (H1, M1, M2, M3).
Branch: `fix/local-test-findings`, one worktree, one PR.

## Task 1: Reproduce the typing loop (H1) in a test

---
files: [apps/web/src/cv/editor.test.tsx]
new_files: []
deps: false
size: 60
---

**Goal.** In the browser, real keystrokes in section fields (Summary textarea, role bullets, education and
language item fields) sometimes throw React's "Maximum update depth exceeded" and the typed character is lost.
The header inputs (name, title, email) were not affected. Stack seen in the browser (Vite dev, line numbers of
transformed code): `PageField.tsx` onChange -> `SummaryEdit.tsx` / `BulletList.tsx` / `ItemField.tsx` ->
`Editor.tsx` dispatch -> `useAutosave.ts` setContent -> React `dispatchSetState` throws. Real keyboard events are
discrete, so React flushes passive effects synchronously after each keystroke; synthetic `input` events typed
15-70 ms apart did not trigger it.

Add tests to `editor.test.tsx` that render the full `Editor` (reuse the file's existing mocks) and type with
`userEvent` (no delay) at least 150 characters into: the Summary field, a role bullet, and an education item
field. Each test asserts the field's final value equals exactly what was typed, and that `console.error` was never
called with a message containing "Maximum update depth".

Do not change any product code in this task. If the tests pass (the loop does not reproduce in jsdom), say so and
list what you tried (typing speed, which fields, with/without the role score and panel mocks).

**Acceptance tests.** The new tests exist and run. Report whether they fail and with what message.

**Out of scope.** Any fix. Other files.

## Task 2: Fix the typing loop (H1)

To be written after Task 1, from what the failing test shows. The fix must be the smallest change that makes
Task 1's tests pass, with no change to how autosave saves.

## Task 3: Empty sections are flagged again after the CV is replaced (M1)

---
files: [apps/web/src/cv/edit/useOpenedSections.ts, apps/web/src/cv/Editor.tsx, apps/web/src/cv/panel/overview.test.tsx, apps/web/src/cv/history.test.tsx]
new_files: []
deps: false
size: 50
---

**Goal.** `Overview.tsx` does not flag a section that is in `opened` (sections added this visit count as present
while still empty). `opened` is never cleared, so after a history restore, an applied import, or "Load latest" in
the conflict banner, sections that are empty in the new content are still not flagged, and the panel says
"Nothing missing. Every key section is filled in."

Give `useOpenedSections` a way to clear the set, and clear it in `Editor` whenever the content is replaced from the
server: after a successful restore (`autosave.reset` in `restore`), after an import is applied (`onApplied`), and
after `loadLatest`. Do not clear it on normal typing or on autosave.

**Acceptance tests.**
- Add a section, leave it empty: it is not flagged (unchanged behaviour).
- Then replace the content via restore (in `history.test.tsx`) with a CV where that section is empty: it is
  flagged as missing.
- Same after an applied import, if the existing editor/history tests make that cheap; otherwise restore alone.

**Out of scope.** Changing which categories count as key sections, the flag texts, or `missingCategories`.

## Task 4: Implausible job deadlines (M2)

---
files: [apps/api/src/jobs/process.ts, apps/api/test/jobs-process.test.ts, apps/web/src/jobs/JobPage.tsx, apps/web/src/jobs/job-page.test.tsx]
new_files: []
deps: false
size: 60
---

**Goal.** For an ad saying "Apply by 30 November 2026" the extraction model returned `applyBy: "3011-11-30"`.
The shared schema only checks it is a valid ISO date, so it was stored and shown as "Apply by 3011-11-30".

1. In `apps/api/src/jobs/process.ts`, after the model's output is validated and before it is stored: if `applyBy`
   is more than 1 year before or more than 2 years after the processing date, store `applyBy: null`. Keep every
   other field. Do not fail the job because of it. Use an injectable or existing clock so tests are deterministic.
2. In `JobPage.tsx`, show `applyBy` as a readable date in the UI locale (e.g. "30 Nov 2026") instead of the raw
   ISO string. Parse the ISO date without timezone shift (a date-only string must not show the previous day).

**Acceptance tests.**
- process: `applyBy` 3011-11-30 -> stored null, title/company kept; a date within range is kept as is.
- page: `applyBy: "2026-12-01"` renders "1 Dec 2026" (or the locale's equivalent), never "2026-12-01".

**Out of scope.** Changing the shared schema, the extraction prompt, or the edit form (it keeps `<input type=date>`).

## Task 5: Rewrites must not add a purpose or outcome (M3)

---
files: [apps/api/src/enrich/focus-prompts.ts, apps/api/test/prompts.test.ts]
new_files: []
deps: false
size: 20
---

**Goal.** Focus mode rewrote "Set up Salesforce and HubSpot reporting shared by sales and marketing." as
"Implement Salesforce and HubSpot reporting to align data visibility between sales and marketing teams." The
prompts already say "do not invent facts", but the model added a purpose the original never stated.

Add one rule to `improveBulletSystemPrompt` in `focus-prompts.ts` (used by `improve.ts` to rewrite an existing
bullet): do not add a purpose, reason or result ("to …", "so that …", "resulting in …") that the original bullet or
the role's notes do not state. Keep the existing tense rule as it is.

**Acceptance tests.** `prompts.test.ts` checks the new rule is present in `improveBulletSystemPrompt`.

**Out of scope.** `rewrite-prompts.ts` (summary only), the brain-dump prompt, the tense rule, scoring prompts,
the eval set (it needs live AI keys; run later by Claude).

## Task 6: Give the job extraction model today's date

---
files: [apps/api/src/jobs/prompts.ts, apps/api/src/jobs/process.ts, apps/api/test/jobs-process.test.ts]
new_files: []
deps: false
size: 30
---

**Goal.** The ad "Apply by 30 November 2026." was extracted twice as `applyBy: "3011-11-30"`. The prompt
(`apps/api/src/jobs/prompts.ts`) never tells the model today's date, so it has nothing to anchor a year on. Task 4's
range check now drops the wrong date, but the correct deadline is lost with it.

1. `buildJobUserPrompt` takes today's date (ISO `YYYY-MM-DD`) and puts one line at the top of the user prompt,
   e.g. `Today's date: 2026-11-06.`
2. Add to `jobExtractPrompt`: write `applyBy` as `YYYY-MM-DD`, copying the year exactly as the page writes it; when
   the page gives a day and month without a year, use the next such date on or after today.
3. `processJob` passes the date from its existing `now` clock (Task 4), so tests stay deterministic.
4. If `JOB_PROMPT_VERSION` is used to tell prompt versions apart (check its uses), bump it to `job.v2`; if it is
   unused or only informational, leave it.

Keep Task 4's range check as a safety net.

**Acceptance tests.**
- The user prompt starts with the date given by the injected clock.
- The system prompt contains the year-copying rule.
- Existing `buildJobUserPrompt` tests still pass (update their calls for the new argument).

**Out of scope.** The extraction schema, other prompt rules, the web app, the eval set (needs live AI keys).
