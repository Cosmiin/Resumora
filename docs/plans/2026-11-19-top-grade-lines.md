# Top-grade lines (score/12)

Owner's decisions, 19 Nov 2026:
- **A.** Every line the AI writes aims for the top grade on all five parts, not the role's line average.
- **B.** Answer options must give a gradeable fact. A result option can carry a blank ("Increased sales by …%"):
  picking it shows amount chips chosen by the AI for that question, or the person types the number.
  A blank left empty is dropped when the answer is saved.
- **C.** A line held back at the end shows the one question that would make it top grade, on its own card:
  "Add with this fact", "Add as it is", "Edit it first".
- **Length.** A line may be up to 440 characters (was 220). 440 is the most.

Out of scope: the "Some changes could not be prepared" error (being diagnosed separately from live request logs);
tailoring's writers; the open points of PR #74.

Blank marker: the single character `…` (U+2026) inside an option. At most one per option.

## Task 1: Lines up to 440 characters
scope:
  files: [packages/shared/src/enrich.ts, packages/shared/src/enrich.test.ts, apps/api/src/enrich/prompts.ts, apps/api/src/enrich/grade-context.test.ts, apps/api/src/enrich/use-answers.test.ts, apps/api/src/enrich/shape.test.ts]
  new_files: []
  deps: []
  size: 60

- `CONCISE_CHARS` becomes `{ partial: 440, missing: 440 }`: a line up to 440 characters can be concise "specific";
  over 440 it is "missing". Update its comment.
- `GRADING_RULES`, Concise: "Every phrase carries a fact, in two lines at most." becomes "Every phrase carries a fact,
  within 440 characters." Keep the rest. Same wording in the `concise` schema comment.
- `SCORE_POLICY` → `"score/12"` (stored scores are re-read under the new rule).
- Everything that reads `CONCISE_CHARS.partial` (writers' limit in `gradeContext`, `use-answers.ts`, Shape merges)
  follows on its own; adjust tests that pin 220/221 to 440/441.
- The hash guard in `grade-context.test.ts` blanks `GRADING_RULES` and the policy line; update `REST` only if it
  changes, and say why in the progress block.

- [ ] Step 1: failing tests: `conciseGrade` on a 440-char line keeps "specific", a 441-char line is "missing"; a
  use-answers line of 441 chars is dropped and one of 440 kept.
- [ ] Step 2: run → FAIL. Step 3: implement. Step 4: `npm test`, `npm run typecheck`, `npm run lint` → PASS.
- [ ] Step 5: commit "Lines up to 440 characters (score/12)".

## Task 2: Writers aim for the top grade
scope:
  files: [apps/api/src/enrich/grade-context.ts, apps/api/src/enrich/grade-context.test.ts, apps/api/src/enrich/brain-dump.ts, apps/api/src/enrich/brain-dump.test.ts, apps/api/src/enrich/use-answers.ts, apps/api/src/enrich/use-answers.test.ts, apps/api/src/enrich/improve.ts, apps/api/src/enrich/improve.test.ts, apps/api/src/enrich/shape.ts]
  new_files: []
  deps: [1]
  size: 60

- `gradeContext`'s closing instruction becomes, in substance: "Use the answers and the page. Write every line to
  reach specific on all five parts (contribution, clarity, specificity, impact, concise). A part may stay below
  specific only when the fact it needs is in neither the page nor the answers: never invent one. Stay within 440
  characters." (440 from `CONCISE_CHARS.partial`.)
- Remove "Each new line must reach at least the role's line average." from `brain-dump.ts` and `use-answers.ts`
  (the bar now comes from `gradeContext`). The line average stays in `<grades>` as information.
- Check `improve.ts` and `shape.ts` for their own length or bar wording and align it to the same rule.

- [ ] Step 1: failing tests: the user message `gradeContext` builds contains the top-grade instruction and no "line
  average" bar; the brain-dump-from-answers and use-answers requests no longer contain "must reach at least the role's
  line average".
- [ ] Step 2–4 as above. Step 5: commit "Writers aim for the top grade".

## Task 3: Gradeable options, with a blank and its amounts
scope:
  files: [packages/shared/src/enrich.ts, packages/shared/src/enrich.test.ts, apps/api/src/enrich/prompts.ts, apps/api/src/enrich/score.ts, apps/api/src/enrich/score.test.ts]
  new_files: []
  deps: [1]
  size: 140

**Produces:** `amounts: string[]` (≤ 4, each ≤ 20 chars) on `ModelBulletSchema`, on each `roleQuestions` item of
`ModelScoreSchema`, on `QuestionSchema` and on `RoleQuestionSchema`. Optional on stored results (older results read
as `[]`). In the model schema it must stay in the form OpenAI's strict mode accepts (see the fallback fix in PR #72:
required + nullable rather than optional, if that is what the other fields do).

