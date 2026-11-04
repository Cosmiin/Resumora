---
id: 10
title: CV files go to the model as files
date: 2026-11-04
status: accepted
affects: [file:apps/api/src/imports/process.ts, file:apps/api/src/imports/source-check.ts, file:apps/api/src/ai/call-model.ts]
concepts: [queue]
---
## What we decided
PDFs are sent to the AI model as the file itself, so it can see the page layout: columns, sidebars and tables. Word files (DOCX) still go as text. If a provider refuses the file, the import falls back to the text and shows a warning that columns may be mixed up. Scanned PDFs are read from the file too. Every line the model copies is checked against the file's own text. A line that is not found is shown in the review for the user to check. It is kept, not deleted.

## Options we considered
- **Flattened text only** (what we do today). Simple, but it breaks multi-column CVs because the text comes out in the wrong order.
- **Page pictures.** Workers cannot draw PDF pages without a paid service or a heavy add-on.
- **The file itself (chosen).** On 2026-11-04 both providers accepted it.

## Why this one
The layout survives, so columns and sidebars come out in the right places. The cost stays about $0.003 per CV. The evaluation set of 12 synthetic CVs passes 12/12, in two full runs in a row (see `apps/api/eval/import/RESULTS.md`).

## What it means in practice
The file-or-text choice is made in `apps/api/src/imports/process.ts`. The line check is in `apps/api/src/imports/source-check.ts`. The model call, including the file upload and the fallback, is in `apps/api/src/ai/call-model.ts`. Run `npm run eval:import` before changing the import prompt, so a regression shows up before it reaches a user.
