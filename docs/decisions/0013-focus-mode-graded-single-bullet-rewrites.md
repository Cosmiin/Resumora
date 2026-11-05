---
id: 13
title: Focus mode with graded single-bullet rewrites
date: 2026-11-05
status: accepted
affects: [table:cv_insights, file:packages/shared/src/enrich-focus.ts, file:apps/api/src/enrich/improve.ts, file:apps/api/src/enrich/brain-dump.ts, file:apps/api/src/enrich/role-facts.ts, file:apps/web/src/cv/enrich/useFocusSession.ts, file:apps/web/src/cv/enrich/FocusMode.tsx]
concepts: [cache, notes, focus-mode]
supersedes-part-of: 12
---
## What we decided
Improving a role happens one bullet at a time, in a full-screen focus mode. Each answer the person gives turns into a proposal for that one bullet right away. The whole-role streamed rewrite is removed. The summary rewrite keeps its streaming path.

A proposal is graded by the same scorer as every other bullet before the person sees it, and it is offered only when its grade beats the current bullet's. If it doesn't, the person is asked for more detail instead. Each bullet gets at most two attempts per session.

When a proposal is offered, the API also builds the role result the next score request would produce, and stores it in `cv_insights.pending` under the fingerprint the role will have once the proposal is accepted (at most 5 entries per role). After autosave, the score route finds that entry and promotes it to the main row with no model call. So the number the celebration shows is the number that stays. Nothing is cached when another bullet in the role is a flagged duplicate, because changing one bullet can change that.

When a session ends with new answers, the answers are condensed into up to 8 short, checked facts on the role (`facts`). These are a derived summary for tailoring later. The raw notes stay the source of truth, and `facts` can always be rebuilt from them. Neither is ever shown on the page or in exports.

Roles with two bullets or fewer start with a brain dump: the person talks or types freely, and up to 4 graded new bullets are proposed.

## Options we considered
- **Keep the whole-role rewrite and add questions before it.** Fewer changes, but the person still can't see which answer improved which bullet, and a rewrite could leave the score flat.
- **Show the model's own grade of its rewrite.** Fast, but it would disagree with the scorer, so the celebrated number would not be the stored one.
- **Score after saving and only then celebrate.** Always correct, but the person waits for a full re-score after every accepted bullet.
- **Store facts in their own table.** Clean, but they would not travel with the CV through History and restore.

## Why this one
Grading with the existing scorer keeps one definition of a good bullet. Caching the predicted result under the future fingerprint makes accepting a bullet instant and honest at the same time, with no extra model call. One bullet at a time makes the link between an answer and its effect obvious, which is the point of the feature.

## What it means in practice
- `mergeGrades` (`packages/shared/src/enrich-focus.ts`) rebuilds a role result with some bullets re-graded. It reuses `buildRoleResult`, so the zero rules, issue order and questions stay in one place. A stored duplicate keeps its 0.
- `improve-bullet`, `brain-dump` and `role-facts` live in `apps/api/src/enrich/`. Proposal text is whitespace-normalised before every check.
- `putPending` only updates an existing row and never inserts. The main-row `put` sends only the main columns, so it never wipes predictions.
- The policy is `score/2`: every bullet's question is kept, with a `detail` or `result` kind. At 80+ the score card offers "Make it stand out", which asks only for results.
- An answer that fails the schema on every retry is reported as 503 (`callModel`), and a schema-valid answer our code rejects is reported as 502.
- On the web, `useFocusSession` holds all queue and step logic and `FocusMode` renders it. Esc and ✕ close at any point. The role-facts call waits for the last note to save.
