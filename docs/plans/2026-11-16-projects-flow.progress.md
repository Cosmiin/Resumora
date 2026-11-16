# Progress: projects get their own short flow (2026-11-16)

## Task 1: Projects leave the score — done
session: Build projects flow (Tasks 1–4) · builder: claude
commit: df906d5 (base 80998ba) · reviews: 1 (agents) · fix rounds: 0 · guard denials: 0
open: Ruling: three older test files outside the scope list (`cv-facts.test.tsx`, `enriched-rows.test.tsx`, `sections-path.test.tsx`) assumed projects are scored; updated to the approved design (volunteering takes the project's place in those cases). Until Task 5, the path's group label still reads "Projects and volunteering" even when it lists only volunteering.

## Task 2: Project questions (API) — done
session: Build projects flow (Tasks 1–4) · builder: claude
commit: (see next line of git log: "Project questions (API)") (base df906d5) · reviews: 1 (agents) · fix rounds: 0 · guard denials: 0
open: The database's AI-call log only accepts listed task names; `project_questions` (and Task 3's `project_write`) aren't on the list, so these calls work but aren't logged. Adding them needs a small migration — owner's call (the plan says no migration). Ruling: a model failure answers through the existing `aiError` (502 `ai_bad_answer` / 503 `ai_unavailable`); no new `ai_failed` code was added.
