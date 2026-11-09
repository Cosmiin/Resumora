---
id: foreign-keys
title: Foreign keys (links between tables)
files: [supabase/migrations/20261104000000_baseline.sql]
related: [migrations, rls]
---
## What it is
A foreign key is a column that points to a row in another table. It's like writing "see page 12" in a book, except the database checks that page 12 actually exists.

## Why Resumora uses it
Every table has `user_id references auth.users (id) on delete cascade`. That links each CV, version, import and AI log to a real user, and `on delete cascade` means that deleting a user deletes all their rows too.

## What would break without it
You could end up with CVs belonging to users who no longer exist ("orphans"), and deleting an account would leave personal data behind.

## Connections
The same `user_id` column that links tables together is the one the security rules (RLS) check.

## Check question
**Q:** A user deletes their account. What happens to their rows in `base_cv_versions`?
**A:** They're deleted automatically, because the foreign key says `on delete cascade`.
