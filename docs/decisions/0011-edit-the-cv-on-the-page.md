---
id: 11
title: Edit the CV on the page
date: 2026-11-05
status: accepted
affects: [file:apps/web/src/cv/edit/cvReducer.ts, file:apps/web/src/cv/Editor.tsx, file:apps/web/src/cv/panel/HelperPanel.tsx]
concepts: [reducer, drag-and-drop]
---
## What we decided
Text fields look like the page itself: a `<textarea>` or `<input>` with no border, the page font, and `field-sizing: content` so each field grows with its text. A small JavaScript fallback covers browsers without `field-sizing`. We do not use a form side panel or `contentEditable`.

Every edit goes through one reducer, `cvReducer`. Its dispatch is stable, so rows that did not change do not re-render.

Sections and entries are reordered by dragging, with @dnd-kit handling pointer and touch. Keyboard users have our own path: Space to pick up, arrow keys to move, Space to drop, Esc to cancel. There are no up and down arrow buttons anywhere.

A helper panel beside the page (330px wide) holds only tools that are not text. Under 900px it becomes a bottom sheet.

## Options we considered
- **A form side panel.** Every field would appear twice, once in the panel and once on the page.
- **contentEditable.** Editing the page directly, but selection, paste and input-method (IME) editing are hard to keep reliable.
- **Fields styled as the page (chosen).**

## Why this one
Editing feels instant, and the page looks like the result while it is being edited. contentEditable is hard to keep reliable across selection, paste and IME. A form panel doubled every field.

## What it means in practice
Page fields need careful CSS. The touch overrides must load after the base rules, or they are ignored. Drag adds a dependency, @dnd-kit.

The reducer is in `apps/web/src/cv/edit/cvReducer.ts`. The page editor is in `apps/web/src/cv/edit/EditablePage.tsx`, hosted by `apps/web/src/cv/Editor.tsx`. The helper panel is in `apps/web/src/cv/panel/HelperPanel.tsx`.
