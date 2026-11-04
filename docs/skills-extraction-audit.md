# Skills extraction audit and implementation

Follow-up: [Improve existing skills](frontend/improve-skills.md) appends explicit cleanup, reserve inventory, atomic saving and session Undo to this implementation. That document records current language policy and verification; the results below describe the earlier extraction-only stage.

Date: 3 November 2026. Scope: the master profile's “Add skills from experience” action and its legacy experience-level acceptance helper. No provider credentials, models, database migrations, deployment or language-detection behavior were changed.

## Problems found

- Each input chunk stopped at eight skills, and the experience result stopped at 30 skills across both categories. The profile had no 30-per-category guard.
- Earlier experience results were immediately inserted, so processing order could consume capacity before more informative later results were known.
- The prompt prohibited inferred technical methods even when actions clearly demonstrated them. Professional inference had no explicit evidence classification or rationale.
- Category boundaries were inconsistent: the new brief includes technical implementation methods, whereas the old guidance emphasized explicitly named tools and technologies.
- Deduplication mainly folded case and whitespace. Cross-language labels and synonyms could repeat a competency.
- A valid short cached result never refreshed for a new extraction policy.
- Accepted skills retained source lineage, but detailed evidence stayed in replaceable experience receipts.
- The 3,000-token output limit was accompanied by a 25-second outer request deadline, a 30-second provider ceiling and a 45-second browser deadline. Raising tokens alone would leave extraction cut short.

## Implementation

The API uses a focused skills prompt/schema/parser and the existing per-experience request/recovery path. The input still includes visible accepted role, project and volunteering content plus confirmed, non-superseded enrichment answers. Answer questions provide context only; job titles, hidden content and draft answers are not skill evidence. Facts remain bounded to 2,000 characters, with at most 24 facts / 8,000 fact characters per chunk and 32 chunks per experience.

The model may return up to 30 technical and 30 professional candidates per chunk. Technical skills cover concrete implementation capabilities and technical methods as well as tools. Professional skills cover transferable analytical, interpersonal, business and coordination capabilities. Common ambiguous labels have consistent defaults: Requirements Analysis, Business Analysis, Process Improvement and business Workflow Design are professional; Data Validation, Data Modelling, API Integration, Software Testing and Workflow Automation are technical.

Each new candidate includes an exact quote, valid fact IDs, explicit/inferred basis, a brief rationale and core/supporting importance. Inference must follow concrete personal actions without assuming title-based abilities, leadership from participation, or tools from related work. A curated check additionally rejects common named tools absent from cited facts and unsupported numerical versions/standards. Semantic entailment still depends on the model; a valid quote alone cannot prove a skill.

Labels normally use 1–2 words. Established names may use up to eight words / 100 characters. Longer names are retained intact, not truncated into ambiguous fragments. A conservative shared alias table standardizes common labels and handles common Romanian/French/Spanish equivalents. Distinct skills such as SQL and Data Validation, Java and JavaScript, and C and C++ remain separate. Unknown synonyms rely on the model's canonical-label instruction; this is not a comprehensive multilingual ontology.

The profile waits for the batch, including deferred experiences, to settle before choosing additions. Core skills rank before supporting skills, followed by breadth of support across experiences, explicit evidence, and a stable label tie-break. Automatic additions respect the remaining capacity in each category. Existing content, identities and user exclusions remain authoritative. Prior saved/imported/manual lists above 30 are preserved rather than silently pruned; automatic extraction adds no further skills to a full category.

Optional evidence metadata is stored on each accepted skill Fact, independently of generation receipts. It retains original-language quotations and inference details through serialization. Existing readers continue to accept older Facts and receipts. Editing a skill through the existing editor creates a new authored Fact and does not falsely carry forward an old skill's inference metadata. Changed/removed source evidence can still trigger support warnings.

The skills-specific output ceiling is 12,000 tokens: up to 60 small structured records, bounded quotes/rationales and room for provider reasoning. It is a maximum, not a requested output length. Provider attempts have 60 seconds within a 90-second skills request budget, and the browser waits up to 95 seconds. Other operation budgets remain unchanged. Truncated/invalid output is not accepted as a complete inventory. These limits have transport tests but are not a live latency/cost benchmark.

## Parallel CV-language integration

Read the “Infer CV language across prompts” conversation and its design before implementation. The skills operation now uses the parallel work's `contentLocale` resolver, including detected language and explicit translation targets; it does not create another detector or trust the interface language as the CV language.

This skills brief explicitly requests internationally standardized labels, typically English regardless of source language. That is a deliberate **label-only exception** to the CV prose rule. Rationale follows the resolved document locale. Evidence quotations remain exact originals. Keep this exception when adding shared language instructions to other prompt builders. Cache identity incorporates the shared document-language identity; extraction policy version additionally refreshes legacy suggestions without modifying accepted skills.

