# SDD ledger — plan: docs/superpowers/plans/2026-11-04-remove-job-product.md
Task 1: in progress
Ruling: Use a private source snapshot repository because the existing linked worktree serves the live app; preserve source hashes and integrate only reconciled differences. No runtime secrets copied.
Pre-flight: Tasks 2–4 share helpers/contracts; API changes precede frontend narrowing. Tasks 3/5 share zero-argument languageContext. Task 6 owns targeted storage cleanup consumed by Task 8.
