---
id: shared/exports
area: shared
files: ["packages/shared/src/index.ts","packages/shared/src/tense.ts","packages/shared/src/tense.test.ts","packages/shared/package.json","packages/shared/tsconfig.json"]
depends_on: ["shared/cv","shared/categories","shared/stored-cv","shared/dates","shared/imports","shared/move-other","shared/api-responses","shared/notes","shared/enrichment-score","shared/enrichment-focus","shared/enrichment-checks","shared/jobs","shared/tailoring","shared/match-score"]
contract: true
checked_hash: ff3c3aeb
cited: [dbf566, 0896ca, ee26f6, 26f874, 3d7f0e, 8e907c, 39897a, 56f65a, 259794, 679492, e59800, 928480, dbf566, af3b2f, dbf566, 2c564f, dbf566, dbf566, 900103, ac134d]
decisions: ["docs/decisions/0003-one-shared-description-of-a-cv.md"]
open: []
---
Expose the shared TypeScript contracts directly to the API, web app and extension.

- The package is private ESM; both runtime and type entry points are source TypeScript, not compiled output. `packages/shared/package.json:5` -> `"main"`
- The package pins zod to 4.6.7. `packages/shared/package.json:12` -> `"zod"`
- Package scripts run Vitest and TypeScript checking without emitting files. `packages/shared/package.json:8` -> `"test"`
- Type checking includes src and explicitly sets compilerOptions.types to ["node"] in the shared package configuration. `packages/shared/tsconfig.json:1` -> `types`
- The public Flag type comes from category flags; tailoring's Flag type is renamed TailorFlag, while its FlagSchema remains exported by the wildcard. `packages/shared/src/index.ts:18` -> `export type { Flag }`
- The unqualified Question and QuestionSchema belong to enrichment; tailoring exposes TailorQuestion and TailorQuestionSchema. `packages/shared/src/index.ts:20` -> `QuestionSchema`
- Match scoring exports computeMatchScore, bandOf, Seniority and the renamed MatchBand rather than wildcard-exporting its module. `packages/shared/src/index.ts:22` -> `MatchBand`

- Exports startsInPresentTense: only English is checked, using the lowercased first word with hyphens retained; endings in ed and the listed past verbs return false. `packages/shared/src/index.ts:8` -> `./tense.ts`; `packages/shared/src/tense.ts:3` -> `PAST_VERBS`; `packages/shared/src/tense.ts:12` -> `startsInPresentTense`.
- tested by `packages/shared/src/tense.test.ts:4` -> `startsInPresentTense`.

## Connections

- Used by the API workspace dependency: `apps/api/package.json:17` -> `@resumora/shared`; package entry `packages/shared/package.json:5` -> `"main"`.
- Used by the web workspace dependency: `apps/web/package.json:21` -> `@resumora/shared`; package entry `packages/shared/package.json:5` -> `"main"`.
- Used by the extension workspace dependency: `apps/extension/package.json:11` -> `@resumora/shared`; package entry `packages/shared/package.json:5` -> `"main"`.

## Assumptions

- Consumers must support TypeScript source entry points and .ts imports: `packages/shared/package.json:5` -> `"main"`; inherited checking uses Bundler resolution and allows TypeScript extensions: `tsconfig.base.json:5` -> `"moduleResolution"`, `tsconfig.base.json:13` -> `"allowImportingTsExtensions"`.
