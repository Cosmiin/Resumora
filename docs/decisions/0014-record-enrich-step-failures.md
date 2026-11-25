---
id: 14
title: Record failed steps of preparing enrich changes
date: 2026-11-25
status: accepted
affects: [table:enrich_failures, route:/v1/enrich/failures, file:apps/web/src/cv/enrich/prepare.ts, file:apps/web/src/cv/enrich/EnrichPath.tsx, file:apps/web/src/cv/enrich/enrich-api.ts]
concepts: [logging]
---
## What we decided
When a step of "preparing your changes" fails (a line rewrite, a role description, new lines from answers, placing answers on the page, or the final check), the browser records which step, which role and why: the HTTP status, the error code, the request id, and the error text. The record goes through `POST /v1/enrich/failures` into a new table, `enrich_failures`, as the signed-in user. Each user can write and read only their own rows. Nothing in the app reads them back; they are for finding the cause of the "Some changes could not be prepared" notice.

## Options we considered
- **Add the rows to `ai_calls`.** One place to look, but those rows are AI calls, and counts such as the voice limit read that table.
- **Log on the server only.** Misses a request that never came back or an answer the browser could not read, and the server's console logs are not kept.

## Why this one
Only AI call failures were recorded before. On 25 Nov the notice showed while every AI call and every database request had succeeded, so the failing step could not be found. The browser is the one place that sees every kind of failure.

## What it means in practice
After the notice shows, `select * from enrich_failures order by created_at desc` names the step and the role. Recording adds no retries and changes nothing the person sees; a failed record is ignored.
