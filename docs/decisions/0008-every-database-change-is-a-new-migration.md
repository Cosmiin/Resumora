---
id: 8
title: Every database change is a new migration file
date: 2026-11-04
status: accepted
affects: [file:supabase/migrations]
concepts: [migrations]
---
## What we decided
Changes to the database (a new table, a new column, a new rule) are always a new file in `supabase/migrations/`. A file that has already been applied is never edited.

## Options we considered
- **Change the database by hand** in the Supabase dashboard.
- **Edit the existing migration files.**
- **Always add a new file (chosen).**

## Why this one
Migrations are the database's history. Every copy of the database (your laptop, the tests, later the hosted one) replays the same files in the same order, so they all end up identical. Editing an old file would make the copies disagree, and dashboard changes would exist nowhere in the code.

## What it means in practice
The Map tab of the architecture panel is drawn from these files, so it always matches what the migrations build.
