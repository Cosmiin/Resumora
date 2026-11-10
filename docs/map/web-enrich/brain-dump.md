---
id: web-enrich/brain-dump
area: web-enrich
files: ["apps/web/src/cv/enrich/BrainDumpStep.tsx","apps/web/src/cv/enrich/focus-mode.test.tsx"]
depends_on: ["web-enrich/answers","web-enrich/focus-ui","web-enrich/focus-answers","web-enrich/focus-generation","web-enrich/focus-acceptance","web-enrich/item-lines","web-enrich/voice-recording","shared/enrichment-score","shared/enrichment-focus","shared/cv"]
contract: false
checked_hash: 8b4f9445
decisions: ["docs/decisions/0012-ai-enrichment-scores-and-notes.md","docs/decisions/0013-focus-mode-graded-single-bullet-rewrites.md"]
open: []
---
Collect free-form evidence and select graded bullets or ungraded item lines.

- BrainDumpStep caps changes to MAX_LONG_TEXT, uses the shared BRAIN_DUMP_QUESTION for its synthetic question, and sets maxSeconds=120 rather than the ordinary VOICE.maxSeconds=60. `apps/web/src/cv/enrich/BrainDumpStep.tsx:34` -> `BRAIN_DUMP_QUESTION`; `apps/web/src/cv/enrich/BrainDumpStep.tsx:58` -> `MAX_LONG_TEXT`; `apps/web/src/cv/enrich/BrainDumpStep.tsx:62` -> `120`; `packages/shared/src/enrich.ts:288` -> `maxSeconds: 60`
- Working brain dumps make the textarea read-only and hide the mic; empty results retain the box and show a status message. The draft is owned by the parent through value/onChange. `apps/web/src/cv/enrich/BrainDumpStep.tsx:56` -> `value={value}`; `apps/web/src/cv/enrich/BrainDumpStep.tsx:61` -> `readOnly={working}`; `apps/web/src/cv/enrich/BrainDumpStep.tsx:66` -> `empty`; `apps/web/src/cv/enrich/AnswerBox.tsx:90` -> `!readOnly`
- DumpPickStep starts every graded bullet selected, but no light-item lines selected; None sends an empty ID list, while Add is disabled with no picks. `apps/web/src/cv/enrich/BrainDumpStep.tsx:99` -> `new Set(lines ? []`; `apps/web/src/cv/enrich/BrainDumpStep.tsx:125` -> `onAdd([])`; `apps/web/src/cv/enrich/BrainDumpStep.tsx:128` -> `picked.size === 0`
- Pick score tags hand-copy >=75, mirroring shared band's clear threshold; roleAfterAll is shown as an estimate when non-null, even when a subset is selected. `apps/web/src/cv/enrich/BrainDumpStep.tsx:117` -> `p.score >= 75`; `packages/shared/src/enrich.ts:278` -> `75`; `apps/web/src/cv/enrich/BrainDumpStep.tsx:122` -> `roleAfterAll`
- tested by `apps/web/src/cv/enrich/focus-mode.test.tsx:313` -> `describe`

## Connections

- Uses [focus-answers](./focus-answers.md): the parent submits the free-form draft through the same note-saving path as question answers. `apps/web/src/cv/enrich/FocusMode.tsx:252` -> `session.submitAnswer`; `apps/web/src/cv/enrich/useFocusSession.ts:460` -> `setNote`
- Uses [focus-acceptance](./focus-acceptance.md): selected proposal IDs reach addSelected, which dispatches addBullets. `apps/web/src/cv/enrich/FocusMode.tsx:258` -> `session.addSelected`; `apps/web/src/cv/enrich/useFocusSession.ts:537` -> `addBullets`
- Uses [item-lines](./item-lines.md): the same picker starts unselected for lightweight item lines. `apps/web/src/cv/enrich/FocusMode.tsx:421` -> `DumpPickStep lines`; `apps/web/src/cv/enrich/BrainDumpStep.tsx:99` -> `lines ? []`

## Assumptions
