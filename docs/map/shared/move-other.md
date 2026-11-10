---
id: shared/move-other
area: shared
files: ["packages/shared/src/move-other.ts","packages/shared/src/move-other.test.ts"]
depends_on: ["shared/cv"]
contract: true
checked_hash: 334ed1e6
cited: [589810, 78b49c, aa40c7, c553bc, 13f537, 977c9a, da03c8, 966fb2, a037be, 5072c4, fcd7dd, a6b991, 5d4e4f, 589810, 5523e3, 264e8f, d5993a, f30a88, 157862, a6b991, 49e0b6, 966fb2, a037be]
decisions: ["docs/decisions/0009-one-fixed-set-of-cv-categories.md"]
open: []
---
Move lines from a custom section into one supported structured CV list.

- MoveTarget allows certifications, courses, awards, interests, languages and projects only. `packages/shared/src/move-other.ts:3` -> `MOVE_TARGETS`
- A missing custom section returns the original CV unchanged. `packages/shared/src/move-other.ts:10` -> `const entry`
- Lines split on newlines, lose leading bullet markers and whitespace, and empty lines are discarded. `packages/shared/src/move-other.ts:6` -> `BULLET`, `packages/shared/src/move-other.ts:12` -> `const lines`
- The destination has room only up to MAX_ITEMS; accepted lines are clipped to MAX_TEXT. `packages/shared/src/move-other.ts:16` -> `const room`
- Overflow lines remain in the source custom section, but clipped tails of accepted lines are not preserved. The source section is removed when no overflow remains. `packages/shared/src/move-other.ts:18` -> `const names`, `packages/shared/src/move-other.ts:23` -> `custom:`
- Destination items append with fresh IDs and blank metadata; moved projects get the role-shaped fields and empty bullets/notes. `packages/shared/src/move-other.ts:29` -> `next.certifications`, `packages/shared/src/move-other.ts:44` -> `next.projects`
- tested by `packages/shared/src/move-other.test.ts:12` -> `moveOtherTo`

## Connections

- Used by web import review: `apps/web/src/imports/ImportScreen.tsx:65` -> `moveOtherTo` -> `packages/shared/src/move-other.ts:9` -> `moveOtherTo`.
- Used by web destination choices: `apps/web/src/imports/HeadingMap.tsx:1` -> `MOVE_TARGETS` -> `packages/shared/src/move-other.ts:3` -> `MOVE_TARGETS`, `packages/shared/src/move-other.ts:4` -> `MoveTarget`.
- Uses shared ID generation and list/text caps: `packages/shared/src/move-other.ts:1` -> `MAX_ITEMS` -> `packages/shared/src/cv.ts:8` -> `MAX_ITEMS`, `packages/shared/src/cv.ts:10` -> `MAX_TEXT`, `packages/shared/src/cv.ts:225` -> `newId`.

## Assumptions

- This helper trusts the TypeScript target and existing CV shape; it neither parses input nor validates the result before returning. `packages/shared/src/move-other.ts:9` -> `MoveTarget`, `packages/shared/src/move-other.ts:47` -> `return next`.
- Source details are treated as independent names, not parsed semantic records; company, dates and other metadata start blank. `packages/shared/src/move-other.ts:29` -> `issuer:`, `packages/shared/src/move-other.ts:44` -> `company:`.
