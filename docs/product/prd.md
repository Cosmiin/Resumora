# Resumora product

Resumora supports authentication, CV ingestion and enrichment of a person's Base CV. My Profile is the main workspace: sign in, import a PDF or Word CV or start manually, review the extracted content, edit the profile, and enrich experience through questions and explicitly accepted wording.

Each account has one Base CV. Importing another requires explicitly removing the current one first. Base removal clears its content, history, language copies and associated private files while preserving the account.

Experience answers are retained separately from accepted CV wording. Skills improvement extracts candidates from accepted experience, then cleans up the combined skill inventory. It blocks all Profile edits while running. At 90 seconds the attempt is discarded, previous skills are retained, and editing unlocks; a later click starts a fresh attempt.

Interface language and CV content language are independent. Language detection and correction preserve accepted wording. Saved history, language versions and document presentation support the Base CV workflow.

Uncertain saves retain the user's draft and their request identity for recovery. A late or discarded model result cannot overwrite subsequent edits. The current architecture and verification evidence are in the [handoff](../HANDOFF.md).
