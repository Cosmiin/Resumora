# Local Worker database gateway

For current API/web composition and its acceptance limits, see the
[Base CV persistence handoff](../frontend/base-cv.md#persistence-component-handoff).
The [authentication contract](../setup/authentication.md#session-and-request-contract)
owns session verification and response cookies.

`apps/api/src/db/supabase.ts` is a server module for that composition. The Worker
invokes `createDatabaseGateway(env, authContext)` only after Supabase
Auth has verified the request. Auth owns verification/refresh and response cookies; the gateway forwards
that original user access token to PostgREST. It accepts no acting user or tenant
argument. Supabase RLS and command authorization remain authoritative. A resource
UUID is never an authorization grant. Do not pass this context from browser JSON.

Use the Worker configuration in [authentication setup](../setup/authentication.md#local-configuration).
Never use a database password,
service-role JWT, `sb_secret_` key, browser Vite environment binding or privileged
SQL connection in the application. The gateway rejects privileged configuration,
does not log upstream bodies and does not retry writes automatically. Calls have
a 15-second timeout, refuse redirects and bound request/response bytes.

The connected project must expose schema `app` to PostgREST and have these reviewed
migrations installed. Neither this module nor the local `supabase/config.toml`
changes hosted API/Auth settings. Missing schema, transport or configuration fails
with `DatabaseError(503, 'DATABASE_UNAVAILABLE')`. Existing `PT400/401/403/404/409/410/413/422`
SQL states preserve their status; only known machine messages are returned.
Arbitrary database diagnostics remain private. Auth composition must forward
rotated/cleared cookies on error responses too.

## Unconfirmed editor state

Canonical P0–P3 publication requires valid confirmed factual graphs. Its profile
draft columns and revisions participate in publication, and are unique per tenant.
They cannot safely represent incomplete editor snapshots independently. The
additive editor extension therefore introduces one immutable snapshot table;
see the [migration inventory](traceability.md#migration-order-and-table-coverage).
It leaves all previous migration files intact.
Existing canonical profiles, publications, confirmation events and document heads
are untouched. This is application storage in Supabase, not a local database or
authentication implementation.

Each snapshot stores the exact JSON envelope:

```ts
{ schemaVersion: 'resumora-editor-draft/1',
  content: /* BaseDraft without answers */ {}, answers: [] }
```

Persistence owns inner editor validation, stable correlation/contribution IDs and
the question/answer/source envelope. SQL checks the envelope and a 1MiB per-payload
limit without confirming pending facts. Optional Add to CV remains separate from
saving an answer. Payload nulls and local IDs survive save/load/restore unchanged.
No history pruning or lifetime byte limit is introduced.

| Gateway | SQL RPC and named arguments |
| --- | --- |
| `loadDraft()` | `load_base_draft()` |
| `draftHistory({beforeRevision?,limit?} = {})` | `base_draft_history(p_before_revision,p_limit)` |
| `saveDraft({requestId,expectedRevision,mode,payload})` | `save_base_draft(p_key,p_expected_revision,p_payload,p_mode)` |
| `restoreDraft({requestId,expectedRevision,snapshotId})` | `restore_base_draft(p_key,p_expected_revision,p_snapshot)` |

Results are `{id,revision,parentId,createdAt,reason,payload,restoredFrom?}`. Revisions
start at one after initial expected revision zero; each save appends a snapshot.
Modes are `autosave` and `checkpoint`; the latter has reason `save`. Restore appends
a new snapshot with the historical payload and a new parent/revision. Reads never
create data; first save transactionally provisions the personal workspace using
the existing provision command. A revoked/deleting account cannot replay writes.

History defaults to 20 snapshots, maximum 20, newest first. Supply the last
returned revision as the exclusive cursor; an empty page ends traversal. Callers
must expose pagination or consume further pages, never imply a first page is the
whole history. History responses are bounded to 21MiB; individual responses 2MiB.

Keep one nonzero UUID request key with the exact body until the outcome is known.
Replaying it returns the original result before checking revisions. Changed-body
reuse is `409 IDEMPOTENCY_BODY_MISMATCH`; a stale newly keyed edit is
`409 VERSION_CONFLICT`; expired replay is `410 REQUEST_EXPIRED_RECOVER_EXISTING_RESOURCE`.
Preserve local changes on these errors. A wrong-owner/missing historical snapshot
returns `404 SNAPSHOT_NOT_FOUND`, revealing no other account's existence. Direct
table writes and the private shared writer are unavailable to authenticated users.

The gateway also maps `provisionWorkspace(requestId)` to the existing
`provision_workspace(request_key)` command. Its idempotency contract remains in
[api.md](api.md). Editor persistence saves unconfirmed draft snapshots and does
not invoke canonical publication; existing SQL publication commands are unchanged.

## PR evidence and delivery ownership

PR evidence for this component must identify the exact tested revision, commands,
results and environment. Gateway transport tests exercise mocked responses;
native SQL fixtures exercise synthetic Auth subjects. These checks provide
component evidence only and do not establish cloud connectivity or completed
account and persistence flows. No successful cloud integration is claimed here.

The [Base CV persistence handoff](../frontend/base-cv.md#persistence-component-handoff)
owns the connected milestone's remaining acceptance requirements. Gateway
component evidence does not complete or reduce that acceptance.

## Verification and staged development execution

Focused transport checks: `node --experimental-strip-types --test apps/api/tests/database.test.mjs`,
API typecheck and `node --test scripts/dev-secret-boundary.test.mjs`.
For native SQL checks, suite selection and coverage, see
[executable evidence](traceability.md#executable-evidence). These tests use
synthetic Auth subjects; they do not establish hosted integration.

Use the [runbook](runbook.md) after exact-head review, target/preflight, recovery
readiness and explicit development execution authority. Follow the
[migration inventory](traceability.md#migration-order-and-table-coverage) for
chronological prefixes and the final editor extension. Verify byte-for-byte manifests, supported
linked CLI dry-run, applied history, RLS/grants and no pending versions per prefix.
No history repair, reset, force or retrospective migration editing is permitted.

Record actual hosted server version/collation separately. Local PostgreSQL 16
evidence does not itself prove hosted PostgreSQL 17 compatibility. Hosted synthetic
Auth/API writes, cleanup and the final two-account save/reopen integration check
require their own available capabilities and authorization. No cloud mutations
are performed by gateway construction or these tests.
