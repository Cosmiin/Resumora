---
id: web-enrich/role-description
area: web-enrich
files: ["apps/web/src/cv/enrich/DescriptionStep.tsx","apps/web/src/cv/enrich/useFocusSession.ts","apps/web/src/cv/enrich/focus-mode.test.tsx","apps/web/src/cv/enrich/focus-session.test.tsx"]
depends_on: ["web-enrich/client-focus","web-enrich/focus-session","web-enrich/focus-ui","api-enrich/role-description","shared/enrichment-score","web-editor/reducer"]
contract: false
checked_hash: 3be5355b
cited: [f12986, 24adad, 8d60aa, 5fcbd0, 67e994, e72835, 730afb, bac1b3, 807c87, a4122e, 0e7a55, 1c8b0b, a4122e, 077c8b, 9620de, 1aea40, d7b09a, 177064, 057638, 2d24ac, b32b8b, 1a7de6, b0e503, d3112a, 609b8a, e3cbed, 0471c2, 434b97, 248b9c, bac1b3, 077c8b, 9745cf, b0e503, 75b836, 945ecf, 3d78c4, 0cc32e, 1a7de6, aa41d3, ee04d6, 6e5c2d, b32b8b, 0cc32e, 1a7de6]
decisions: ["docs/decisions/0012-ai-enrichment-scores-and-notes.md","docs/decisions/0013-focus-mode-graded-single-bullet-rewrites.md"]
open: []
---
Offer a final editable role introduction before the session's done screen.

- The session intercepts roleDone once and requests a description instead. Initialization starts at describing only when its chosen first step is roleDone: stale/missing scores start scoring, while fresh scores go through firstStep, where thin roles start brainDump and role questions precede bullet steps. An empty bullet queue alone is insufficient. `apps/web/src/cv/enrich/useFocusSession.ts:154` -> `fresh ? firstStep`; `apps/web/src/cv/enrich/useFocusSession.ts:155` -> `kind: "scoring"`; `apps/web/src/cv/enrich/useFocusSession.ts:94` -> `isThin`; `apps/web/src/cv/enrich/useFocusSession.ts:95` -> `roleQuestions.length`; `apps/web/src/cv/enrich/useFocusSession.ts:158` -> `start.step.kind === "roleDone"`; `apps/web/src/cv/enrich/useFocusSession.ts:183` -> `!s.described`
- Waits for save, finds the current scored item and sends `{roleId,fingerprint}`; response `{text,keywords}` is displayed only if text is nonempty and the session is still describing/alive/open. `apps/web/src/cv/enrich/useFocusSession.ts:284` -> `waitForSave`; `apps/web/src/cv/enrich/useFocusSession.ts:288` -> `roleDescription`; `apps/web/src/cv/enrich/useFocusSession.ts:290` -> `s.view.step.kind`; `apps/web/src/cv/enrich/useFocusSession.ts:291` -> `answer.text`
- Save failures, HTTP 502 ai_bad_answer, HTTP 503 ai_unavailable and other exceptions silently skip the description and show roleDone; this is JSON, so interrupted responses likewise skip, without partially displayed text. `apps/web/src/cv/enrich/useFocusSession.ts:282` -> `text: ""`; `apps/web/src/cv/enrich/useFocusSession.ts:289` -> `catch`; `apps/web/src/cv/enrich/useFocusSession.ts:291` -> `: done`; `apps/web/src/cv/enrich/enrich-api.ts:52` -> `apiFetch`
- Edit initializes draft from proposed text, limits textarea length to MAX_LONG_TEXT, and disables Save for blank draft or busy state; Skip does not accept text. `apps/web/src/cv/enrich/DescriptionStep.tsx:18` -> `useState(text)`; `apps/web/src/cv/enrich/DescriptionStep.tsx:29` -> `MAX_LONG_TEXT`; `apps/web/src/cv/enrich/DescriptionStep.tsx:44` -> `onSkip`; `apps/web/src/cv/enrich/DescriptionStep.tsx:48` -> `draft.trim()`
- Keywords are displayed as chips but only the trimmed/capped description text is written. Use requires available state, a description step and nonblank text. `apps/web/src/cv/enrich/DescriptionStep.tsx:39` -> `keywords.map`; `apps/web/src/cv/enrich/useFocusSession.ts:492` -> `MAX_LONG_TEXT`; `apps/web/src/cv/enrich/useFocusSession.ts:493` -> `!available()`; `apps/web/src/cv/enrich/useFocusSession.ts:496` -> `field: "description"`
- The response contract allows empty text and at most eight keywords; each keyword is <=60 characters. `packages/shared/src/enrich.ts:294` -> `RoleDescriptionAnswerSchema`; `packages/shared/src/enrich.ts:296` -> `max(8)`
- Both suites mock enrich-api, so they do not exercise HTTP handling or response-schema validation. Description display, keyword chips, editing and dispatch are tested by `apps/web/src/cv/enrich/focus-mode.test.tsx:410` -> `it`. End-of-role generation, Use, edited Use, Skip, and empty/rejected answers are tested by `apps/web/src/cv/enrich/focus-session.test.tsx:958` -> `it`; `apps/web/src/cv/enrich/focus-session.test.tsx:966` -> `it`; `apps/web/src/cv/enrich/focus-session.test.tsx:971` -> `it`; `apps/web/src/cv/enrich/focus-session.test.tsx:977` -> `it.each`

## Connections

- Uses POST /v1/enrich/role-description and its shared response schema. `apps/web/src/cv/enrich/useFocusSession.ts:288` -> `roleDescription`; `apps/web/src/cv/enrich/enrich-api.ts:52` -> `/v1/enrich/role-description`; `apps/api/src/enrich/routes.ts:113` -> `/role-description`; `packages/shared/src/enrich.ts:294` -> `RoleDescriptionAnswerSchema`
- Used by FocusMode with Use/Skip delegated to the session. `apps/web/src/cv/enrich/FocusMode.tsx:279` -> `DescriptionStep`; `apps/web/src/cv/enrich/DescriptionStep.tsx:16` -> `DescriptionStep`; `apps/web/src/cv/enrich/useFocusSession.ts:490` -> `useDescription`
- Uses setItemField after roleListOf resolves experience/projects/volunteering; reducer ignores missing items, unknown/protected fields and unchanged values. `apps/web/src/cv/enrich/useFocusSession.ts:495` -> `roleListOf`; `apps/web/src/cv/enrich/useFocusSession.ts:496` -> `setItemField`; `apps/web/src/cv/edit/lists.ts:23` -> `roleListOf`; `apps/web/src/cv/edit/cvReducer.ts:188` -> `if (!item`; `apps/web/src/cv/edit/cvReducer.ts:240` -> `case "setItemField"`

## Assumptions

- Acceptance checks current item existence and session state, but not whether the description changed after generation; this differs from single-bullet callText protection. `apps/web/src/cv/enrich/useFocusSession.ts:493` -> `s.view.step.kind`; `apps/web/src/cv/enrich/useFocusSession.ts:495` -> `roleListOf`; `apps/web/src/cv/enrich/useFocusSession.ts:496` -> `value`
