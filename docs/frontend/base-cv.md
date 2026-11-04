# Base CV editor

My Profile is the main authenticated workspace. The current product covers authentication, CV ingestion, manual editing and enrichment of the Base CV. See the [handoff](../HANDOFF.md), [Profile guide](profile-document.md) and [content-language contract](content-language.md).

## Run and review

Use the [managed environment guide](../setup/environment.md). The active app normally opens at `http://127.0.0.1:15173/#/profile`; configuration determines the actual origin.

A person starts manually or imports a supported PDF/Word CV, reviews the extracted content, and edits the resulting Profile. One Base CV is allowed per account. Uploading another CV requires explicitly deleting the current Base CV first. Saved history and language versions belong to that Base CV.

Manual edits use inline fields and skill chips. The preview reflects the draft. Autosave coalesces changes after 650 ms; Save now validates a completed checkpoint. Incomplete drafts can still be autosaved. Source facts, confirmed answers and accepted generated wording remain distinct.

Experience enrichment uses contextual questions and an explicit acceptance step for rewritten wording. [Improve skills](improve-skills.md) runs extraction and cleanup after a click, blocks all Profile mutation, and has a 90-second attempt deadline. Content language is independent of interface language.

## Persistence component handoff

`HttpBaseCvAdapter` sends authenticated requests to the Worker CV gateway. `DocumentController` owns the latest draft, saved head, revision, unresolved writes and skills publication across views. Saves append immutable snapshots. Restoring a prior version creates another version rather than erasing history.

An uncertain write retains its request identity for reconciliation; retrying does not create a second write. Late results must not overwrite newer local edits. The skills deadline discards the attempt's publication rights while preserving any database-write reconciliation needed to keep the retained draft safe.

The production entrypoint uses the durable HTTP adapter. Memory adapters are synthetic test infrastructure. Account/session replacement retires the previous workspace and its asynchronous work; see the [authentication contract](../setup/authentication.md#session-and-request-contract).

## Code and replacement boundary

- `apps/web/src/App.tsx`: editor composition and save/navigation guards.
- `apps/web/src/workspace`: document lifecycle, workspace and history.
- `apps/web/src/components`: Profile, import review and enrichment UI.
- `packages/contracts/src/editor`: shared document model, codecs and projections.
- `apps/api/src/cv`: authenticated persistence API.

## Verification and limits

Use the [local development checks](../setup/local-development.md#checks). Component tests cover editing, validation, autosave, conflicts, history, late responses and account isolation with synthetic adapters. Provider quality, provider latency and hosted service availability require separate evidence; local tests do not establish them.
