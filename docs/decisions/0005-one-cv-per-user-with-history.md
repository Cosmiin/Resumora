---
id: 5
title: One CV per user, with a history of earlier versions
date: 2026-11-04
status: accepted
affects: [table:base_cvs, table:base_cv_versions, route:/v1/cv/history]
concepts: [foreign-keys, migrations]
---
## What we decided
`base_cvs` has exactly one row per user (its key is `user_id`). Earlier states are copied into `base_cv_versions` on import, on restore, and at most every 10 minutes while autosaving. A copy before AI changes is planned (the `ai` reason already exists) for when "Improve with AI" is built. Only the newest 50 are kept.

## Options we considered
- **Many CVs per user** from the start.
- **One "My CV" plus history (chosen).** CVs tailored to jobs come later, in their own table.

## Why this one
The old version of Resumora grew to 71 tables and became hard to change. One CV keeps the app simple, and the history means a bad AI change or import can always be undone.

## What it means in practice
`GET /v1/cv/history` lists the saved versions, and `POST /v1/cv/history/:id/restore` brings one back (saving the current one first).