## Representative examples

These are hand-reviewed expected outputs from fictional fixtures passed through real validation and consolidation with a mocked model. They are not claimed as observed live-model before/after generations.

| Fictional evidence | Previous limitation | Expected technical skills | Expected professional skills |
| --- | --- | --- | --- |
| Romanian analyst uses SQL to check imported records, integrates apps through REST APIs/Webhooks, automates approvals in Power Automate, documents requirements with beneficiaries | Unnamed technical methods were excluded by the prompt; category/synonym handling was inconsistent | SQL; Data Validation; API Integration; Power Automate (REST APIs/Webhooks can also be supported distinct candidates) | Requirements Analysis |
| Spanish retail supervisor organizes shifts, resolves colleagues' disagreements in individual meetings, negotiates delivery dates | Inference rationale and explicit/inferred basis were not recorded | None required | Team Coordination; Conflict Resolution; Negotiation |
| French QA engineer executes regression tests, records defects in Jira, models PostgreSQL tables and relationships | Technical methods were restricted to explicit names | Software Testing; Jira; Data Modelling; PostgreSQL | None required |
| Attends a presentation about API migration, explicitly did not implement it or manage anyone | No structured inference classification | None | None; participation does not establish Leadership |
| First role suggests 30 incidental technical skills; later role suggests 30 core technical skills | Immediate insertion favored the first role | The 30 core skills compete before insertion | Independently capped at 30 if supported |

## Validation record

Regression tests were first observed failing for the missing capacity, metadata, alias handling, source persistence, policy refresh, language resolution and deadline behaviors, then implemented. Tests exercise real parsers, request builders, serialization, UI components and consolidation; only network/model responses are mocked.

- API coverage: multilingual fixtures, empty/unsupported evidence, hidden/draft/superseded facts, inferred versus explicit metadata, category boundaries, aliases, 60 candidates, official names, unknown citations/numbers/tools, existing-skill deduplication, primary/fallback request serialization, outer deadlines and receipt settlement.
- Frontend coverage: one-click insertion without dialogs, full/deferred batch ranking, 30-per-category capacity, preservation of older/manual data and exclusions, stale cache refresh, concurrent edits, save gating, uncertain-operation recovery, partial failures, evidence round-trips and browser deadlines.
- Existing experience, guided-experience, import-skills, and skill-tag tests are included as focused compatibility checks.
- No live provider calls or production-data mutations were made. Fictional expected outputs do not establish live precision/recall or latency.
- Workspace-wide `npm run typecheck` is not green during concurrent language development: generalized content-locale strings still reach consumers typed as `ro | en`. The last check reported sites in API `enhancement-context.ts:85`, `experience-operations.ts:276,408`, and web `App.tsx:244,810,1437`, `DocumentContent.tsx:512`, `ExperienceEnrichment.tsx:1314`, `GuidedExperience.tsx:378,432`, `useExperienceScore.ts:35`. These are the parallel locale propagation work; they were not narrowed back to Romanian/English to make this task's typecheck pass.

One focused review found three lifecycle defects and all three received failing-then-passing regressions: deferred roles now participate before selection; insertion is armed only for an active discovery batch, so a later manual deletion cannot silently refill capacity; automatic insertion requires the current extraction policy, so failed refreshes cannot apply legacy classifications. Historical receipts remain readable.

Final results: **99 API tests passed; 69 frontend tests passed; `git diff --check` passed.** Whole-workspace typechecking remains blocked by the locale propagation sites above.

Commands used for the final focused verification:

```sh
node --experimental-strip-types --test apps/api/tests/skills-inventory.test.mjs apps/api/tests/skills-transport.test.mjs apps/api/tests/experience-assistant.test.mjs apps/api/tests/enhancement.test.mjs apps/api/tests/guided-experience.test.mjs
npm run test --workspace @resumora/web -- src/base/profile-skills.test.ts src/components/profile-skills.test.tsx src/components/experience-assistant.test.tsx src/base/intelligence-stream.test.ts src/components/import-skills.test.tsx src/components/skill-tag-rows.test.tsx
npm run typecheck
git diff --check
```

## Remaining limitations

High-confidence inference and uncommon semantic synonym handling remain model judgments. The alias table and tool-mention checks are intentionally conservative and incomplete. Imported/manual text is not automatically rewritten or reclassified. Existing inventories over 30 require deliberate user editing. Equal-priority selection uses deterministic heuristics, not a second whole-profile model call. Very large experiences remain subject to the existing bounded-input limits and the shared skills deadline. Live-provider semantic evaluation across professions/languages remains useful future validation.
