# Final review fixes (2026-11-16)

Owner's points from `final-review-notes-2026-11-16.md` (workspace folder), built on `feat/tailored-job-flow` (PR 60), as the owner chose on 2026-11-16. Point 2 of those notes (My CVs) is already built on this branch.

## Task 1: Remove "Is there anything you want your CV to bring out?"

Goal: the optional text box on the focus step of the guided path (`PathStart`) is gone, and no request or prompt carries that text any more. Owner: "it was decided we don't need this and it should not influence anything."

- Web: `PathStart` has no focus box, no voice input for it and no `focus` argument on `onStart`; `EnrichPath` no longer keeps or passes a focus; `RoleRun`/`useRoleRun` and `FocusMode`/`useFocusSession` lose the `focus` prop and every branch that used it; `scoreRole` in `enrich-api.ts` loses its `focus` parameter (callers that passed `undefined` for it shift `more` one place).
- API: `POST /v1/enrich/score` body loses `focus`; `scoreRole` input loses `focus`; `focusNote` is deleted. A request that still sends `focus` is accepted and the field ignored (zod strips it).
- Shared: `MAX_FOCUS` is deleted.
- i18n: `enrich.path.focusQuestion`, `focusPlaceholder`, `focusOptional` deleted in EN and RO. CSS `.fm-focus-text` rules deleted.
- Docs: the line in `docs/redesign-log.md` about the box says it was removed on 2026-11-16 at the owner's request.

Acceptance tests:
- The focus step shows the role list and the start button, and no textbox (EN).
- Starting the path calls `scoreRole` without any focus text (web), and the score prompt never contains "bring out" / a goal note (API: a body with `focus` is ignored, the model's user message has no goal line).
- Old tests about the focus text are removed, not skipped.

```
files: apps/web/src/cv/enrich/PathStart.tsx, apps/web/src/cv/enrich/EnrichPath.tsx, apps/web/src/cv/enrich/RoleRun.tsx, apps/web/src/cv/enrich/useRoleRun.ts, apps/web/src/cv/enrich/FocusMode.tsx, apps/web/src/cv/enrich/useFocusSession.ts, apps/web/src/cv/enrich/enrich-api.ts, apps/web/src/cv/enrich/enrich-path.test.tsx, apps/web/src/cv/enrich/focus-session.test.tsx, apps/web/src/i18n/en-basecv.ts, apps/web/src/i18n/ro-basecv.ts, apps/web/src/styles/focus.css, apps/api/src/enrich/routes.ts, apps/api/src/enrich/score.ts, apps/api/src/enrich/prompts.ts, apps/api/src/enrich/score.test.ts, packages/shared/src/enrich.ts, docs/redesign-log.md
new_files: none
deps: none
size: ~150 lines removed, ~20 added
```

## Task 2: Romanian lines of an ended role use "Am" + past participle

Goal: a role that has ended gets Romanian lines like "Am coordonat…", never the present ("Coordonez…"), in every step that writes lines; the current role keeps the present. Owner's pick on 2026-11-16: "Am coordonat…", which replaces the old rewrite rule "never with Am …".

- Shared `startsInPresentTense(text, "ro")` returns true when the first word is a Romanian present-tense verb (first person "-ez", "-esc"/"-ăsc", third person "-ează", "-ește"/"-ăște", plus a list of common verbs without those endings, such as "verific", "conduc", "asigur"); "Am …", nouns ("Coordonarea…") and company names are not flagged. Other non-English locales stay unchecked.
- Prompts: every prompt that writes lines states, for Romanian, "an ended role: start with Am and the past participle (Am coordonat…); the current role: the present (Coordonez…)", and "No first person" is reworded so that it means no pronouns ("eu", "my"…) and allows the Romanian "Am …". Prompts: `focus-prompts.ts` (improve bullet, new bullets), `rewrite-prompts.ts` (the old "never with Am" line replaced), `tailor/section-prompts.ts` (experience, projects, principle 5).
- Checks in code after the model answers, for a past role:
  - improve bullet (`improve.ts`): already retries once on `startsInPresentTense`; its retry note names the Romanian form when the CV is Romanian.
  - new bullets from answers (`brain-dump.ts`): a line that starts in the present is dropped (no retry: the other lines are kept).
  - streamed rewrites (`rewrite-prompts.ts`) now only rewrite the summary (role rewrites go through improve bullet and new bullets), so only their rule line changes; no new check there.
  - tailoring (`tailor/checks.ts`): unchanged code; its flag text names the Romanian form for a Romanian CV.

Acceptance tests:
- `startsInPresentTense`: "Coordonez fluxul…", "Efectuez raportarea…", "Colaborez cu…", "Coordonează…", "Gestionează…", "Verific…" are flagged for `ro`; "Am coordonat…", "Coordonarea…", "Philip Morris International este…", "Responsabil de…" are not.
- Brain dump on a past Romanian role drops a "Coordonez…" line and keeps an "Am coordonat…" line; on a current role keeps both.
- Improve bullet on a past Romanian role retries on "Coordonez…" with the Romanian note.
- Each changed prompt contains the Romanian rule (prompt-content tests already exist for these prompts).

```
files: packages/shared/src/tense.ts, packages/shared/src/tense.test.ts, apps/api/src/enrich/focus-prompts.ts, apps/api/src/enrich/rewrite-prompts.ts, apps/api/src/enrich/improve.ts, apps/api/src/enrich/improve.test.ts, apps/api/src/enrich/brain-dump.ts, apps/api/src/enrich/brain-dump.test.ts, apps/api/src/enrich/rewrite-rules.test.ts, apps/api/src/tailor/section-prompts.ts, apps/api/src/tailor/checks.ts, apps/api/src/tailor/checks.test.ts
new_files: none
deps: none
size: ~120 lines
```
