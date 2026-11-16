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
commit: 086285b (base 9f0a78b) · reviews: 1 (agents) · fix rounds: 0 · guard denials: 0
open: Ruling: three older API tests outside the scope list (`test/tailor-projects.test.ts` ×2, `test/tailor-questions.test.ts` ×1) expected tailoring questions about a project; they now check that a project gets none (the volunteering cases are unchanged). The two-bullet cap is applied after the "removed" count, so dropped extra bullets are not reported as failed checks.

## Golden examples (for the owner to read)

**How these were made.** The app's AI keys sit in secret files the build may not open, so the real model wasn't called. Instead:
1. The real code built the exact prompts the app would send (`project-prompts.ts`).
2. A separate Claude agent answered them, following every rule in the prompts. This is a stand-in for the app's model, so the wording will differ when the real model runs.
3. The real code checks then ran over those answers (`projectQuestions` / `projectWrite`: one question per topic, allowed options, unknown tools and numbers, tense, two bullets, extra tools).
All three cases use the same "rest of the CV": Business Analyst at Emedi and Operations Coordinator at Nordlane Logistics, with Skills Excel, SQL and Process mapping. That part is context only.

To see the real model's answers: open a project's ✨ in your dev app (on this branch) and run it.

### 1. Your first agentic development project (English, ongoing)
Project as given: "Agentic CV builder", Personal project, Sep 2026 – now. Description: "My first agentic development project, built from zero to finished." Five earlier answers (these are examples; your real answers will differ): a web app that turns a CV into a stronger one and tailors it to a job, for job seekers · Claude API, Claude Code, TypeScript, React, Supabase · REST API, PostgreSQL · Design, Build, Testing, Launch · Prompt design, Test-driven development, Code review by AI agents.

Questions it asks: only one, because the other five topics are already answered.
- "Is it used, or what came out of it?" — 1–10 users · 10–50 users · 50–200 users · 1–5 hours saved a week · Used daily by me · Shared with friends or colleagues · Live online

Writer (passed every check unchanged):
- Description: "A web app that strengthens a CV and tailors it to a job, for job seekers, built with the Claude API and React."
- • "Design and build the app in TypeScript and React with Supabase, PostgreSQL and a REST API, then test and launch it."
- • "Develop with Claude Code using prompt design, test-driven development and code review by AI agents."
- Added to Skills: none (every tool fit in the lines).
What to look at: it leads with the Claude API, which none of the jobs show. The bullets are in the present because the project is ongoing; "Design and build…" reads a little flat. If you'd rather see "Designed and built…" for a project you consider finished, set an end date (an ended project is written in the past).

### 2. A Romanian project that has ended (Romanian CV, English interface)
Project: "Automatizare facturi", Proiect personal, Mar 2023 – Feb 2024, no description. Earlier answers: Make, Airtable, Gmail · Webhooks, fișiere PDF · Economisește 2–5 ore pe săptămână.

Questions (in English, because the interface is English):
- "What did you build or do, and who was it for?" — A flow that creates invoices automatically · A flow that sends invoices by email · Invoice tracking for a small business · Reminders for unpaid invoices · Invoice filing and archiving
- "Which parts did you do yourself?" — Design · Build · Data · Testing · Launch · Upkeep
- "Did you use a method or approach?" — Workflow automation · Process mapping · Iterative testing · Error handling and retries · Agile

Writer (in Romanian, past tense, passed every check with no retry):
- Description: "Automatizare de facturi în Make, care leagă Airtable și Gmail prin webhooks și lucrează cu fișiere PDF."
- • "Am automatizat facturile în Make cu webhooks, Airtable și Gmail, procesând fișiere PDF."
- • "Am economisit 2–5 ore pe săptămână prin automatizare."

### 3. An imported project with 5 bullets (English, ended, no answers yet)
Project: "Sales dashboard", University course, Feb – Jun 2018. Description: "A dashboard project for a data course." Bullets: Collected sales data from the shop · Cleaned the data in Excel · Built a dashboard in Power BI · Presented it to the class · Got the top grade.

Questions: connections (CSV files · Excel files · SQL database · REST API · Point-of-sale export · Google Sheets), part (Design … Upkeep), method (Data cleaning · ETL · KPI design · Data modelling · Agile · Data storytelling). It skips "what" and "tools", which the project already answers.

Writer, if every question is skipped (five bullets become two; on approval the old five are replaced):
- Description: "A Power BI sales dashboard built from shop data for a university data course."
- • "Built a Power BI dashboard from the shop's sales data and presented it to the class, earning the top grade."
- • "Collected the sales data from the shop and cleaned it in Excel."

## Whole-branch review (Opus, base 80998ba)
review 1: pass, two low findings, both fixed in "Whole-branch review fixes": (1) the Start button's rule for roles had changed by accident in Task 5's fix round; restored (only the automatic project ticks are held while scores load). (2) For Romanian, the tense check now covers the description too (the Romanian check looks at verb endings, so "Automatizare de facturi…" is not misread). Fix-only review (Opus): pass.
