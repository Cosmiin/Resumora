---
id: 14
title: Record what goes wrong in the browser
date: 2026-11-25
status: accepted
affects: [table:app_errors, route:/v1/errors, file:apps/web/src/lib/report-error.ts, file:apps/web/src/lib/api.ts, file:apps/web/src/main.tsx, file:apps/web/src/cv/enrich/prepare.ts, file:apps/web/src/cv/enrich/EnrichPath.tsx]
concepts: [logging]
---
## What we decided
The browser records what goes wrong in a new table, `app_errors`, through `POST /v1/errors`, as the signed-in user:
- **message**: every red message (`role="alert"`) the moment it appears, with its text and the page. A field's own check while typing and plain (not red) notices are left out.
- **request**: every request to our API that fails, with the path, HTTP status, error code and request id. A request that never came back has no status.
- **step**: a failed step of preparing Enrich changes, with the step name and the role.
Each user can write and read only their own rows. Nothing in the app reads them back; they are for tracing a red message to its cause. Signed out, nothing is sent. Recording adds no retries and changes nothing the person sees; a lost record is ignored.

## Options we considered
- **Add the rows to `ai_calls`.** One place to look, but those rows are AI calls, and counts such as the voice limit read that table.
- **Log on the server only.** Misses a request that never came back or an answer the browser could not read, and the server's console logs are not kept.
- **Report from each of the ~50 places that show a red message.** Precise, but every new message would need the same line; watching the page for `role="alert"` covers new ones too.

## Why this one
Only AI call failures were recorded before. On 25 Nov the Enrich notice "Some changes could not be prepared" showed while every AI call and every database request had succeeded, so its cause could not be found. The browser is the one place that sees every kind of failure.

## What it means in practice
After a red message, `select * from app_errors order by created_at desc` shows the message next to the failed request or step that caused it, a few milliseconds apart.
