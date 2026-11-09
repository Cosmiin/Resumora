---
id: queue
title: Queues and background work
files: [apps/api/src/imports/routes.ts, apps/api/src/imports/consumer.ts]
related: [api-layer]
---
## What it is
A queue is a to-do list for the server. One part adds a job ("import file X"), and another part works through the list on its own time. The person who added the job doesn't wait.

## Why Resumora uses it
Importing a CV means reading a PDF and waiting for an AI, which can take a while. The upload door (`POST /v1/imports`) just adds a job to `resumora-imports` and answers right away. The worker in `consumer.ts` does the slow part.

## What would break without it
Uploads would hang for many seconds and sometimes time out, and a failed AI call would mean the user has to upload the file again.

## Connections
The queue worker (and its scheduled clean-up of stuck imports) uses the database's admin key, because it runs outside any user's request.

## Check question
**Q:** The AI provider is down for a minute while you upload a PDF. What do you see?
**A:** The upload still succeeds and shows "processing". The worker retries, and if it keeps failing, the import ends up as failed with an error, without blocking the rest of the app.
