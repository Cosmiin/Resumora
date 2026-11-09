---
id: 3
title: One shared description of a CV, used by web, API and AI
date: 2026-11-04
status: accepted
affects: [file:packages/shared/src/cv.ts, file:packages/shared/src/imports.ts]
concepts: [shared-schemas]
---
## What we decided
The shape of a CV (sections, fields, limits) is written once in `packages/shared` using zod. The web app, the API and the AI prompts all use that same description.

## Options we considered
- **Each part writes its own version** of what a CV looks like.
- **One shared package (chosen).**

## Why this one
If the website thinks a field is called `title` and the API thinks it's `jobTitle`, saves silently lose data. With one shared description, a mismatch shows up as an error before the code even runs. The same schema also tells the AI exactly what JSON to return.

## What it means in practice
To add a CV field, change `packages/shared/src/cv.ts` first; the web app and API then show errors until they handle it.
