# Tailoring writes only for what is missing, and never guesses in a role

Step 1 of the three-screen flow (design: `tailor-three-screens-design-2026-11-27.md` in the workspace folder; the owner's picks of 27 Nov).

Seen on the live site on 27 Nov (job "Lifecycle Operations Lead", base match 89, must-haves 12 of 12 before tailoring): 4 of 8 suggested lines only pushed "operational workflows" and "workflow and data processing systems", two must-haves the CV already covered; the role that got only such a line gained 0 points. Cause: a role step sends the model every job requirement and tells it to "reword bullets with the job's exact keywords". The same run asked "Did you do this in this role?" about "maintained standard operating procedures" and "monitor queue health", both already answered: `confirmedIn` treats "maintained" and "maintain" as different words.

The owner's rules: a line changes only where it is needed (a gap the person confirmed, a gap the item already states in other words, a similar tool the person named); nothing unconfirmed is written into a role.

This plan changes the writing only. The screens stay as they are; steps 2 to 4 of the design come in later plans.

## Task 1: A role step is sent only the open gaps

```
files: apps/api/src/tailor/section-prompts.ts, apps/api/src/tailor/section-pass.ts, apps/api/test/tailor-section.test.ts
new_files: apps/api/src/tailor/gaps.ts, apps/api/src/tailor/gaps.test.ts
deps: none
size: ~70 lines
```

**Goal.** For the role sections (`experience`, `projects`), the writing step works from the job's open gaps instead of all its requirements.

- `gaps.ts`: `openGaps(base, tailored, job)` returns the labels still open: from the Base score, every label whose status is not `met`, or that is `met` but `inferred`; minus the labels the latest tailored score has as `met` and not inferred (requirement labels count only when the tailored score's `requirementTexts` equal the job's, as `askQuestions` already checks; keyword refs compare case-insensitively). Each gap is `{ ref, kind, text, status }`, where `text` is the requirement's text or the keyword.
- `passProposals`, role sections only: reads the Base score and the run's tailored score, and passes `gaps` to `sectionUserMessage`. The message then carries `job: { title, summary, gaps }` with no `requirements` and no `responsibilities`.
- No open gap: no model call; the step returns no proposals (the role keeps its Base wording).
- No Base score stored (old jobs): as today, with `requirements` and `responsibilities`.
- `SECTION_RULES.experience`, and the volunteering and project rules in `SECTION_RULES.projects`: the line "Reword bullets with the job's exact keywords inside natural sentences" and "Condense old or less relevant roles…" go. In their place: change a bullet only so that it shows one of the gaps under `job.gaps` which this item's own bullets, notes or answers state; use the gap's own words inside a natural sentence; keep every fact the bullet has (tools, numbers, scope); leave out any bullet that would not show a gap; with no gap this item can show, return no proposals.
- Skills, summary and the lighter sections are untouched.

**Acceptance tests.**
- `gaps.test.ts`: a `missing` and a `partial` label are gaps; a `met` one is not; a `met` + `inferred` one is; a gap the tailored score has as `met` is gone; a requirement label is not closed by a tailored score whose `requirementTexts` differ; a keyword closes whatever its case.
- `tailor-section.test.ts`: a role step's user message has `job.gaps` with only the open labels and has no `requirements`; with no open gap the model is not called and the proposals are empty; with no Base score the message has `requirements` as before; the summary step's message still has `requirements`.
- `tailor-section.test.ts`: the experience prompt contains the new rule and neither "exact keywords inside natural sentences" nor "Condense old".

## Task 2: Nothing unconfirmed goes into a role line

```
files: apps/api/src/tailor/section-prompts.ts, apps/api/src/tailor/section-pass.ts, apps/api/src/tailor/section-pass.test.ts, apps/api/test/tailor-section.test.ts
new_files: none
deps: Task 1
size: ~40 lines
```

**Goal.**
- `stem` also folds verb endings, so a confirmed answer counts whatever the verb form: "maintained", "maintaining", "maintains" and "maintain" are one word; so are "monitor" / "monitoring", "tracked" / "track", "used" / "use". Words of 3 letters or fewer stay as they are.
- Role sections: a proposal the model marks `inferred` is kept only when every guessed phrase stands in what the person confirmed or the item already says (`confirmedIn`, as today: it then becomes a plain rewording). A proposal with an open guessed phrase, or marked inferred with no phrases, is dropped: its line keeps the Base wording. Dropped guesses are logged as `tailor guesses dropped` with the section, the count and the item ids only (no CV text), and are not counted in `removed`.
- The section prompt, role sections: principle 6 says that in a role, a project or a volunteering role nothing is inferred: a gap is written only where the item's bullets, notes or answers state it; otherwise the bullet is left out.
- Skills and the summary keep their guesses as today.

**Acceptance tests.**
- `section-pass.test.ts`: `confirmedIn("maintained standard operating procedures", ["Did you also maintain the standard operating procedures for these workflows? Yes"])` is true; `confirmedIn("monitor queue health", ["Do you have experience monitoring and maintaining queue health? Used queue health"])` is true; `confirmedIn("tracked quality signals", ["Used queue health"])` is false.
- `tailor-section.test.ts`: in a role step, a proposal with an unconfirmed guessed phrase is not returned and the log has one `tailor guesses dropped` entry without CV text; the same proposal with the phrase confirmed by an answer is returned with `inferred: false` and no `inferredParts`; in the summary step a guess is kept as today.

## Trial (after Task 2, before any later step)

Not a build task. The owner asked for the new writing to be tried on a real job before changes are applied by default.

1. `npm run eval:tailor` before and after (real AI, a few cents; keys read through `EVAL_DEV_VARS`, never printed). Expect no invented facts, and far fewer changed lines: the eval answers no questions, so the Score 1 → 2 lift will fall. That is the intended effect of "nothing unconfirmed", not a regression; report it plainly.
2. After merge and publish, the owner tailors the same job again and we compare with the 27 Nov run: how many lines changed, which gaps they close, how many he would keep.

## Later (own plan, after the trial)

- A new line for a confirmed gap when no existing line fits (the owner, 27 Nov: allowed, rewording first). It needs a new item kind in the role step, the accept step and the web's changed-line marks.
- Steps 2 to 4 of the design: skip and parallel, one questions screen, one final page.
