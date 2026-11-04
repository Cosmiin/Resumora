# Removal inventory — execution in progress

> Historical record. This is not the current specification or an active task list. Start with [the current handoff](../../../HANDOFF.md).

Active checkout remains /home/cosmin/.treehouse/AI-CV-Maker-V2-180668/13/AI-CV-Maker-V2. Candidate: /home/cosmin/.cache/resumora-removal-20261104.

Source preservation fingerprints, raw schema definitions and test logs are private execution artifacts in the candidate's .superpowers/sdd/2026-11-04-remove-job-product directory. No runtime secrets were copied.

Exact hosted checks: jobs=0, job editor documents=0, canonical CV documents=0, photo assets=0, integration operations=0, snapshot answers carrying origin=0, storage objects=2. These are inventory observations, not deletion results. Storage objects still require reference classification.

Keep: auth/account/tenant data; Base source/provenance/snapshots and history; import sessions/tasks; provider auth and shared CV accounting; Base languages, photos, voice, export and profile operations.
Remove: API jobs/extension modules, frontend Jobs/Extension screens/adapters, extension workspace; job/capture/workflow/application/analysis-only schema and RPCs; only attributable rows from shared stores.
Rewrite: shared auth cleanup; API dispatcher; Base workspace/language/export contracts; materialization and UUID/response helpers; Base removal and shared database guards; managed service scripts; current documentation/tests/fixtures.

The exact SQL object disposition is recorded in the forward migration once rehearsed. This inventory is not yet a ready-to-apply manifest.
