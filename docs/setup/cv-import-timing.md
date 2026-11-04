# Import timing and ownership

This source change instruments the existing import path; it does not establish hosted latency or throughput. It adds no database structures, worker dispatch path, browser queue privileges, paid call, model override or concurrency change.

## Reading the baseline

`cv-import-timing` debug events use a closed, content-free envelope: version, clock domain, opaque operation/stage identities, primary/fallback label, phase, edge, wall-clock observation and local monotonic duration. They exclude user IDs, source hashes, paths, filenames, bytes, prompts, output and credentials. Each recorder emits at most 64 events, keeps no growing buffer, sends no telemetry HTTP requests, and neither awaits nor retries its sink. Sink failures are swallowed. Existing accounting and persistence remain authoritative.

| Phase | Boundary and interpretation |
| --- | --- |
| `upload_acknowledgement` | Immutable Storage write through the durable `uploaded` receipt. Request body reading, hash computation and initial reservation precede this span. |
| `queue_acknowledgement` | Enqueue RPC through its acknowledgement. Lost acknowledgement is `unknown`, even if the queue committed. |
| `queue_claim` | Worker observation after a successful claim. Duration is null: the existing claim/status RPCs expose no queue timestamps. |
| `preflight` | Queued-byte decoding/hash verification, format processor and page validation. |
| `stage_reservation` / `attempt_reservation` | Existing durable stage/attempt reservation calls, separately timed and identified. |
| `provider_round_trip` | Immediately before fetch dispatch through bounded response-body reading and JSON decoding. Includes transport/provider queuing and body decoding; **not pure provider inference time**. Request construction precedes it; output validation follows it. Redirects terminate at body cancellation. |
| `validation` | Provider output JSON parsing and the configured domain validator, before attempt settlement. The operations layer's repeated defensive validation is outside this span. |
| `attempt_settlement` | Durable ledger finish, after the provider/validation attempt. Failure propagates as before and cannot allow fallback or return a review. |
| `review_publication` | Final worker publication RPC. `complete` requires an acknowledged record matching the claimed source, operation and requested state. A lost response, null cancellation/expiry receipt, or mismatched receipt remains `unknown`. This is review availability, never Profile saving. |
| `terminal_settlement` | Non-review terminal result persistence, with the same acknowledgement requirement. |
| `browser_upload_acknowledgement` | Browser upload call through a validated public response. Includes browser/server transport and response handling. |
| `browser_discovery` | From explicit upload dispatch, or a refresh/reopen read, until this browser accepts a valid ready review. Includes polling and elapsed time only in that browser session. A refresh starts a new observation; its initial identifier may be the source ID in the URL. |
| `browser_ready_observed` | One observation of that ready review with the canonical operation ID from the public response, for correlation with server events. |

`start` and `observed` events have null duration. A missing end stays unknown; it is never zero. `unknown` ends measure only elapsed time until the interruption/failure, not a completed stage. `complete` describes the named boundary, not model success or Profile confirmation. No per-poll timing events accumulate. Strict Mode can leave an abandoned discovery start, but a superseded response cannot complete it or the replacement session.

Use monotonic durations only within a clock domain. Wall timestamps help correlate logs but can differ across hosts. The server enqueue-ack → claim observation interval is only an observed interval: it omits commit-to-ack time, includes claim-response time, can be reordered by a racing worker, and must not be presented as exact queue residence. Browser wall time minus server publication time is also **not** an exact browser discovery delay. Keep those timestamps separately; use the browser observation interval and polling interval (1.5 seconds plus request time/scheduling) as browser evidence.

Existing attempt `startedAt`/`finishedAt` include application work and exclude some persistence. Do not rename their difference “inference time.” Use the new separate spans and unexplained gaps to investigate application overhead; nested/different-domain intervals must not be blindly summed.

## Ownership and failure handling

Intake requires `enqueue`. A missing queue adapter fails before a reservation or Storage write; it cannot fall back to preflight or AI. Intake owns reservation, immutable original upload, acknowledgement, status/source reads and cancellation. The worker owns preflight, admission → extraction, validation, attempts and review publication. The Storage original and private temporary queue payload remain separate and retain their existing authorization/lifecycle purposes.

