---
id: 2
title: The API acts as the signed-in user, not as an admin
date: 2026-11-04
status: accepted
affects: [table:base_cvs, table:base_cv_versions, table:cv_imports, table:ai_calls, file:apps/api/src/auth.ts]
concepts: [rls, jwt]
---
## What we decided
When the API talks to Supabase for a request, it passes along the user's login token, so the database treats the request as coming from that user. Only background work outside any user's request uses the admin key (`SUPABASE_SERVICE_ROLE_KEY`): the import queue worker (including its scheduled clean-up of stuck imports) and the `ai_calls` log.

## Options we considered
- **The API uses the admin key everywhere** and checks "is this your CV?" in its own code.
- **The API acts as the user (chosen)**, and the database's security rules (RLS) decide what each user can see.

## Why this one
TODO(human): in 2–4 sentences, your own words — why is it safer to let the database check "is this your row?" than to have the API check it?

## What it means in practice
Even if the API had a bug, the database would still refuse to show one user another user's CV. New code in request handlers must never use the admin key.
