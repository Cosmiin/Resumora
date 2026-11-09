---
id: shared-schemas
title: Shared schemas
files: [packages/shared/src/cv.ts]
related: [api-layer]
---
## What it is
A schema is an exact description of what some data must look like: which fields, what types, how long. Resumora writes its schemas with a library called zod, in one shared package.

## Why Resumora uses it
`CvContentSchema` in `packages/shared/src/cv.ts` is used by the web editor, by the API to reject bad saves, and by the AI calls to say "return JSON in exactly this shape".

## What would break without it
Each part would have its own idea of a CV. A renamed field in one place would quietly drop data in another, and AI answers in the wrong shape would slip into the database.

## Connections
The API checks every incoming save against the schema before it reaches the database, the same way the database checks security rules before returning rows.

## Check question
**Q:** The AI returns a CV with a field called `jobTitle`, but the schema calls it `title`. What happens?
**A:** The answer fails the schema check, so `callModel` treats it as invalid and retries instead of saving bad data.
