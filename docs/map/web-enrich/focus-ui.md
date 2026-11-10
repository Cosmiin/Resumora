---
id: web-enrich/focus-ui
area: web-enrich
files: ["apps/web/src/cv/enrich/FocusMode.tsx","apps/web/src/cv/enrich/focus-context.ts","apps/web/src/cv/enrich/ImproveButton.tsx","apps/web/src/cv/enrich/focus-mode.test.tsx","apps/web/src/cv/enrich/sections-path.test.tsx"]
depends_on: ["web-enrich/focus-session","web-enrich/focus-answers","web-enrich/focus-generation","web-enrich/focus-facts","web-enrich/focus-feedback","web-enrich/answers","web-enrich/question-step","web-enrich/brain-dump","web-enrich/role-description","web-enrich/item-lines","web-editor/page","web-editor/bullets"]
contract: false
checked_hash: 74969f83
cited: [b60e8e, debcbd, dfb1ab, f440e3, cc5227, 87be6c, 9232b3, 2b52f4, bda8cc, 7a9736, b67b75, 863efa, 5373ca, 082875, 0f63aa, 7475e7, 625540, f8342f, 9405ee, 10d58e, a006b8, e447d6, 81b987, 084f81, e73d7b, f1ff66, 4407dc, ba4d5e, 1ac3c2, 19a930, 7ff2fc, b15b7a, 335a2e, 8600e7]
decisions: ["docs/decisions/0012-ai-enrichment-scores-and-notes.md","docs/decisions/0013-focus-mode-graded-single-bullet-rewrites.md"]
open: []
---
Mount the focus dialog and route navigation, drafts and failures through the session.

- useFocusFrame locks body scrolling, restores the previous overflow and opener focus on cleanup, and handles Escape/Tab on document even when focused content disappears. `apps/web/src/cv/enrich/FocusMode.tsx:41` -> `opener`; `apps/web/src/cv/enrich/FocusMode.tsx:43` -> `overflow = "hidden"`; `apps/web/src/cv/enrich/FocusMode.tsx:59` -> `Escape`; `apps/web/src/cv/enrich/FocusMode.tsx:71` -> `document.activeElement`
- Guided-path Next and Close both close the session (including fact generation); a moving flag determines whether closure advances or leaves the path. `apps/web/src/cv/enrich/FocusMode.tsx:93` -> `finish`; `apps/web/src/cv/enrich/FocusMode.tsx:95` -> `moving.current`; `apps/web/src/cv/enrich/FocusMode.tsx:320` -> `moving.current = true`; `apps/web/src/cv/enrich/FocusMode.tsx:321` -> `session.close`
- Ramble draft lives above the step and survives failed calls; Back restores a prior answer. Answers-source generation shows a working screen instead of reopening the ramble box. `apps/web/src/cv/enrich/FocusMode.tsx:106` -> `setDump`; `apps/web/src/cv/enrich/FocusMode.tsx:118` -> `prefill`; `apps/web/src/cv/enrich/FocusMode.tsx:145` -> `answersWorking`; `apps/web/src/cv/enrich/FocusMode.tsx:238` -> `Working`
- Failed steps distinguish saving/unavailable copy and expose Skip/Try again; the session maps both 502 ai_bad_answer and 503 ai_unavailable to unavailable. `apps/web/src/cv/enrich/FocusMode.tsx:299` -> `step.reason`; `apps/web/src/cv/enrich/FocusMode.tsx:302` -> `session.skip`; `apps/web/src/cv/enrich/FocusMode.tsx:305` -> `session.retry`; `apps/web/src/cv/enrich/useFocusSession.ts:268` -> `unavailable`
- ImproveButton renders only with a focus context and sends `{roleId,bulletId,mode:"improve"}`; the context default is null. `apps/web/src/cv/enrich/ImproveButton.tsx:7` -> `if (!open)`; `apps/web/src/cv/enrich/ImproveButton.tsx:14` -> `open`; `apps/web/src/cv/enrich/focus-context.ts:10` -> `null`
- tested by `apps/web/src/cv/enrich/focus-mode.test.tsx:81` -> `describe`
- tested by `apps/web/src/cv/enrich/sections-path.test.tsx:131` -> `describe`

## Connections

- Used by editor provider/dialog mounts; the provider is null for tailored documents. BulletList currently exposes the sparkle only for nonblank experience bullets, although focus sessions support all scored kinds. `apps/web/src/cv/Editor.tsx:229` -> `FocusOpenProvider`; `apps/web/src/cv/enrich/focus-context.ts:12` -> `FocusOpenProvider`; `apps/web/src/cv/Editor.tsx:270` -> `FocusMode`; `apps/web/src/cv/enrich/FocusMode.tsx:86` -> `FocusMode`; `apps/web/src/cv/edit/BulletList.tsx:110` -> `ownerList === "experience"`; `apps/web/src/cv/enrich/ImproveButton.tsx:5` -> `ImproveButton`
- Uses the session hook for all generation and CV edits; UI does not call a whole-role rewrite stream. `apps/web/src/cv/enrich/FocusMode.tsx:98` -> `useFocusSession`; `apps/web/src/cv/enrich/useFocusSession.ts:129` -> `useFocusSession`
- Uses [focus-feedback](./focus-feedback.md): the proposal view records its displayed grade before invoking session acceptance. `apps/web/src/cv/enrich/FocusMode.tsx:282` -> `ProposalStep`; `apps/web/src/cv/enrich/ProposalStep.tsx:43` -> `onClick={onUse}`; `apps/web/src/cv/enrich/FocusMode.tsx:290` -> `setAccepted`

## Assumptions

- The focus trap treats every matching descendant as visible; changing the dialog to hide focusable descendants requires revisiting this selection. `apps/web/src/cv/enrich/FocusMode.tsx:66` -> `querySelectorAll`; `apps/web/src/cv/enrich/FocusMode.tsx:33` -> `FOCUSABLE`
