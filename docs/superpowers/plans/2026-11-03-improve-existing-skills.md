# Improve existing skills implementation plan

## Clarification revision (3 November)

The latest explicit answers supersede reserve editing and the 30-skill active cap below. Keep **20 technical + 20 professional** active, preserve overflow privately for future tailoring, and remove reserve controls from the profile. Natural labels follow the CV locale; prefer familiar established acronyms without inventing abbreviations or changing meaning. Improve continues to clean existing skills and discover new skills together. Experience editing must not apply skills implicitly; stale-result protection stays in place.

Implementation: separate the active cap (20) from discovery capacity (30 candidates/category/chunk); enforce the active cap in improvement, additions and future tailoring while keeping historical saved documents readable. Add bounded read-only recovery retries for uncertain inference and same-ID resumption after a missing receipt. Existing provider fallback remains bounded; never start duplicate paid generation after an unknown result. Retry transient staged saves twice using the identical write, stopping on edits/conflict or definite rejection. After exhaustion show a concise error and keep the original inventory. Update focused cap/acronym, hidden-reserve, recovery and save tests, then verify affected API/frontend tests, typechecking, build and browser UI.

> Use focused implementation and one final review. User approved product choices through two rounds of selectable questions; this extends the existing skills extraction/inference implementation.

## Accepted behavior

Only the explicit Improve skills action cleans existing active/reserve entries AND discovers new evidence-backed skills. Concise standard labels in the resolved CV language, preserving official product names, split combined entries, merge synonyms, correct categories, include manually edited entries. Keep meaningful self-declared skills; absence of evidence never justifies deletion. Remove only confidently meaningless/vague entries; retain uncertainty. Rank by overall career relevance, then evidence support, max 20 active per category; retain every other valid candidate in private reserves available only during future tailoring. Existing saved tailored CVs remain unchanged. Future tailoring can select self-declared skill labels but cannot invent experience from them.

Run against owned saved snapshots and fingerprint skills, reserves, locale, accepted experience evidence and exclusions. Persist pending operation identity for safe recovery; never start a second paid operation on uncertain failure. Reject stale results. Apply only a complete validated result after a confirmed save. Preserve subsequent edits. Session-only Undo restores the previous inventory and expires after another skills edit. Reuse existing locale resolver, prompt/classification policy, aliases, evidence metadata, provider routing and durable receipts.

## Minimal additive interfaces

- `BaseDraft.skillReserves?: {technicalSkills: Fact<string>[]; professionalSkills: Fact<string>[]}`.
- `Fact.skillOrigin?: 'self_declared' | 'experience'` (optional for legacy data).
- `BaseDraft.skillReview?: {operationId:string;fingerprint:string;snapshotId:string;revision:number}` pending review receipt, not CV prose.
- New shared `intelligence/skills-improvement.ts`: `SkillInventory`, `getSkillInventory(d)`, `withSkillInventory(d, inventory)`, `skillInventoryIdentity(d)` (inventory only), `skillReviewIdentity(d)` (all dependent input), `skillReviewFingerprint(d)` SHA256, `allInventorySkills(d, category)` returns active+reserve deduplicated by ID. Inventory includes both active arrays and `skillReserves` with both arrays always present.
- `SkillsImprovementResult`: `{schemaVersion:'skills-improvement/1', fingerprint:string, inventory:SkillInventory, removed:{id:string,label:string,reason:string}[]}`. Validate the whole result and old-item coverage; no silent loss.
- Dedicated `/v1/intelligence/skills` POST uses current snapshot, revision, profile target, stable operationId and input fingerprint. Durable existing rewrite receipts; no new DB operation type.
- `IntelligenceClient.improveSkills(context & {fingerprint:string}, recoverOnly?)` reads receipts for recovery, otherwise makes one request; validates full result.
- `DocumentController.commitSkillInventory(adapter, expectedReviewIdentity, inventory): Promise<boolean>` saves without first publishing; `undoSkillInventory(adapter): Promise<boolean>`; `canUndoSkillInventory(): boolean`. Retain same pending-save body on unknown outcomes; user edits must survive late acknowledgements.

## Tasks and ownership

- [x] Parent: shared contracts, backward-compatible decoding, review prompt/schema/validation, input completeness, API route/client with recovery and output fences. Tests first, including old entries omitted by AI, guessed tools, vague/self-declared, multiple-language facts, >30 candidates, partial provider failure and replay.
- [x] Save agent: document-controller staged inventory save + session Undo, focused tests for failed/lost acknowledgements, retries, concurrent edits, changed inputs, disposal, complete-only publication.
- [x] Tailoring agent: active+reserve eligibility/selection/materialization; self-declared evidence cannot support fabricated prose. No mutation of saved CVs. Focused tests for reserve promotion, source IDs, legacy snapshots and selection limits.
- [x] Parent: Improve skills UI, persistent operation recovery, inline status/Undo, hidden reserve retention. Keep existing Add skills action and existing manual editing working. Tests for click races, stale responses, failures and atomic UI publication.
- [x] Integrate, focused tests/typecheck/build and one read-only final review. Record actual verification; do not claim live semantic quality from mocked fixtures.

## Constraints

Preserve all unrelated unfinished files and the parallel CV-language work. No broad staging/reset, provider changes, new dependencies or live paid evaluation. No startup changes. Use Node from .nvmrc. Current branch is already a linked feature worktree. JSON storage is additive; check persistence boundaries rather than assuming schema migrations are needed. Tests remain proportionate to this extension.

## Final integration notes

Implemented and reviewed. See docs/frontend/improve-skills.md for behavior, prompt samples, verification and limitations. A narrow forward SQL freezer migration was necessary after the native regression proved reserve/review metadata leaked through the legacy copy path. It is tested locally and not applied to hosted Supabase. Two focused review findings were fixed with regressions: unrelated IDs in a merged row cannot consume originals, and inline edits retain self-declared origin.

## Follow-up: deletion, provenance and a single two-stage action

User requested deletion and a small hover source icon, plus combining the two AI buttons. Implement one explicit Improve skills action: extract experience candidates first, then improve the entire combined active/reserve/new inventory in one model request. Publish only the confirmed final inventory. Retain the existing locale resolution, caps, retry/Undo and stale-result guards.

Implementation steps: add regressions for ordering and provenance; persist deleted canonical labels so discovery respects removal; show source entry, exact evidence and rationale with hover/focus/tap access and a self-declared fallback; replace the duplicate button; verify targeted API, editor, save, language and tailoring regressions and desktop/mobile interactions. Refresh the synthetic model payload example.
