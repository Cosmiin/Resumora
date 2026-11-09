---
id: migrations
title: Migrations
files: [supabase/migrations/20261104000000_baseline.sql, supabase/migrations/20261105000000_imports.sql]
related: [foreign-keys, rls]
---
## What it is
A migration is a small SQL file that changes the database one step: "create this table", "add this column", "turn on this rule". Played in order, the files rebuild the whole database from nothing.

## Why Resumora uses it
Your laptop, the automated tests and (later) the hosted database all run the same files in `supabase/migrations/`, so they all have exactly the same tables. The file names start with a date and time, which fixes the order.

## What would break without it
If someone added a column by clicking in a dashboard, the code would expect it but a fresh copy of the database wouldn't have it, and the app would fail with "column does not exist", only on some machines.

## Connections
Migrations are where foreign keys and security rules (RLS) are written down. The architecture panel's Map is drawn by reading them.

## Check question
**Q:** You want to add a `phone` column to `base_cvs`. Do you edit `20261104000000_baseline.sql`?
**A:** No. You add a new migration file. The baseline has already been applied, and editing it would make existing databases and new ones disagree.
