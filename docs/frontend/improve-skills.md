# Improve skills

Improve skills runs only after clicking the Improve skills button or explicitly retrying. Opening its URL, refreshing, navigating back, and ordinary manual edits never start a new operation. The click intent exists only in React state and is consumed once; it is not stored in the URL or persisted profile. A saved operation can be checked using its existing ID only before its original deadline. Refresh never renews the 90-second window; old receipts without a deadline are discarded. It extracts skills from accepted experience, then improves the combined existing, reserve and discovered inventory in a second model call. Empty stages are skipped.

## Response contract

Extraction returns `label`, `category` and `importance`. Cleanup returns those fields plus `sourceSkillIds`, with explicit removals containing `id`, `reason` and `confidence: high`. Tracking IDs associate renamed, split or merged rows with input skills; they are not evidence citations.

Validation checks object shape, field types, string/list limits, categories, importance and valid inventory IDs. Removed IDs cannot also be retained. There is no quotation matching, cited-fact lookup, named-tool support check, numeric-claim check, keyword grammar rejection or semantic merge/deletion gate. The prompts remain responsible for relevant extraction, concise naming, classification, meaningful retention and sensible removals. Inputs omitted by cleanup are carried forward unchanged.

Both categories show at most 20 skills. Overflow stays in the saved skills inventory. Ranking uses core/supporting importance followed by canonical alphabetical ordering. Synonym deduplication and explicit user exclusions remain.

## References removed

Skills have no source icon, source tooltip, imported-skill “View source” action, quotes, supporting experience links, inferred/explicit flag or origin label. Historical `skillEvidence` and `skillOrigin` fields are accepted only for compatibility and discarded during encode/decode; historical suggestion references are discarded too. Shared CV import provenance remains because other editor features use it.

A skill name alone does not demonstrate work experience; career prose uses actual experience evidence.

## Editing lock, saving and recovery

Improvement waits for prerequisite language resolution and prior saves before starting; the initial action is disabled until then. Once ready, the document controller blocks all profile mutations from preparation through inference and confirmed saving. Profile fields, additions/deletions, preview editing, appearance controls, generic Undo and improvement Undo are disabled. Mutation handlers also check the lock. Profile history/import navigation cannot interrupt the active flow. Late automatic score updates and profile integrations cannot mutate the locked document.

The improvement component alone can save its pending receipt, commit the inventory or recover the same operation. The inventory appears only after confirmed saving. Transient saves retry the identical write after 750 ms and 2 seconds, with manual retry/reconciliation available afterward. A pending or uncertain operation keeps the lock only until its absolute 90-second deadline, measured from the click. At expiry the attempt is discarded, active requests/polling are aborted, the previous skills remain and Profile editing unlocks. A fresh click creates a new operation ID; late results from the discarded attempt cannot apply. A confirmed missing receipt can be discarded earlier. Definite inference failure clears its receipt and releases the lock. Undo becomes available after successful publication and itself uses a confirmed save.

Snapshot ownership, fingerprint checks, idempotent operation receipts and save-conflict handling remain. Skill fingerprints and Undo identities serialize object keys in a stable order, including nested experience lineage and skill choices, so database JSON property ordering cannot be mistaken for an edit. Array ordering and actual values remain part of the identity. Refresh preserves the original deadline and cannot start a duplicate. The document controller enforces expiry even outside the skills view. If a database save was already dispatched, its identity remains available for reconciliation, but it loses publication rights: a late acknowledgement cannot display its discarded inventory, and the retained draft is saved against the acknowledged revision. A network outage can delay this persistence confirmation; the UI does not claim an unconfirmed rollback is saved. Provider processing already dispatched may still settle its accounting receipt. The contract fingerprint was versioned to invalidate receipts from the retired reference pipeline.

## Performance and verification

Removing quotes, fact IDs, basis and rationale reduces extraction output from seven fields per skill to three, and cleanup no longer receives per-skill evidence. Reference validation cannot cause retries. Two sequential provider calls remain, so a specific latency improvement requires live provider measurement.

[Generated synthetic model requests](../examples/skills-improvement-model-requests.json) show the actual prompts and schemas without personal data or credentials. Tests cover structural validation, ID bookkeeping, omitted rows, historical metadata, reference-free ranking, profile locking during generation/saving, recovery and Undo, and repeated refreshes after successful or failed improvement without a new generation call. Browser QA uses synthetic in-memory data on the managed local frontend; it does not establish hosted provider latency or persistence availability.
