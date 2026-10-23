# Cross-review dispositions v1 — 2026-10-23

Firstmate-relayed inbox 001; sources read: architecture/handoff.md v1 and strategy/handoff.md checkpoint 1. Snapshots copied under artifacts/v1/sources. Product choices remain proposals. Current checks and browser limitations are recorded in the [verification receipt](verification.md).

| Request | UX response / concrete consequence | Status |
|---|---|---|
| Q-01 fixed section kinds + rename/reorder/custom evidenced sections, per-bullet approval | Yes for initial editor proposal. Stable IDs, fixed canonical section types, distinct display labels/order, optional evidenced custom section. Two positioning titles, two skill groups, explicit undo and history visible. Remove affects presentation; fact archive persists. Restoring creates a new version. | Accepted for prototype; implementation scope pending |
| Q-02 deterministic cached analysis and selective regeneration | Yes. Analysis bound to Base/job/CV/method versions. Editing invalidates visible analysis; user explicitly recalculates. Single-bullet and summary proposals replace full-document regeneration by default. Before/after displays illustrative semantic delta, independent readability and remaining required gaps. Unconfirmed facts earn no confirmed coverage. | Accepted; architecture H-03 still uncalibrated |
| Q-05 paste-first, one-column PDF, small template set | Retain URL/text/manual/extension discovery controls, URL failure→paste, explicit extension capture consent and manual review. Prototype shows two distinct one-column templates and their preview; proposed MVP can ship one tested template. All baseline coverage retained in specs; staging choices need owner approval. | Accepted as staged option, not scope removal |
| Strategy concern: cognitive load of two titles | Two fields grouped under optional positioning; title 2 may be blank. Employment title visibly separate. Explain only when editing: “Cum te prezinți; funcția din experiență rămâne factuală.” No second-title onboarding gate. | Incorporated |
| Strategy concern: professional/technical skill split | Two adjacent groups on desktop, stacked on mobile, examples/evidence shown. Users need not classify extracted skills before first save; review unresolved category explicitly. Score distinguishes groups without jargon in primary actions. | Incorporated |
| Strategy concern: confirmation is not independent verification | Use “Confirmat de tine”, “Extras · neconfirmat”, “Propunere”, and independently_verified only where actual external check exists. Synthetic fixtures are user-confirmed, never independently verified. | Incorporated; terminology correction to early handoff |
| Strategy concern: misleading score / synonyms | Score labels “compatibilitate estimată · exemplu”, method version and source evidence, required gap always visible. Approved RO/EN equivalent explicit; ambiguous potential needs confirmation; credentials never implied by synonyms. | Incorporated |
| Strategy scope: no automatic applications/letters | Marketing screenshots do not establish implementation requirements. The later lean manual tracker direction is recorded in [PRD §15](../../docs/product/prd.md#15-iteration-2-integrated-product-direction); automatic submission/outreach remains excluded. | Updated by later owner direction |

## Numbered objections / constraints for relay
UX-O01 Architecture's no-hard-cap semantic score is acceptable only with a persistent required-qualification warning on score, comparison and export preview. A high aggregate must not visually hide an unmet mandatory credential. No hiring probability.
UX-O02 H-03's accomplishment dimension should not reward invented metrics or disadvantage legitimate nonnumeric results. User-confirmed qualitative impact can be evidence; no pressure to provide confidential figures. Calibration unresolved.
UX-O03 Readability pass/warn/fail needs a separate untested state until actual rendered PDF extraction passes. Prototype preview cannot claim a PDF test passed.
UX-O04 Keep independent UI and CV language even with one tested template. English UI does not translate user facts automatically. Fixture translation is synthetic and explicitly labeled.
UX-O05 One-template/paste-first implementation is reasonable to review, but discovery must show all import paths and distinct template choices so omitted scope remains explicit.
UX-O06 Entitlement changes are server-confirmed in production proposal. Simulated checkout cannot display an actual invoice or actual payment success; prototype says “activat local în demonstrație”.

## Remaining dependencies
Current technical contracts and fixture pointers are indexed in the [architecture snapshot](../../research/architecture/README.md). Remaining product choices belong to the [decision register](../../research/strategy/publication/docs/product/decisions.md).

## Final strategy questions — inbox 003, 2026-10-23

**UX-F01 / CR-04/07/17: high score with missing authorization.** Accepted; the current [assessment contract](../../docs/product/prd.md#8-job-fit-cv-match-eligibility-and-recommendations) and [integrated Mara case](../../docs/product/prd.md#16-integrated-discovery-snapshot-v3--shared-synthetic-case-and-open-decisions) supersede the older country-X edge fixture. This is discovery evidence, not a legal determination.

**UX-F02 / CR-06/19: exclusive keyword-status precedence.** Accepted as a proposed display mapping pending D-11. The authoritative [keyword contract](../../docs/product/prd.md#7-jobs-matching-and-keywords) separates document wording from authorization attestation; the [screen specifications](../../research/ux/screen-specifications.md) describe the bounded demo.

**UX-F03 / CR-19: unknown second title.** Accepted. Title2 remains optional and may be blank. No auto-invention, penalty, onboarding block or inferred historical title. Title1 may also remain unknown during review; missing positioning is a question, not a licence to create a title. Two independent fields are grouped away from employment title in review/editor. `identityFields()` labels title2 optional; save requires name/email, not invented titles.

All CR-01–20 reviewed as relayed evidence. CR-02/03/05/08/09/15/16 are incorporated into PRD as calibration/sensitivity/source-version constraints owned by architecture/strategy, not independent UX validation. Genuine release choices are maintained in the linked decision register. This worker does not create duplicate approval tasks or silently approve them.

## Architecture owner feedback round 1 — inbox 004 (2026-10-23)

The six-annotation architecture feedback was dispositioned from the task-owned source snapshot. Its non-verbatim UX impact summary and source-line references are in `research/ux/architecture-impact-round1.md`; raw feedback material is excluded from this publishable package.

Current assessment semantics are owned by [PRD §8](../../docs/product/prd.md#8-job-fit-cv-match-eligibility-and-recommendations), technical preferences by [PRD §11](../../docs/product/prd.md#11-technicalcost-integration-snapshot), and versioned methods/fixtures by the [architecture snapshot](../../research/architecture/README.md). These pointers supersede the earlier pending-v2/single-score status. The visual review lifecycle is recorded in the [verification receipt](verification.md); product decisions remain separate.
