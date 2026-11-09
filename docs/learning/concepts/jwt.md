---
id: jwt
title: Login tokens (JWT)
files: [apps/api/src/auth.ts, apps/web/src/lib/api.ts]
related: [rls, api-layer]
---
## What it is
When you sign in, Supabase gives the browser a token: a long signed string that says "this is user X, valid until time Y". A JWT (JSON Web Token) is that kind of token. Anyone can read it, but only Supabase can create a valid one.

## Why Resumora uses it
Every request from the web app to the API carries `Authorization: Bearer <token>`. The API checks the token, learns who you are, and forwards it to Supabase so the security rules know who is asking.

## What would break without it
The API would have no reliable way to know who sent a request. It would have to trust whatever user id the browser claimed, and anyone could pretend to be anyone.

## Connections
The token is the "who" that row-level security uses for its "only your rows" check.

## Check question
**Q:** Someone edits their token in the browser to change the user id inside it. What happens?
**A:** The signature no longer matches, so the API rejects the token and the request fails with 401.
