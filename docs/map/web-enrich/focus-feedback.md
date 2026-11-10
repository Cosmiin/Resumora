---
id: web-enrich/focus-feedback
area: web-enrich
files: ["apps/web/src/cv/enrich/FocusMode.tsx","apps/web/src/cv/enrich/ProposalStep.tsx","apps/web/src/cv/enrich/focus-mode.test.tsx"]
depends_on: ["web-enrich/focus-ui","web-enrich/focus-session","web-enrich/focus-acceptance","web-enrich/celebration","web-enrich/scores","shared/enrichment-score","shared/cv","web-editor/reducer","web-editor/page-fields"]
contract: false
checked_hash: 707d901f
decisions: ["docs/decisions/0012-ai-enrichment-scores-and-notes.md","docs/decisions/0013-focus-mode-graded-single-bullet-rewrites.md"]
open: []
---
Display provisional grades and before/after proposals until current role scores arrive.

- Display prefers a matching ready background score, then session/older results; accepted bullet grades and celebrated role scores fill the gap until fresh scoring arrives. `apps/web/src/cv/enrich/FocusMode.tsx:137` -> `fingerprint`; `apps/web/src/cv/enrich/FocusMode.tsx:140` -> `known`; `apps/web/src/cv/enrich/FocusMode.tsx:142` -> `accepted.get`
- The sidebar hand-copies >=75 for green bullet tags, mirroring shared band clear and clearCount. `apps/web/src/cv/enrich/FocusMode.tsx:181` -> `n >= 75`; `packages/shared/src/enrich.ts:278` -> `75`; `packages/shared/src/enrich.ts:284` -> `75`
- ProposalStep displays before/after text and grades and focuses Use; its is-low/is-up classes are fixed comparison styling, not a band calculation. `apps/web/src/cv/enrich/ProposalStep.tsx:17` -> `focus`; `apps/web/src/cv/enrich/ProposalStep.tsx:34` -> `is-low`; `apps/web/src/cv/enrich/ProposalStep.tsx:36` -> `is-up`
- Clicking Use records a displayed accepted grade before the session validates and applies the proposal; display state may therefore precede a rejected/rerun acceptance. `apps/web/src/cv/enrich/FocusMode.tsx:290` -> `setAccepted`; `apps/web/src/cv/enrich/FocusMode.tsx:291` -> `session.useProposal`; `apps/web/src/cv/enrich/useFocusSession.ts:508` -> `bullet.text !== s.callText`
- tested by `apps/web/src/cv/enrich/focus-mode.test.tsx:81` -> `describe`

## Connections

- Uses exhaustive ScoredKind SCORED_LIST for item naming and the exhaustive Locale PRESENT map through formatRange; dates themselves use Intl.DateTimeFormat. `apps/web/src/cv/enrich/FocusMode.tsx:135` -> `SCORED_LIST[kind]`; `apps/web/src/cv/edit/lists.ts:20` -> `Record<ScoredKind, RoleList>`; `apps/web/src/cv/enrich/FocusMode.tsx:147` -> `formatRange`; `apps/web/src/cv/page/blocks.ts:25` -> `formatRange`; `apps/web/src/cv/page/blocks.ts:4` -> `Record<Locale, string>`; `apps/web/src/cv/page/blocks.ts:22` -> `Intl.DateTimeFormat`
- Uses [focus-acceptance](./focus-acceptance.md): Use delegates to the text-checked proposal application. `apps/web/src/cv/enrich/FocusMode.tsx:291` -> `session.useProposal`; `apps/web/src/cv/enrich/useFocusSession.ts:508` -> `s.callText`
- Uses [celebration](./celebration.md) to show the session's before/after role score and resume with Next. `apps/web/src/cv/enrich/FocusMode.tsx:329` -> `CelebrateMoment`; `apps/web/src/cv/enrich/CelebrateMoment.tsx:24` -> `CelebrateMoment`

## Assumptions

- Supplied grades are already server-validated; ProposalStep has no independent better-score or factual check and delegates acceptance to the session. `apps/web/src/cv/enrich/ProposalStep.tsx:43` -> `onClick={onUse}`; `apps/web/src/cv/enrich/FocusMode.tsx:291` -> `session.useProposal`
