# Score rows on the Enrich start and end screens (owner's pick B, 20 Nov 2026)

Feedback points 2 and 4 (workspace `feedback-notes-2026-11-20.md`): the start and end screens list every role with its
full Shape and Worth adding checklists, which is crowded. The owner picked option B ("Score column + dots") on the
Enrich Score Screens page, with the comment "You can remove the dots from the first screen".

## Task 1: One score row per role on both screens

**Goal:** each role is one row: a big score on the left, coloured by its band (Clear green, A good start blue, Needs
work red), then the title and, under it, the company and period. No checklists on either screen.
- Start screen: the rows only (no dots, owner's comment), and the line "Shape and Worth adding don't change your
  score…" goes, since the checklists it explains are gone.
- End screen: the score shows the role's new score with its change under it ("+15", or "−5"), and a bar under the
  role's name shows the score before (light) and after (band colour). Unchanged roles' bars are quieter. The CV's
  heading keeps "Your CV: 64 → 79" and gets a "+15" gain next to it. Held lines, the one-fact cards and the error
  notice stay as they are.
- The role checklist stays where else it is used (the score panel).

**Acceptance tests:**
- Start: each role's group shows its title, its company and period, its score, and no Shape or Worth adding list; the
  checklist note is gone.
- End: a role that went 70 → 85 shows 85 and +15 and no checklist; an unchanged role shows 70 and no change; the CV
  heading still reads "Your CV: 64 → 79" and a "+15" sits next to it.
- The score's band shows on the row (`data-band`).

```scope
files: apps/web/src/cv/enrich/EnrichPath.tsx, apps/web/src/cv/enrich/EndStep.tsx, apps/web/src/cv/enrich/enrich-path.test.tsx, apps/web/src/cv/enrich/end-step.test.tsx, apps/web/src/styles/focus.css, apps/web/src/i18n/en-basecv.ts, apps/web/src/i18n/ro-basecv.ts
new_files: apps/web/src/cv/enrich/ScoreRows.tsx, apps/web/src/cv/enrich/score-rows.test.tsx
deps: none
size: ~200 lines
```
