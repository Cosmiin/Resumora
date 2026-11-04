---
id: 9
title: One fixed set of CV categories, with the user's own headings
date: 2026-11-04
status: accepted
affects: [file:packages/shared/src/categories.ts, file:packages/shared/src/cv.ts, file:packages/shared/src/upgrade.ts, route:/v1/cv]
concepts: [shared-schemas]
---
## What we decided
A CV has 15 fixed categories (header plus 14 sections such as summary, key achievements, experience and skills). The stored shape is now format v2, which adds the new sections and a `layout` (section order, hidden sections and the user's own headings). Older CVs stay readable and are upgraded to v2 when they are read.

## Options we considered
- **Free-form sections**, where every section is a title and some text.
- **Keep v1 and add more lists** one by one, with no shared list of categories.
- **Fixed categories with their own headings (chosen).**

## Why this one
Flags ("your CV has no summary") and imports (matching a heading in an uploaded CV to a place) both need a fixed target to point at. Free-form sections give them nothing to match. Letting the user rename any heading keeps their own voice, and the page still shows the standard heading in the CV's language when they have not.

## What it means in practice
The categories live in `packages/shared/src/categories.ts`. To add one, add it there and to the CV schema in `cv.ts`; old CVs get an empty version of it through `upgrade.ts`. The API (`/v1/cv`) only returns v2.
