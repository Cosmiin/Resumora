# Enrichment in fewer screens (plan, 2026-11-27)

Owner's picks on https://claude.ai/artifact/5oh8XGrXmDJUV2A6iwy7Tg (27 Nov 2026), after one real run (21 screens with an
action from the read CV to the score, 71 → 88):

1. One start: the score sits on the "We found N roles" screen. His note: it must not feel overwhelming.
2. Tools on one screen; companies keep their own screen.
3. One screen per role for the budget questions. His note: the questions must not all show at once; they come one
   after another with a fade.
4. One answer lands once in a role, on the line it fits.
5. The per-role questions stay, but repeat nothing.
Overall note: as little overwhelming as possible, and easy to understand.

Not touched: how the budget questions are picked, the score, the merge confirmation (owner, 19 Nov), tailoring.

Builder: Claude (`claude-build`). Three parts, each its own PR, merged and published on its own.

## Part A: web only, no model call changes

## Task 1: Tools on one screen
Goal: the tools step is one screen. Every role with at least one written line is a card (title, company · dates) with
its tools as the same toggle buttons, in one row: named in the CV (ticked), usual for the job, added by the person,
offered by the card before or after (dashed). "Add a tool" opens a small field in the card. One Continue saves one note
per role whose ticks changed, as today. A role with no written line (no score) is not shown and gets no note.
Acceptance tests (`path-steps.test.tsx`):
- every role with a line is on one screen, a tool the role names is ticked, only changed roles are saved;
- a role with no lines is not shown;
- a tool ticked on one card is offered, not ticked, on the cards before and after it, and not two cards away;
- a tool added on a card is ticked there and stays offered there when unticked;
- a named tool is kept past the first eight suggestions and stays in the saved answer;
- Continue saves once; it waits for the suggestions; the prepared answer is used; it works when the AI is down.
```scope
files: apps/web/src/cv/enrich/ToolsStep.tsx, apps/web/src/cv/enrich/path-steps.test.tsx, apps/web/src/i18n/en-basecv.ts, apps/web/src/i18n/ro-basecv.ts, apps/web/src/styles/focus.css
new_files: none
deps: none
size: 300
```

## Task 2: No wait after Shape; texts that agree
Goal: after "Merge all and continue" the companies screen shows at once. The merges are checked and put on the CV in
the background; the questions (budget) wait for that to finish, behind the existing "Updating your scores…" screen
only if it is still running when the tools are done. The companies note no longer promises a review at the end. The
import screen and the start screen promise the same duration and name the same steps.
Acceptance tests (`enrich-path.test.tsx`):
- after Shape is confirmed, the companies step is on screen while the check is still pending;
- the budget is picked only after the Shape check has finished (its merged lines are in the questions);
- a failed Shape check still puts the merges on the CV.
```scope
files: apps/web/src/cv/enrich/EnrichPath.tsx, apps/web/src/cv/enrich/enrich-path.test.tsx, apps/web/src/i18n/en-basecv.ts, apps/web/src/i18n/ro-basecv.ts
new_files: none
deps: none
size: 120
```

## Task 3: One start after an import
Goal: the import screen shows the CV's score ("Your CV: 71") next to what was found, once every role is scored (the
scores are already asked for while it is on screen). "Start" goes straight to the first step: the path opened from an
import does not show its own start screen. If the scores are not all in yet, the path shows "Reading your CV…" and
moves on by itself. Opened from the CV page, the path keeps its start screen.
Acceptance tests:
- `enrich-path.test.tsx`: with `autoStart`, the first step shows without a click once the scores are settled; without
  it the start screen is as today;
- import screen test: the score shows when given, and nothing moves in its place while it is not known.
```scope
files: apps/web/src/cv/enrich/EnrichPath.tsx, apps/web/src/cv/enrich/enrich-path.test.tsx, apps/web/src/cv/enrich/useRoleScores.ts, apps/web/src/imports/ImportScreen.tsx, apps/web/src/imports/*.test.tsx, apps/web/src/cv/Editor.tsx, apps/web/src/i18n/en-basecv.ts, apps/web/src/i18n/ro-basecv.ts, apps/web/src/styles/*.css
new_files: none
deps: Task 2
size: 180
```

## Part B: the questions

## Task 4: One screen per role, one question at a time
Goal: the budget step keeps the role on screen while its questions come one after another: the answered ones fold
into one line each (question, answer), the next one fades in below. The progress line names the role ("Role 2 of 4")
and the question within it. After a role's last question the button reads "Next role". Reduced motion: no fade.
```scope
files: apps/web/src/cv/enrich/BudgetStep.tsx, apps/web/src/cv/enrich/RoleRun.tsx, apps/web/src/cv/enrich/enrich-path.test.tsx, apps/web/src/cv/enrich/*.test.tsx, apps/web/src/i18n/en-basecv.ts, apps/web/src/i18n/ro-basecv.ts, apps/web/src/styles/focus.css
new_files: apps/web/src/cv/enrich/budget-step.test.tsx
deps: none
size: 250
```

## Task 5: A role is prepared as soon as its questions are done
Goal: the final wait shrinks: when the person leaves a role's questions, that role's changes are prepared, checked and
put on the CV in the background; roles with no question start when the questions start. The ring at the end shows
what is still running. Back does not go into a role that is already being prepared.
```scope
files: apps/web/src/cv/enrich/EnrichPath.tsx, apps/web/src/cv/enrich/BudgetStep.tsx, apps/web/src/cv/enrich/enrich-path.test.tsx
new_files: none
deps: Task 4
size: 250
```

## Part C: nothing asked twice, nothing written five times (model calls; needs a real-AI trial)

## Task 6: The per-role questions repeat nothing
Goal: a role's own run leaves out a company or tools question when the role already has that answer (the path's
company note, the tools note, a description), whatever its wording. A follow-up question does not ask for the fact the
question before it on the same line asked for.

## Task 7: One answer lands once
Goal: when a role is rewritten from answers, a fact from one answer goes on the line it belongs to (or the
description), not on every line. Tried on a real run before it is published.