Prompt (score prompt's ACTIONABLE FEEDBACK / options rules, and the "as close to 100" questions prompt):
- Each option, picked on its own, must give the line the fact that makes the asked part specific. Vague results
  ("Faster", "Lower cost", "Improved efficiency") are not allowed as options.
- A result or scale option may carry one blank `…` for the amount, such as "Increased sales by …%" or "Cut
  returns by …%". When any option has a blank, `amounts` gives 3–4 ranges for it, such as "Under 10", "10–25",
  "25–50", "50+" (no unit; the option holds it). Otherwise `amounts` is [].
- The Results row of the topic table becomes concrete: "Increased sales by …%, Orders shipped same day, Cut returns
  by …%". The purpose question's options name a concrete aim, not "To increase sales".
- `score.ts` passes `amounts` through to the stored questions; drops `amounts` when no option has a blank; drops an
  option with more than one `…`.

- [ ] Step 1: failing tests: schema accepts and defaults `amounts`; score passes amounts through; amounts dropped
  when no option has a blank; an option with two blanks dropped; the prompt text contains the blank rule and no
  "Faster, Fewer errors, Lower cost" row.
- [ ] Steps 2–4. Step 5: commit "Gradeable options with a blank and its amounts".

## Task 4: Blank options in the answer box
scope:
  files: [apps/web/src/cv/enrich/AnswerBox.tsx, apps/web/src/cv/enrich/answer-box.test.tsx, apps/web/src/i18n/en-basecv.ts, apps/web/src/cv/enrich/EnrichPath.tsx, apps/web/src/styles.css]
  new_files: []
  deps: [3]
  size: 140

- A question with `amounts` and an option holding `…`: picking that option adds it to the answer as today, and shows
  "How much?" with the amount chips and "or type it". A chip replaces the `…` of the picked option in the answer
  text. The person may also type over `…` directly. Picking the option again removes it, filled or not.
- The amount row shows while the answer still holds a picked blank option with `…` unfilled.
- When the answer is saved as a note (`EnrichPath` and every other place that saves AnswerBox answers: find them with
  `tools/who-uses.ps1` or grep for `setNote`), a `", "`-piece that still contains `…` is dropped; an answer left
  empty by that is not saved.
- i18n keys in every language file that has the enrich keys: "How much?", "or type it".
- Use the existing chip styles (`answer-opt`); no new visual language.

- [ ] Step 1: failing tests: picking the blank option shows the amount chips; a chip fills the blank; typing a
  number over `…` works; unpicking removes the filled piece; an unfilled blank piece is not saved.
- [ ] Steps 2–4. Step 5: commit "Blank options: pick an amount or type it".

## Task 5: A held line asks for its missing fact
scope:
  files: [packages/shared/src/enrich-shape.ts, apps/api/src/enrich/check-changes.ts, apps/api/src/enrich/check-changes.test.ts, apps/web/src/cv/enrich/EndStep.tsx, apps/web/src/cv/enrich/end-step.test.tsx, apps/web/src/cv/enrich/EnrichPath.tsx, apps/web/src/cv/enrich/enrich-path.test.tsx, apps/web/src/i18n/en-basecv.ts]
  new_files: []
  deps: [3, 4]
  size: 220

**Produces:** `CheckChangesAnswer.asks: { changeId: string; text: string; options: string[]; amounts: string[] }[]`
(default []), one per held change whose graded line has a question: from the first grading, the question of the
line the change targets (`bulletId` for a rewrite, the change's own id for a new line). No extra model call.

Web, `EndStep` held card:
- With an ask: title "One fact away" (i18n), the line, the question, an `AnswerBox` with its options and amounts, and
  buttons "Add with this fact" (enabled when the answer is not empty), "Add as it is" (today's Add anyway),
  "Edit it first" (today's).
- Without an ask: today's card.
- "Add with this fact" in `EnrichPath`: save the answer as a role note (same `setNote` as other answers, dropping an
  unfilled blank as in Task 4), wait for the save, then `placeAnswersOnCv({ roleId, fingerprint, changes: [held],
  questions: [ask.text] })`, combine with `withPlaced`, then `checkChanges({ ..., hold: false })`, apply the kept
  changes and show the predicted score (`onScore`), and remove the card. A 409 or a failure leaves the card with an
  error line (i18n: "Couldn't add it. Try again.") and keeps "Add as it is".

- [ ] Step 1: failing tests: API: a held new line gets an ask with its grader question, options and amounts; a held
  rewrite gets the ask of its bullet; a held change with no question gets none. Web: the card shows the question and
  options; "Add with this fact" saves a note and calls use-answers then check-changes with `hold: false`; failure
  shows the error and keeps the card.
- [ ] Steps 2–4. Step 5: commit "A held line asks for its missing fact".

## Task 6: Real-AI check (not committed)
Temporary `apps/api/eval/top-grade/*.eval.ts`, run as in the PR #74 hand-over, deleted afterwards.
- On the Vevol and payroll test roles: new lines from answers (brain dump and use-answers) — share graded 100, and
  average grade, before (main) vs after.
- Options from 5 score runs: share of result options that are concrete or carry a blank; every blank option comes
  with amounts.
- Record numbers in the progress file.

## End of part
Whole-branch Opus review, push, draft PR. No merge, no publish, no hosted-database change without the owner.
