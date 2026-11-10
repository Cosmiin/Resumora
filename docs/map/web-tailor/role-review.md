---
id: web-tailor/role-review
area: web-tailor
files: ["apps/web/src/tailor/RoleReview.tsx","apps/web/src/tailor/role-review.test.tsx","apps/web/src/tailor/projects-step.test.tsx"]
depends_on: ["web-tailor/role-panel","web-tailor/diff-words","web-tailor/client-section","web-tailor/role-done"]
contract: false
checked_hash: 5a3af0dd
cited: [396213, 76024c, 9aca46, 238187, b322df, 3cf775, 9c7b99, 8e7259, 1ecbcd, 175209, 5ce30b, ad08a6, 8241cb, 9cdc10, bf8b25, 7626b8, b7e90d, 1ad807, 04af80]
decisions: []
open: []
---
Review a role, project or volunteering item as original or proposed text.

- Starts in new view and filters out every proposal with flags. `apps/web/src/tailor/RoleReview.tsx:46` -> `view`
- Proposals are matched by itemId and field; displayed replacements cover the role description and existing bullet text. `apps/web/src/tailor/RoleReview.tsx:48` -> `find`; `apps/web/src/tailor/RoleReview.tsx:66` -> `description`
- Non-inferred text highlights diffWords changes; inferred text marks the entire proposal and exposes an optional reason tooltip. `apps/web/src/tailor/RoleReview.tsx:36` -> `proposal.inferred`; `apps/web/src/tailor/RoleReview.tsx:28` -> `tailor-guess`
- Using new sends ordinary decisions true but no inferred decisions, leaving guesses unresolved; original sends false for both groups. `apps/web/src/tailor/RoleReview.tsx:54` -> `decide`
- View switching changes display only; either acceptance button makes its own decision independent of selected view. `apps/web/src/tailor/RoleReview.tsx:62` -> `setView`; `apps/web/src/tailor/RoleReview.tsx:75` -> `decide(false)`
- Nothing-to-change copy uses the item's kind; removed count is shown separately, and acceptance is disabled while busy. `apps/web/src/tailor/RoleReview.tsx:71` -> `kindKey`
- tested by `apps/web/src/tailor/role-review.test.tsx:36` -> `describe`
- tested by `apps/web/src/tailor/projects-step.test.tsx:95` -> `it`

## Connections

- Used by both current-item review and earlier-role redo. `apps/web/src/tailor/TailorFlow.tsx:248` -> `RoleReview`; `apps/web/src/tailor/TailorFlow.tsx:289` -> `RoleReview`; `apps/web/src/tailor/RoleReview.tsx:45` -> `RoleReview`
- Uses global tailor-new, tailor-guess and adjacent tooltip rules; changing sibling markup affects hover/focus visibility. `apps/web/src/tailor/RoleReview.tsx:29` -> `tailor-guess-tag`; `apps/web/src/tailor/RoleReview.tsx:38` -> `tailor-new`; `apps/web/src/styles/tailor.css:95` -> `.tailor-new`; `apps/web/src/styles/tailor.css:99` -> `.tailor-guess-tag:hover`

## Assumptions

- Undecided guesses intentionally leave inferred empty; server acceptance defines whether those retained guesses need later review. `apps/web/src/tailor/RoleReview.tsx:56` -> `inferred: keep ? []`
