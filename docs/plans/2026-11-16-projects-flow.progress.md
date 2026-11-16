# Progress: projects get their own short flow (2026-11-16)

## Task 1: Projects leave the score — done
session: Build projects flow (Tasks 1–4) · builder: claude
commit: df906d5 (base 80998ba) · reviews: 1 (agents) · fix rounds: 0 · guard denials: 0
open: Ruling: three older test files outside the scope list (`cv-facts.test.tsx`, `enriched-rows.test.tsx`, `sections-path.test.tsx`) assumed projects are scored; updated to the approved design (volunteering takes the project's place in those cases). Until Task 5, the path's group label still reads "Projects and volunteering" even when it lists only volunteering.

## Task 2: Project questions (API) — done
session: Build projects flow (Tasks 1–4) · builder: claude
commit: 7e8f906 (base df906d5) · reviews: 1 (agents) · fix rounds: 0 · guard denials: 0
open: The database's AI-call log only accepts listed task names; `project_questions` (and Task 3's `project_write`) aren't on the list, so these calls work but aren't logged. Adding them needs a small migration — owner's call (the plan says no migration). Ruling: a model failure answers through the existing `aiError` (502 `ai_bad_answer` / 503 `ai_unavailable`); no new `ai_failed` code was added.

## Task 3: Project writer (API) — done
session: Build projects flow (Tasks 1–4) · builder: claude
commit: b584283 (base 7e8f906) · reviews: 1 (agents) · fix rounds: 0 · guard denials: 0
open: Ruling: the tense check (retry, then drop) looks at the bullets only. The English check calls any line that doesn't open with a past verb "present", so it would wrongly reject a description like "A Make flow that…"; the prompt asks for the description to name the thing, not open with a verb. Reviewer (low): a Romanian description opening with a present verb would get through.

## Task 4: The project run (web) — done
session: Build projects flow (Tasks 1–4) · builder: claude
commit: 916e70d (base b584283) · reviews: 2 (agents) · fix rounds: 1 · guard denials: 0
open: Ruling: after Task 1 no project had a button to open a run any more (it used to be the score pill), so a ✨ "Describe this project" button sits beside each project's name (`RoleItem.tsx`, outside the scope list). Fix round (reviewer, low): the questions are asked only after the CV is saved, so a project added a moment ago is found. Not checked in the running app (no secrets in the worktree); covered by tests only.

## Task 5: Projects in the guided path — done
session: Build projects flow (Tasks 1–4, continued here for 5–6) · builder: claude
commit: 9f0a78b (base cc4e2c5) · reviews: 2 (agents) · fix rounds: 1 · guard denials: 0
open: Ruling: `sections-path.test.tsx` (outside the scope list) was brought back to projects in the path, as To do / Done. The path's volunteering group now has its own label ("Volunteering"). The old "Projects and volunteering" label is unused in the path but still shows in the panel's score list (`enrich.roles.other`), which now lists only volunteering. Fix round (reviewer, low): while the roles' scores load, the to-do project ticks alone can't start the path. A jobs-page test timed out once under full-suite load and passes alone (file not touched by this branch).

## Task 6: Tailoring a project — done
session: Build projects flow (Tasks 1–4, continued here for 5–6) · builder: claude
commit: SHA6 (base 9f0a78b) · reviews: 1 (agents) · fix rounds: 0 · guard denials: 0
open: Ruling: three older API tests outside the scope list (`test/tailor-projects.test.ts` ×2, `test/tailor-questions.test.ts` ×1) expected tailoring questions about a project; they now check that a project gets none (the volunteering cases are unchanged). The two-bullet cap is applied after the "removed" count, so dropped extra bullets are not reported as failed checks.