An HTTP replay only reads the existing operation. A lost queue acknowledgement reads current state without overwriting a worker result or clearing bytes. Unknown/expired work is not redispatched. Cancellation is durably fenced before cleanup; a cleanup failure remains recoverable through the existing purge path. Original hashes, ownership/revision checks and attempt accounting are unchanged.

`useImportSession` owns the browser operation, upload/poll/read deadlines, Strict Mode recovery, cancellation and stale-response fencing. `ImportDocument` owns presentation and connects the existing review components. The shared public status validator permits metadata-only ready receipts for recent/pending discovery; opening a ready review requires the existing validated review body. No worker/storage fields are accepted in this contract.

Review choices remain in the review/workspace controllers. Review autosave does not publish a Profile. Only a successful atomic Profile save records confirmation; failed saves retain the recoverable review.

## Timing evidence

Synthetic transport tests hold the response body and persistence acknowledgements independently. A fake clock deliberately assigns stage reservation 5 ms, attempt reservation 7 ms, provider/body 24 ms, validation 3 ms and attempt settlement 17 ms; the reported spans match those boundaries. These numbers are **test inputs, not measured production latency or a speedup**. Tests also cover absent completion, null publication, failed settlement, rejected/hanging telemetry sinks, HTTP replay, uncertain enqueue, hash mismatch, cancellation, refresh deadlines and stale responses.

The smallest useful owner run is one already-authorized representative synthetic PDF import with an open browser: retain only its operation ID, phase events and ready observation, and compare the output with the fixture's expected content. Use synthetic content and explicitly authorized provider calls; timing collection is not permission to initiate an additional paid run. If the first import is inconclusive, report unknown boundaries instead of automatically retrying it.

For exact queue residence, an already-authorized database operator can inspect only the recorded operation and synthetic tenant through their existing private SQL interface. Do not grant a new browser endpoint or read queue payloads, leases or secret tables:

```sql
SELECT s.operation_id, q.created_at AS enqueued_at, q.started_at AS claimed_at,
       extract(epoch FROM (q.started_at - q.created_at)) * 1000 AS queue_wait_ms
FROM app.cv_import_tasks q
JOIN app.cv_import_sessions s ON s.source_id = q.source_id AND s.tenant_id = q.tenant_id
WHERE q.tenant_id = :'test_tenant'::uuid
  AND s.operation_id = :'operation_id'::uuid
LIMIT 1;
```

A missing row or null `started_at` leaves queue wait unknown. Agents did not execute this query against a hosted database. The existing queue may be cleaned up before measurement.

One sample can identify where to investigate; it cannot establish percentiles, congestion or aggregate capacity. Request-triggered work or parallelism requires verified execution lifetime and aggregate capacity first. Compact extraction schemas, lower token limits, alternate models and task-specific reasoning require representative quality/latency evidence first. Partial JSON streaming does not establish a validated review. None of these optimizations is included.

## Local verification for this change (2 November 2026)

- Final focused API run: **113 passed**, including native workerd dispatch, immutable upload replay/lost acknowledgements, worker hash checks, null publication and provider timing/settlement failures.
- Final focused browser/workspace run: **95 passed** across 12 files, including Strict Mode, hanging reads, client/account fencing, pending-review recovery and failed saves.
- A single broad frontend run passed 615 of 616 tests and exposed a same-session refresh regression. It was fixed; the final focused run includes all 17 session-recovery tests. Independent review then identified a related deferred-poll race; its added regression test failed before the fix and passed afterward. The broad suite was not repeated.
- API/web type checks, local smoke, secret-boundary test and `git diff --check` passed. Web build and Worker dry-run build passed with command-local `APP_ORIGIN=http://127.0.0.1:5173 API_ORIGIN=http://127.0.0.1:5173`. No configuration file was changed. The existing large-bundle warning remains.
- Native PostgreSQL queue/pending-review tests could not run because PostgreSQL binaries are unavailable. No hosted database substitute was used. Existing SQL ownership, expiry and atomic-save contracts were not changed; this session adds no fresh native SQL evidence.

These results validate local application behavior. They do not establish hosted runtime limits, real-provider latency, extraction quality, Storage acceptance or production readiness.
