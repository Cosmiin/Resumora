---
id: rls
title: Row-level security (RLS)
files: [supabase/migrations/20261104000000_baseline.sql]
related: [jwt, api-layer]
---
## What it is
Row-level security is a rule written *inside the database* that decides, row by row, who may read or change it. In Resumora every rule says the same thing: you only see rows where `user_id` is you.

## Why Resumora uses it
All four tables have RLS turned on, with policies like `own cv: read` and `own imports: create`. Because the API talks to the database *as the signed-in user*, the database itself filters out everyone else's data.

## What would break without it
One missing `where user_id = ...` in the API code would let any user load any other user's CV. With RLS, that bug returns nothing instead of someone else's data.

## Connections
RLS needs to know *who* is asking. That comes from the login token (JWT) the browser sends, which the API passes on to Supabase.

## Check question
**Q:** If we removed the `own cv: read` policy but left RLS turned on, what would users see when they open their CV?
**A:** Nothing. With RLS on and no policy allowing reads, the database refuses every read, even your own.
