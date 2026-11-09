---
id: 1
title: An API sits between the browser and the database
date: 2026-11-04
status: accepted
affects: [route:/v1/cv, route:/v1/imports, file:apps/api/src/app.ts]
concepts: [api-layer, jwt]
---
## What we decided
The web app never changes data in Supabase directly. It calls our own API (`apps/api`, a Cloudflare Worker using Hono), and the API reads and writes the database.

## Options we considered
- **Browser talks to Supabase directly.** Less code, but every rule (like "max imports per day") would have to live in the database or be trusted to the browser.
- **Our own API in the middle (chosen).** One place for rules, AI calls and error messages.

## Why this one
Some work can't happen in the browser at all: calling AI models needs secret keys, and reading a PDF takes too long to wait for. One API also means the future browser extension uses exactly the same doors as the website.

## What it means in practice
Every request goes `browser → /v1/... → API → Supabase`. Errors always come back as `{ error: { code, message, requestId } }`.
