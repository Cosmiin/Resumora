---
id: shared/enrichment-checks
area: shared
files: ["packages/shared/src/enrich-checks.ts","packages/shared/src/enrich-checks.test.ts"]
depends_on: ["shared/cv"]
contract: true
checked_hash: de82224c
cited: [ea56e7, 9b416f, ed1ae3, 862aaa, 0948d8, 102431, c41f09, 5e1af5, a9b1fa, f00e5e, f7b0de, 9f9968, a25b40, fe0af7, ac9638, c43f9e, 2519cc, 35dbca, ea56e7, 9b416f, 780ee6, 4e4319, ea56e7, 9c5ec2, 543d7a, 0a42ef, 0948d8, 5e1af5, cc7370, 56cc39, 023328, 7ff367, ac9638, 1c94a7, ac9638, 05cfc9, dc0701, 8a2d18, 85b1d8, 684e5b, e0fd17]
decisions: ["docs/decisions/0012-ai-enrichment-scores-and-notes.md"]
open: []
---
Check CV wording and detect proposed numbers absent from supplied source text; callers decide whether to reject or flag them.

- PROPOSAL_MAX is 220 characters; ATS checks report long bullets, first person, missing dates/title, fewer than two or more than eight bullets, and selected unusual characters. `packages/shared/src/enrich-checks.ts:4` -> `PROPOSAL_MAX`, `packages/shared/src/enrich-checks.ts:33` -> `atsChecks`
- First-person checks distinguish lowercase/title-case words from all-caps acronyms, and exclude recognized Roman-numeral contexts before I. `packages/shared/src/enrich-checks.ts:17` -> `FIRST_PERSON_WORDS`, `packages/shared/src/enrich-checks.ts:25` -> `hasFirstPerson`
- Summary checks require two to four sentences, no detected first person, at most 600 characters, a role-title match and at least one digit. `packages/shared/src/enrich-checks.ts:67` -> `summaryChecklist`
- Role matching examines only the first experience item; it accepts the full title or any title word of at least four letters at word boundaries. `packages/shared/src/enrich-checks.ts:56` -> `mentionsRole`, `packages/shared/src/enrich-checks.ts:74` -> `mentionsRole`
- Skills checks combine all three skill groups, normalize case/whitespace, and scan only experience bullet text for tool-like tokens absent from the skill lists. `packages/shared/src/enrich-checks.ts:98` -> `skillsChecklist`
- Tool detection excludes a fixed acronym list and quarter tokens; it recognizes selected acronym, letter-digit, camel-case and dotted-name forms. `packages/shared/src/enrich-checks.ts:81` -> `NOT_TOOLS`, `packages/shared/src/enrich-checks.ts:86` -> `isToolLike`
- Number parsing treats a nonzero-leading separator group of three digits as thousands only without a scale; otherwise the last separator determines decimals. `packages/shared/src/enrich-checks.ts:135` -> `parseNumber`
- numbersIn applies configured English/Romanian scales, rounds scaled numbers to integers and unscaled numbers to six decimal places, dropping units. `packages/shared/src/enrich-checks.ts:119` -> `SCALES`, `packages/shared/src/enrich-checks.ts:147` -> `numbersIn`
- hasUnknownNumber compares normalized numbers and lowercased mixed letter/digit tokens against the union of supplied sources; number-with-unit tokens are excluded from the latter comparison. `packages/shared/src/enrich-checks.ts:169` -> `gluedTokens`, `packages/shared/src/enrich-checks.ts:176` -> `hasUnknownNumber`
- tested by `packages/shared/src/enrich-checks.test.ts:211` -> `hasUnknownNumber`

## Connections

- Used by API rewrite length rejection and web ATS guidance: `apps/api/src/enrich/rewrite.ts:30` -> `PROPOSAL_MAX`, `apps/web/src/cv/enrich/ScoreCard.tsx:2` -> `atsChecks` -> `packages/shared/src/enrich-checks.ts:4` -> `PROPOSAL_MAX`, `packages/shared/src/enrich-checks.ts:33` -> `atsChecks`. The AI instructions copy 220 rather than reading the constant, so changing PROPOSAL_MAX requires prompt updates too: `apps/api/src/enrich/focus-prompts.ts:16` -> `220`, `apps/api/src/enrich/rewrite-prompts.ts:12` -> `220` -> `packages/shared/src/enrich-checks.ts:4` -> `PROPOSAL_MAX`.
- Used by web summary/skills panels and tip rendering: `apps/web/src/cv/enrich/SummaryTools.tsx:2` -> `summaryChecklist`, `apps/web/src/cv/enrich/SkillsTools.tsx:2` -> `skillsChecklist`, `apps/web/src/cv/enrich/tips.ts:1` -> `AtsTip` -> `packages/shared/src/enrich-checks.ts:67` -> `summaryChecklist`, `packages/shared/src/enrich-checks.ts:98` -> `skillsChecklist`, `packages/shared/src/enrich-checks.ts:6` -> `AtsTip`.
- Used by API tailoring checks, cover letters and facts: `apps/api/src/tailor/checks.ts:1` -> `hasUnknownNumber`, `apps/api/src/tailor/letter.ts:2` -> `hasUnknownNumber`, `apps/api/src/enrich/role-facts.ts:1` -> `hasUnknownNumber` -> `packages/shared/src/enrich-checks.ts:176` -> `hasUnknownNumber`. In tailoring, an unknown number adds a flag rather than unconditionally rejecting the proposal; acceptSection can keep flagged text when the corresponding flag question is confirmed. `apps/api/src/tailor/checks.ts:53` -> `hasUnknownNumber` -> `packages/shared/src/enrich-checks.ts:176` -> `hasUnknownNumber`; confirmation `apps/api/src/tailor/accept.ts:127` -> `p.flags.length`, `apps/api/src/tailor/accept.ts:130` -> `flags.get`.

## Assumptions

- Numeric matching is not semantic fact verification: units are discarded and membership is checked across all source strings, without tying numbers to a person or achievement. `packages/shared/src/enrich-checks.ts:152` -> `const value`, `packages/shared/src/enrich-checks.ts:177` -> `const known`.
- These checklist thresholds are guidance, distinct from CV schema limits: `packages/shared/src/enrich-checks.ts:73` -> `600`, `packages/shared/src/cv.ts:140` -> `MAX_LONG_TEXT`.
