---
id: version-check
title: Version check (409 conflict)
files: [apps/api/src/cv/routes.ts, supabase/migrations/20261104000000_baseline.sql]
related: [api-layer]
---
## What it is
A version check is a counter on a record. Every save says "I started from version 7". If the record is already at version 8, someone else saved in between, and the save is refused with `409 Conflict` instead of silently overwriting their work.

## Why Resumora uses it
You might have Resumora open in two tabs, or on a laptop and a phone. The `version` column in `base_cvs` and the `save_base_cv` function make sure an old tab can't erase newer changes without you knowing.

## What would break without it
Edit in tab A, then save an older tab B: tab B's old content replaces your new work, with no warning.

## Connections
The API turns the database's "version mismatch" into a `409` response, and the editor shows a choice: "Load latest" or "Keep my version".

## Check question
**Q:** Why is the check done inside the database function instead of "read the version, then save" in the API?
**A:** Because two saves could both read version 7 at the same moment and both think they're fine. Inside one database function, only one of them can win.
