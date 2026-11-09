---
id: 4
title: CV imports go through a queue
date: 2026-11-04
status: accepted
affects: [table:cv_imports, route:/v1/imports, file:apps/api/src/imports/consumer.ts]
concepts: [queue]
---
## What we decided
Uploading a PDF or DOCX doesn't process it right away. `POST /v1/imports` saves the file in the private `cv-imports` storage bucket, writes a row in `cv_imports`, and puts a message on the `resumora-imports` queue. A separate worker picks it up, reads the text, asks the AI and saves the result.

## Options we considered
- **Process it during the upload request.** Simple, but AI extraction can take many seconds and the request could time out.
- **Queue plus worker (chosen).**

## Why this one
The user gets an answer instantly ("import started"), the page shows progress by checking `GET /v1/imports/:id`, and if the AI is slow or fails, the job can be retried without the user uploading again.

## What it means in practice
An import has a status: `queued` → `processing` → `ready` (waiting for you to review it) → `applied` once you accept it, or `failed`. The rules the AI follows when importing live in `apps/api/src/imports/prompts.ts`.
