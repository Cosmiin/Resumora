# Updating a profile from another CV

> Historical record. This is not the current specification or an active task list. Start with [the current handoff](../../HANDOFF.md).

Implemented 30 October 2026 as the first upload-safety slice of the [UX proposal](../../ux-simplification-proposal.md). The broader two-destination navigation and durable intermediate-draft roadmap are still proposals.

## User flow

From the Base CV editor, choose **Update from a CV** / **Actualizează dintr-un CV**. The upload surface explains that a profile represents one person and that an updated CV should belong to that person. Existing profiles are not offered the scratch/example replacement choices on this screen.

After processing (or opening a recent import), a populated profile stays active and unchanged. The new extraction opens in a separate comparison. Name, email and phone appear beside their current values. Differences trigger **This CV may belong to someone else**. Missing extracted names receive an explicit warning. Name comparison ignores accents, punctuation and token order; email comparison ignores case; phone comparison ignores formatting. These are warning heuristics, not identity verification. Changed names/contact details are allowed after deliberate review.

The user must confirm that the document belongs to them, select the information they want to use, and choose **Use selected changes**. Nothing is preselected, even if identity details match. A role or education entry additionally requires an explicit destination: a new entry or a particular existing one. List position never establishes identity. Two selected entries cannot overwrite the same destination in one submission.

For an existing role, only extracted fields in the selected group update; absent fields and old contributions remain, new contributions append, and the role ID stays stable. Existing enrichment answers keep their target. An outdated wording/rich-text override is cleared for an updated role so it cannot hide the selected changes; previous snapshots remain available. Skills append without collapsing meaningful punctuation such as C++/C#. Optional categories append without replacing existing categories. A partial explicit name retains a known counterpart. Language, photo and other presentation choices are retained.

Cancel update discards local selections without merging, deleting the saved import, or changing the profile. Switching imports or changing the current profile resets ownership confirmation and selection. Applying is blocked while the current profile has pending factual review or an unresolved save/conflict.

This is a one-person profile flow, not support for managing multiple people. There is no normal upload option to replace an existing profile wholesale.

## Persistence and boundaries

- The existing owned import session stores extraction. The comparison itself does not publish a Base draft or invoke another model.
- Applying builds an additive draft from the current profile. It uses the existing revisioned autosave coordinator and atomic import-confirmation save path. New facts are explicitly confirmed by the selected action; unselected facts are not copied into the profile.
- The save coordinator retains its conflict, exact-replay, account/session and deletion-generation protections. Applying checks that the reviewed profile still matches the current draft and that no write is unresolved.
- Candidate IDs are scoped to the import's source locators. Separate extractions may reuse an ID; imported-fact lookup and confirmation cannot attest an unrelated old fact with the same candidate ID.
- The current payload still carries one active import-review envelope. An earlier pending factual review must finish before another import can be applied. Previous extraction/source provenance remains in sources and snapshots.
- Comparison selections now autosave as owner-scoped import-review drafts. Acknowledged selections, destination choices and ownership confirmation return for the same profile checkpoint; changing that checkpoint requires fresh selection. Draft saving does not apply changes or invoke AI. See [two-destination workspaces](../../frontend/two-destination-workspaces.md).
- First-profile imports still use the existing staged review and existing automatic-acceptance policy for eligible high-confidence facts. This slice protects reimports; it does not retroactively undo earlier imported drafts.
- No schema, provider configuration, service restart, live account mutation or paid model call was needed to validate this slice.

## Verification

Focused synthetic coverage: 15 new upload/update checks, 37 existing import/review/removal checks, 43 editor/enrichment/Base-removal checks, and 7 API import-identity checks passed. Frontend and API TypeScript checks passed. The web production build passed using explicit public APP_ORIGIN/API_ORIGIN values during the recorded check.

Fresh-profile headless Chrome checks at desktop and a constrained 390 px layout confirmed ownership/selection/role-destination gates, preservation of the existing name, role ID and Q&A, two retained/added contributions, styled selects and no control overflow. These checks used only synthetic data and do not claim a walkthrough of the owner's signed-in browser or provider extraction quality.
