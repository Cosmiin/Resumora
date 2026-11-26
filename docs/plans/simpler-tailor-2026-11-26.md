# Simpler tailoring (owner's pick: items 1–4 of the 2026-11-26 simplification list)

Built on PR 93's branch, so the all-roles tool question stays before the first role.

## Task 1: Start straight away
Goal: "Tailor" on a job goes to the first question. No language screen, no keywords screen.
- A visit with no open run starts tailoring at once, in the language the person's preferences pick (the server's `chosen`).
- The room's bar shows the CV's language. Until the first step is saved it is a small menu, and picking another language starts again in that language. After that it is a plain label (translation stays on the tailored CV's page).
- The room's bar shows the ad's keywords on the CV ("Keywords 7/12"), from the newest score.
- A run made from a replaced CV starts again on its own, as a fresh visit does.
- `LanguageStep` and the `KeywordsStep` screen go; `keywordsOf` stays (the finish screen uses it).
files: apps/web/src/tailor/{TailorFlow,Room,KeywordsStep}.tsx, LanguageStep.tsx (deleted), tailor-flow.test.tsx, start-steps.test.tsx, i18n en/ro tailor, styles/tailor.css
size: ~200 lines

## Task 2: No screen between steps
Goal: after Skills or Summary is saved, the next step comes straight up. A short line on it says what the step just finished moved ("Skills done · match 62 → 68").
- The `stop` phase and `StopDone` go, with their strings.
files: TailorFlow.tsx, Room.tsx, flow-phase.ts, tailor-flow.test.tsx, i18n, tailor.css
size: ~80 lines

## Task 3: Adjust instead of a set-up screen
Goal: tone and steering are only offered on a started run, as "Adjust" in the room. One screen: the tone cards and "Anything else we should know?". The three chip questions (what draws you, fit, which roles to lean on) are no longer asked. Their stored values are kept as they are.
files: SteeringStep.tsx, ToneStep.tsx, TailorFlow.tsx, steering.test.tsx, i18n
size: ~80 lines

## Task 4: One page for template and download
Goal: `/cv/export` and `/jobs/:id/cv/export` show the template choice (cards and preview) above the PDF/Word buttons. Picking a template saves it. The `/template` routes send to the export page. Every link to the template page goes to the export page.
files: apps/web/src/cvs/{ExportPage,TemplatePage}.tsx, router.tsx, cv/Editor.tsx, tailor/DoneScreen.tsx, jobs/TailoredJobView.tsx, cvs/useCvDoc.ts, cvs.test.tsx, i18n cvs, styles/cvs.css
size: ~150 lines
