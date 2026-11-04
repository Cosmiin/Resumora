# Background CV import

Current source ownership and diagnostic boundaries are documented in [Import timing and ownership](cv-import-timing.md). Intake now requires a queue adapter; the former inline processing fallback has been removed. This follow-up does not verify the historical hosted/local deployment statements below.

My Profile also [discovers unfinished reviews across browsers](../frontend/pending-import-review.md), independently of the current browser URL. Confirmed, discarded and expired reviews are excluded.

The upload request now saves the original and queues the selected file before returning an `uploaded` receipt. It does not run inference. The account-scoped receipt URL is retained while the browser polls existing status. Reopening the URL or Recent imports reads the same operation; it cannot upload again or start a second paid request.

An independent worker atomically claims the saved task. It validates the original byte hash, performs document preflight, then starts a six-minute AI processing window shared by admission and extraction. CV extraction allows 40,000 output tokens, a four-minute primary attempt and a 330-second total stage budget; any eligible fallback receives the remaining stage time. Admission retains its small token/time budget. Other career/job runner limits retain their previous bounds. Time spent uploading or waiting on the queue does not consume AI time. A seven-minute lease includes preflight and settlement overhead; expiry produces an unknown outcome without redispatch.

The interface reports actual queued, document-checking and extraction states, with an accessible spinner, an explanation that detailed CVs can take a few minutes, a slower-reading message, and specific timeout copy. It invents no percentage. A saved-import read is bounded to 15 seconds, including clients that ignore AbortSignal. Each effect setup owns its request; cleanup aborts it, so React Strict Mode can start a replacement read instead of leaving a stale recovery guard and perpetual spinner. Failed status reads stop polling and show an explicit re-upload action. Upload requests are bounded to 60 seconds; queued and processing UI states each have a 450-second watchdog, outside the worker's six-minute AI budget. The response reader permits up to 1 MiB for CV extraction and extracted values/quotes can total 160,000 characters; source-upload, page-count and Word preflight bounds remain separate. Both Romanian and English are supported.

## Worker execution

The existing scheduled Worker drains up to two queued imports sequentially. This per-drain bound is not an aggregate concurrency limit. The checked-in schedule uses a minute cron; it does not establish hosted queue congestion or execution lifetime. Queue waiting is separate from the processing window. This change has not deployed a hosted Worker.

Wrangler local development does not automatically run the production cron. The [managed local environment](environment.md) therefore starts `scripts/import-worker.mjs --watch` alongside the API and frontend, using the same private configuration. Use `npm run dev:start` and `npm run dev:doctor`; do not start a second manual worker while the service is running.

The processor checks the queue every two seconds and claims only explicitly queued uploads. It does not regenerate historical unknown imports. AI must explicitly be on and its admission/extraction model bindings must be complete. Logs now belong to `journalctl --user -u resumora-dev.service`; earlier `/tmp` PID/log receipts describe retired manual processes.

For isolated debugging with the managed service stopped, `npm run worker:imports` remains an advanced command. It reads the same `apps/api/.dev.vars` file directly; this command alone does not start the browser or API.

## Persistence and authorization

Migration `20261031184256_cv_import_background_processing.sql` is applied to the existing Resumora development project. Its filename matches the hosted migration receipt. It adds a private queue and worker RPCs; existing unknown imports are not changed or enqueued.

Temporary source bytes are stored in the private queue so background execution needs no persisted browser access/refresh token or service-role key. The queue table has RLS and no direct API-role privileges. Payloads clear on completion, failure, cancellation, revocation or expiry, and cascade with import/profile removal. The worker verifies the queued bytes against the original source hash before inference.

Only the active owner can enqueue an uploaded import. The existing worker secret authorizes claims. Each lease scopes stage reservations, attempts and completion to one import. Cancellation blocks further dispatch and publication, while settlement of an already dispatched attempt remains possible. Concurrent claims, HTTP replay and expired leases never dispatch the same task twice. The existing source-span publication and review validation remain in use.

Supabase's static advisor reports the deliberately closed queue table as RLS-without-policies ([explanation](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)) and the explicitly worker-secret-gated RPCs as callable SECURITY DEFINER functions ([explanation](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable)). Direct table access, wrong-secret calls, cross-import calls, internal-helper calls and revoked-owner processing are covered by SQL denial tests. These findings were reviewed; no public source-byte access was granted.

## Validation

- 537 frontend tests passed, including real Strict Mode refresh, a never-settling read, missing saved imports, bounded cancellation, a stalled processing state and fresh file selection after restart. All 19 targeted import checks also passed after the final failure-screen changes.
- All 294 API tests passed, including native workerd background execution, lost-queue-acknowledgement races, source-ID cancellation and deferred cleanup after a durable cancellation. Native runtime testing holds extraction open, verifies the upload has already returned, polls status, replays the upload, then confirms one review from two stage calls.
- Virtual-time tests verify extraction remains active beyond 30 seconds and can accept fallback output at 264 seconds.
- The original P4 import suite also passed (13 focused checks). Seven real PostgreSQL queue tests cover owner isolation, closed payload access, concurrent claims, independent processing clocks, one-time publication, cancellation/settlement, expiry and revocation.
- Both TypeScript checks, the production web build and Worker dry-run build passed. The existing web bundle-size warning remains.
- Desktop 1136 × 884 and mobile 390 × 844 browser checks use synthetic clients and block actual `/v1` requests. Upload → queue → check → read → close page → reopen → review passed without a second upload or horizontal overflow and with no console exceptions.

Use the current native SQL suites for retained-product regression checks.

Failure at upload, recognition, extraction, fallback or saved-import recovery shows **Upload CV again** (**Încarcă CV-ul din nou**) above a fresh-start action. Selecting this action fences an uncertain previous operation before clearing the old file and import URL. A missing record can be cleared directly. No upload or paid request starts until the user selects a file again. Known terminal failures can reset immediately. If cancellation cannot be confirmed, its bounded request ends with a connection message and another explicit retry action.

Cancellation resolves a source-ID URL to the canonical operation ID before fencing. Object cleanup runs after the durable cancellation; a cleanup outage leaves the object for the existing purge_pending cleanup path and does not prevent a new explicit upload. A late result cannot publish over the cancellation. The failure screen hides the disabled upload dropzone and duplicate cancel action, retains an optional progress check, and makes restarting the primary action.

The refresh correction required no schema changes, service restart or live inference. Both the successful close/reopen flow and the forced-hanging-read → re-upload prompt → old-attempt cancellation → fresh chooser → one newly selected upload → review flow were exercised in the browser under Strict Mode at desktop and mobile widths. Their captures are in the conversation visualization directory under `import-refresh-success` and `import-refresh-failure`.

The additive `p8_cv_import_40k_output` migration extends only the three existing worker-lease checks from 120 to 420 seconds. Ownership, cancellation, private-byte clearing, expiry and execution grants are retained. A 40K ceiling removes the observed 8K truncation bottleneck; it is not evidence of 99% document coverage. Coverage must be measured against representative CVs.
