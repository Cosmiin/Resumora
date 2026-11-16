# Tailoring: each role's prompts see only that role

Group A of the 2026-11-10 manual test (points #9, #10, #11; #2 for the tense check). Feature tag: `tailoring-role-scope`.
Built with `codex-build`: one worktree, tasks in order (tasks 1–2 share `questions.ts`, tasks 3–4 share `section-pass.ts`, task 6 touches prompts from tasks 1, 3 and 5).
The investigation behind it is in the private workspace (`tailoring-prompt-map-2026-11-10.md`). All examples and test fixtures here are fictional.

What went wrong, in short: a role's question prompt received every other role (bullets and saved answers), the same job-wide gap list for every role, the focus roles by name, and no rule about the role's dates. So a 2014 sales role was asked about LLMs and about another employer by name. Rewrites and their fact check received every role's answers. The score is capped at 69 by any unmet must requirement and its labels flip between rescores.

Owner-decided behaviour:
1. A role's questions see only that role and the job ad: the role's own bullets, description, dates and saved notes (enrichment notes, including the brain dump, and earlier job answers), plus the steering (tone, draws, fit, instruction, and whether this role is a focus role). No other role, project or employer.
2. The AI may skip a requirement that can't fit the role's dates or kind of work. A requirement the tailored CV already meets is not asked again in later roles.
3. The prompt states the role's period and tells the AI to ask only about tools and practices that fit it. No hard code rule.
4. Focus roles decide how many questions a role gets. Their names never appear in another role's prompts.
5. A role's rewrite, and its fact check, use only that role's bullets, notes and answers. Summary, skills and layout still see every role.
6. Every note sent to an AI carries its role's period, and prompts say a note describes that period, not today. Notes keep being reused for later jobs.
7. The job note ("Your thoughts on this role", `jobs.user_thoughts`) is removed from the product.
8. The 69 cap stays. The tailoring header says which must requirements hold it there, with a short reassurance. A requirement stays "met" across rescores unless the CV text behind it is gone.
9. No AI-made "Other"-style option next to the screen's own "Something else": the prompt forbids it and code removes any that slip through.
10. A past role's suggested bullet must not start in the present tense: retry once, then don't offer it.

Owner's choices on the approval page (2026-11-10): non-focus roles get **up to 2** questions; the `user_thoughts` column is **dropped**; all 7 tasks approved. Owner's note on older roles: their questions should only help the bullets show value relevant to the job, without overdoing it; no question is fine.

## Task 1: Role questions see only their role

---
files: [apps/api/src/tailor/question-prompts.ts, apps/api/src/tailor/questions.ts, apps/api/src/tailor/steering.ts, apps/api/test/tailor-questions.test.ts, apps/api/test/tailor-steering.test.ts]
new_files: []
deps: false
size: 80
---

**Goal:** in a role step (Experience, Projects & volunteering), the `tailor_questions` user message describes only the current item.
- `questionUserMessage` for a role step sends `role` (the item with its kind, title, company, dates, `current`, description, bullets and notes), `language` (the CV's `locale`), `section`, `max`, `steering`, `gaps`, `answered` and `job` (title, summary, responsibilities). It sends **no `cv` field**. Other sections keep today's payload (`cv` as now, no `role`). `aboutItem` is no longer needed for the prompt.
- `steeringText(steering, cv, roleId?)`: with a `roleId` and a non-empty `focusRoleIds`, the "Lean most on these roles: …" line is replaced by "This role is one of the roles they want to lean on most." or "They want to lean on other roles more than this one."; with an empty focus list, no focus line. Without `roleId`, output is unchanged. Role-step questions pass the role id.
- `questionSystemPrompt`, replacing the line that calls other roles read-only context:
  - "In experience and projects, ask only about "role". Never mention another employer, role, project or "your previous roles"."
  - "The role ran from its startDate to its endDate, or is current. Ask only about tools, methods and practices that fit that period and that kind of work. Skip a gap the role can't plausibly show; returning fewer questions, or none, is fine."
  - "Never add an option meaning other, something else or none of the above: the screen adds its own."
- Code drops an option when, after trimming, removing one trailing parenthetical ("(please specify)") and trailing punctuation, it equals (case-insensitive) `other`, `others`, `something else` or `none of the above`. A question left with fewer than 2 options keeps the rest (the person can still type or speak).

**Acceptance tests:**
- test: an Experience role step for role B of a fictional 3-role CV sends a user message whose JSON has no `cv` key, and whose text contains none of roles A and C's companies, bullets or note answers.
- test: the same message contains role B's startDate, endDate, bullets and its own notes (one enrichment note and one job note).
- test: a Skills question request still sends `cv` with every role.
- test: `steeringText` with focus ids [A] and roleId B contains "They want to lean on other roles more than this one." and neither A's title nor company; with roleId A it contains "This role is one of the roles they want to lean on most."; without roleId it still lists "Lean most on these roles: …" as today.
- test: model options ["Yes", "No", "Other (please specify)", "Something else."] are stored as ["Yes", "No"]; "Other teams in the region" is kept.
- test: the system prompt contains the period sentence and the "Never mention another employer" sentence.

**Out of scope:** gap selection and question counts (Task 2), rewrites, the web app, non-role sections' prompts.

## Task 2: Which gaps each role gets, and how many questions

---
files: [apps/api/src/tailor/questions.ts, apps/api/test/tailor-questions.test.ts]
new_files: []
deps: false
size: 40
---

**Goal:** later roles don't re-ask what the tailored CV already shows, and focus roles get more questions than the rest.
- In a role step, a gap is left out when the latest tailored score (`getScore(jobId, "tailored", run.tailoredCvId)`) labels it `met` with `inferred: false`. With no tailored score yet, today's rule applies.
- Per-role cap: when the run's steering has a non-empty `focusRoleIds`, a focus role keeps `MAX_ROLE_QUESTIONS` (5) and any other role gets `NON_FOCUS_ROLE_QUESTIONS` = 2. When the role isn't a focus role, the user message also carries `focus: false`, and the system prompt says: "For a role that isn't a focus role, ask only what helps its bullets show value for this job. Don't stretch; no question is fine." With no focus roles, every role keeps 5. (Today the steering is read after the cap is computed; read it first.)

**Acceptance tests:**
- test: gap r2 is `missing` in the base score and `met` (not inferred) in the latest tailored score; a later role's request gets no r2 gap in the prompt.
- test: a gap `met` but `inferred: true` in the tailored score is still offered.
- test: with no tailored score, the gaps are those of the base score, as today.
- test: with focusRoleIds [A], a request for role B asks the model for at most 2 questions (`max: 2`, `focus: false`) and stores at most 2; role A gets up to 5 and no `focus: false`.
- test: the system prompt contains the "isn't a focus role" sentence.
- test: with no focus roles, every role gets up to 5.

**Out of scope:** the run-wide cap of 8 for other sections, the score itself (Task 7), the steering screen.

## Task 3: A role's rewrite uses only that role

---
files: [apps/api/src/tailor/section-pass.ts, apps/api/src/tailor/section-prompts.ts, apps/api/test/tailor-section.test.ts, apps/api/test/tailor-projects.test.ts]
new_files: []
deps: false
size: 60
---

**Goal:** a role step's `tailor_section` and `tailor_verify` calls, and the code checks, see only the item being edited.
- `sectionData` for experience and projects returns `{ edit: [item] }` with no `context` (no other roles, projects or volunteering). Skills, summary and layout are unchanged.
- `answers` in a role step: only answers to non-flag questions whose `roleId` is that role. Other sections: all non-flag answers, as today.
- `sources` (for `tailor_verify` and `checkProposal`) in a role step: the texts of that item (its fields, bullets, notes, facts) plus its answers. Other sections unchanged.
- Role steps pass the role id to `steeringText` (Task 1's signature).
- `sectionSystemPrompt`: the experience and projects rules gain "Use only this item's own bullets, notes, facts and answers." The `edit`/`context` sentence stays for the sections that still send context.

**Acceptance tests:**
- test: an Experience pass for role B sends `items` with B only; no other role's company or bullet text appears in the user message.
- test: the run has answers for questions on roles A and B; the pass for B sends only B's answer.
- test: a proposal for B naming a tool that appears only in role A's bullets is flagged `tool` and, still flagged after the retry, dropped.
- test: a Summary pass still sends every role as context and every answer.
- test: the steering block in a role pass contains no other role's name.

**Out of scope:** layout, letter, accept, redo's own logic (it calls `passProposals` and inherits the change), the web app.

## Task 4: Past roles keep past tense

---
files: [packages/shared/src/tense.ts, packages/shared/src/tense.test.ts, packages/shared/src/index.ts, packages/shared/src/tailor.ts, apps/api/src/enrich/improve.ts, apps/api/src/enrich/improve.test.ts, apps/api/src/tailor/checks.ts, apps/api/src/tailor/checks.test.ts, apps/api/src/tailor/section-pass.ts, apps/api/src/tailor/section-prompts.ts]
new_files: [packages/shared/src/tense.ts, packages/shared/src/tense.test.ts]
deps: false
size: 80
---

**Goal:** a suggested bullet for a role that has ended doesn't start with a present-tense verb (English CVs).
- `startsInPresentTense(text: string, locale: Locale): boolean` in `packages/shared/src/tense.ts`. Only `en`; any other locale returns false. Take the first word (letters and hyphens), lowercased. False when it ends in `ed`, or is one of: led, built, ran, made, won, grew, drove, set, wrote, took, began, brought, bought, sold, taught, kept, held, met, oversaw, spent, sent, cut, put, found, gave, saw, chose, became, went, got, left, lost, paid, read, rebuilt, rewrote, undertook, withdrew, understood, thought, told, sought, spoke, stood, fought, flew, hired, shaped. Otherwise true.
- A role is past when `current` is false and `endDate` is non-empty.
- Enrichment improve-bullet (`improve.ts`): when the role is past and the suggestion starts in the present tense, ask the model once more with the same messages plus "The role has ended: start with a past-tense verb."; if the second answer still does, return `needsDetail` (no proposal).
- Tailoring: `TailorFlagSchema` rule gains `"tense"`. `CheckContext` gains `pastRole?: boolean` and `locale`; `checkProposal` flags `{ rule: "tense" }` for a `text` or `description` field of a past role that starts in the present tense. `passProposals` sets them for experience and projects steps, so the existing retry-then-drop applies. The experience and projects rules in `sectionSystemPrompt` gain "A role that has ended keeps past tense; only a current role uses present tense."

**Acceptance tests:**
- test: `startsInPresentTense("Validate compliance with legal teams", "en")` is true; "Ensured compliance…", "Led a team…", "Oversaw…" are false; any text with locale "ro" is false.
- test: improve-bullet on a past role whose fake model answers "Validate …" then "Validated …" returns the second text.
- test: improve-bullet whose fake model answers present tense twice returns `needsDetail: true` and no proposal.
- test: improve-bullet on a current role accepts "Validate …" unchanged.
- test: a tailoring proposal "Coordinate partner onboarding" for a past role's bullet is flagged `tense`; for a current role it isn't.

**Out of scope:** brain dump, role descriptions, summary tense, non-English tense rules.

## Task 5: Remove the job note

---
files: [packages/shared/src/jobs.ts, packages/shared/src/jobs.test.ts, apps/api/src/jobs/repo.ts, apps/api/src/jobs/memory-repo.ts, apps/api/src/jobs/supabase-repo.ts, apps/api/test/jobs.test.ts, apps/api/src/tailor/letter.ts, apps/api/src/tailor/letter-prompts.ts, apps/api/test/tailor-letter.test.ts, apps/api/test/tailor-retailor.test.ts, apps/web/src/jobs/JobPage.tsx, apps/web/src/jobs/JobThoughts.tsx, apps/web/src/jobs/jobs-api.ts, apps/web/src/jobs/jobs-api.test.ts, apps/web/src/jobs/job-page.test.tsx, apps/web/src/jobs/job-edit.test.tsx, apps/web/src/cv/enrich/voice-look.test.tsx, apps/web/src/i18n/en-jobs.ts, apps/web/src/tailor/CoverLetterTab.tsx, apps/web/src/tailor/cover-letter.test.tsx, apps/web/src/i18n/en-tailor.ts, supabase/migrations/20261110130000_drop_job_thoughts.sql, supabase/tests/database/tailoring.test.sql]
new_files: [supabase/migrations/20261110130000_drop_job_thoughts.sql]
deps: false
size: 165
---

**Goal:** the job page no longer offers "Your thoughts on this role", and nothing reads or writes `userThoughts`.
- Delete `JobThoughts.tsx` and its use on the job page, its `job.thoughts.*` strings, and the cover letter's "letter.thoughts" line.
- Remove `userThoughts` from the shared job and patch schemas, the jobs repos and API, and the web jobs API. A PATCH body that still carries `userThoughts` (an old tab) is rejected like any unknown field, or ignored: follow how the patch schema treats unknown keys today.
- The cover letter prompt no longer has `thoughtsOnTheRole`, and its fact check no longer lists the note as a source.
- Database (owner's choice): a new migration `supabase/migrations/20261110130000_drop_job_thoughts.sql` drops `jobs.user_thoughts` (`alter table public.jobs drop column if exists user_thoughts;`). Saved notes are deleted; the owner accepted that. The database test that checks the 2000-character limit on it is removed.

**Acceptance tests:**
- test: the job page for a ready job shows no thoughts box and no voice button for it.
- test: the cover-letter request's user message has no `thoughtsOnTheRole` key.
- test: GET /v1/jobs/:id returns no `userThoughts` field.
- test: the voice tests that used the thoughts box still cover the voice controls through another screen, or are removed if that was their only subject.
- typecheck passes.
- db test: after the migration, `public.jobs` has no `user_thoughts` column.

**Out of scope:** "Why this company" on the cover letter, the extension, other job fields.

## Task 6: Notes carry their role's period

---
files: [packages/shared/src/cv.ts, packages/shared/src/cv.test.ts, apps/api/src/tailor/strip-header.ts, apps/api/src/tailor/strip-header.test.ts, apps/api/src/tailor/question-prompts.ts, apps/api/src/tailor/section-prompts.ts, apps/api/src/tailor/layout-pass.ts, apps/api/src/tailor/letter-prompts.ts, apps/api/src/enrich/achievements.ts, apps/api/src/enrich/achievements.test.ts, apps/api/src/enrich/skills-prompts.ts, apps/api/src/enrich/skills.test.ts, apps/api/src/enrich/rewrite-prompts.ts, apps/api/src/enrich/rewrite.test.ts]
new_files: []
deps: false
size: 70
---

**Goal:** wherever a note goes to an AI next to other content, it says which period it describes.
- `notePeriod(item: { startDate: string; endDate: string; current: boolean }): string` in `cv.ts`: `"2014-10 – 2015-07"`, `"2022-12 – present"` when current or no end date, `""` when there's no start date.
- `stripHeader` (the CV copy every tailoring prompt is built from) adds `period` to each note of experience, projects and volunteering items when `notePeriod` isn't empty. The stored CV is never changed.
- Enrichment prompts that list several roles (achievements, skills, summary rewrite) add the role's period to each note line, e.g. `Note (2014-10 – 2015-07): "…"`.
- One sentence in the system prompts of tailor questions, section, layout and letter, and of enrich achievements, skills and summary rewrite: "A note describes the person during its role's period, not today."

**Acceptance tests:**
- test: `notePeriod` for (2014-10, 2015-07, false) is "2014-10 – 2015-07"; for (2022-12, "", true) is "2022-12 – present"; for an empty start date is "".
- test: `stripHeader` output gives each experience note a `period`; the input CV object is unchanged.
- test: the achievements user message shows a past role's note with its period.
- test: each listed system prompt contains the sentence.

**Out of scope:** single-role enrichment prompts (score, improve, brain dump, role facts, role description: the note is about the role on screen), the score prompt, the notes editor.

## Task 7: Score: steady labels and the cap explained

---
files: [packages/shared/src/match-score.ts, packages/shared/src/match-score.test.ts, packages/shared/src/tailor.ts, apps/api/src/tailor/score.ts, apps/api/src/tailor/score.test.ts, apps/api/src/tailor/accept.ts, apps/api/test/tailor-accept.test.ts, apps/api/src/tailor/supabase-repo.ts, apps/web/src/tailor/StepBar.tsx, apps/web/src/tailor/TailorFlow.tsx, apps/web/src/tailor/tailor-flow.test.tsx, apps/web/src/i18n/en-tailor.ts]
new_files: []
deps: false
size: 90
---

**Goal:** the score stops jumping between rescores, and when it's held at 69 the header says why, calmly.
- `computeMatchScore` also returns `cappedBy: string[]`: the text of each must requirement whose label scores zero, in job order. `MatchScoreSchema` gets `cappedBy: z.array(z.string()).optional()`; the repo keeps it inside the stored `parts` JSON, as it does `capped`. Older rows read without it.
- `scoreMatch` input gains `previous?: MatchLabel[]`. After today's checks, a label whose previous version (same ref) was `met`, not inferred, with evidence whose every " | " part is still found in the new CV's text, keeps that previous label when the new one isn't `met`.
- Requirement refs are positions (`r0`, `r1`…) and editing the job replaces its requirements without clearing scores (`apps/api/src/jobs/supabase-repo.ts:103`). So a stored score also keeps the requirement texts it was computed for (`requirementTexts` inside `parts`, like `capped`), and previous requirement labels are reused only when that list equals the current job's requirement texts. Keyword labels (`k:<term>`) match by term.
- Accept passes `previous` = the tailored CV's current score labels, else the base score's.
- Header: when the latest score (or the base, before any accept) is capped and `cappedBy` isn't empty, a line under the score: "Held at 69 until the CV shows: {list}. That's fine: it's your real experience, tailored as far as it honestly goes." (`tailor.scoreCapped`). Nothing when not capped or `cappedBy` is missing.

**Acceptance tests:**
- test: a job with 3 must requirements, one missing, gives `capped: true` and `cappedBy` with that requirement's text.
- test: previous r4 `met` with evidence "Designed onboarding workflows", the new CV still contains that text, the model now says `missing`: the result keeps r4 `met`.
- test: the same, but the bullet holding that text was rewritten so the text is gone: r4 is `missing`.
- test: an inferred previous `met` is not kept.
- test: after the job's requirements are edited (r0's text changed), the previous r0 `met` is not reused; with no stored `requirementTexts` (an older row), no previous requirement label is reused.
- test: the tailoring header shows the capped line with the requirement name when capped, and no line when not capped.
- test: a stored score without `cappedBy` loads and shows no capped line.

**Out of scope:** the base-score screen on the job page, the 69 value, the scoring weights, explaining enrichment score changes (group B).

## Review focus

- A CV with one role only: role questions and rewrites still work with no other roles to leave out.
- A project or volunteering item with no dates: no period sentence breaks, `notePeriod` is empty, the tense check skips it.
- A run whose steering has focus roles that were since deleted from the CV: the unknown ids are dropped (as today) and caps fall back to 5 for everyone.
- A run started before this change (questions stored with options like "Other (please specify)", scores without `cappedBy`): it still loads and finishes.
- Non-English CVs: no tense check; prompts still ask in the CV's language.
