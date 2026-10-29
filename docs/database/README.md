# Approved P0–P3 database implementation

Architecture 2.0.0 was explicitly approved for local implementation and staged apply to development project `aquvhqbkvrtzhbmezkci`, after read-only identity/schema/history/drift/backup review and passing local tests. Synthetic acceptance and cleanup are included. Production, real personal data, P4–P7, providers/paid services, DNS and deployment are excluded.

The frozen [plan](plan-v2.0.0.md) and [catalog](catalog-v2.0.0.json) remain the approved logical contract. Their original proposed/pending labels record the reviewed snapshot; this narrow P0–P3 approval supersedes those labels. The full roadmap is not an instruction to create later tables. The additive [editor draft gateway](gateway.md) delivers the Database component of the connected milestone; the [Base CV persistence handoff](../frontend/base-cv.md#persistence-component-handoff) owns composition and remaining acceptance status.

The [migration/test traceability](traceability.md) owns the ordered migration inventory, including the editor, connected vacancy/enhancement, photo, import/enrichment and job editor document extensions. The connected and import extensions remain subject to the separate apply boundaries in [connected setup](../setup/connected-jobs-ai.md) and [import setup](../setup/cv-import-enrichment.md#setup-and-activation-boundary). The [API contract](api.md) covers canonical publication, RLS and deterministic reviewed-evidence analysis; the [gateway contract](gateway.md) covers unconfirmed editor persistence; the [job editor adapter](../setup/job-editor-documents.md) documents independent accepted job revisions and their source boundary. Follow the [execution/recovery runbook](runbook.md) for hosted prerequisites and its [evidence limits](runbook.md#3-read-only-target-history-drift-and-data-classification) for the credential-free hosted TLS handshake and the still-unperformed authenticated SQL inventory and hosted migrations. Native SQL tests do not establish hosted Supabase or application integration.

The I2 job editor delivery is a backend foundation with no application caller yet. Wiring a job-scoped adapter into the existing editor and history from a saved vacancy belongs to the following integration slice; the R12 end-user journey remains incomplete.

## Canonical IDs and ownership

The [API contract](api.md#ids-at-the-canonical-boundary) owns database/canonical ID allocation, encoding and fixture mapping, including the separate photo asset ID contract.

The canonical factual contract is preserved: two independent title slots, professional/technical skills, partial dates, RO/EN, evidence/confirmation, and independent Base/job content. Generated prose/interviews remain deferred and rejected. The [template publication contract](api.md#template-publication) owns registered-version acceptance and its boundary with editor persistence; the [handoff](../frontend/TEMPLATE_AUTHORING.md#required-job-tailored-wiring) owns the remaining job tailoring/export wiring.

## Local verification

Run `python3 scripts/db/test.py --pg-bin /path/to/postgres/bin`, optionally supplying `--pg-share` and `--pg-lib` for relocated official binaries. Python uses only its standard library; PostgreSQL 16+ server/client binaries are required. No Docker service is required.

Also run `python3 -m unittest discover -s supabase/tests -p test_preflight.py -v`. Database CI uses PostgreSQL 16 on the Ubuntu 24.04 runner, with no repository secrets or hosted connection.

The runner creates its own disposable cluster, uses a private Unix socket with no TCP listener, executes ordered SQL migrations and real concurrent sessions, then stops and deletes only that cluster. It never accepts a hosted URL or inherits hosted PG defaults. Local `auth.users`, roles and `auth.uid()` are test doubles: SQL/RLS/constraints/concurrency are real, while Supabase GoTrue, JWT verification, PostgREST, email, Storage and browser behavior are not tested.

No user gets table DML on immutable graphs, roles, heads or request ledgers. Publication functions validate session-derived tenant and exact lineage. Default PostgreSQL PUBLIC function EXECUTE must be explicitly revoked in each function migration; schema-only default-privilege changes do not override that global default.

## Hosted boundary

No credentials belong in Git, arguments, logs or chat. `.env*` and Supabase link/cache state are ignored before access setup. Read-only preflight and recovery review are required before hosted migration apply. Use supported Supabase migration history, stable reviewed migration files, named phases, dry-run and `--skip-vault`; do not use remote reset, role/seed inclusion or mutable ad-hoc apply. The preflight helper only inventories; it never declares execution approved or invokes apply.
