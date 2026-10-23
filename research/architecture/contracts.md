# Module, API and workflow contracts v2

Proposal only; no server exists. UTF-8 JSON, API `/v1`, authenticated tenant from session, stable opaque IDs. UI locale `uiLocale` is a preference; document language `locale` belongs to each document/version. Responses include `requestId`, version refs, safe errors; never raw provider errors, secrets or full CV text in logs. External strings are inert data, not instructions. All writes validate payloads and ownership on server; cookie sessions use HttpOnly/Secure/SameSite plus CSRF and origin checks. Extension uses short-lived scoped tokens instead.

## Shared envelopes and concurrency

Commands carry `Idempotency-Key`; same tenant+operation+key+body hash returns the original result, different body returns409 `IDEMPOTENCY_BODY_MISMATCH`. Keep idempotency records at least as long as supported retries, proposed7days and longer for billing event IDs. Draft mutations use `If-Match: draft-revision`; mismatch409 `VERSION_CONFLICT` returns current revision and changed item IDs. Preserve local unsaved content; offer comparison, no last-write-wins fact overwrite.

Async acceptance202: `{operationId,state:'queued',statusUrl,retryAfterMs:1500,inputVersions,quotaReservationId}`. GET status includes enum `queued|running|needs_input|succeeded|failed_retryable|failed_final|cancel_requested|cancelled|expired`, `phase`, `attempt`, `progress:{done,total?}`, `resultRefs`, `errorCode`, `retryAfterMs`, `createdAt`, `updatedAt`. Phase names are operation-specific; progress unknown is null, not invented percentages. Terminal success means durable result persisted; render success additionally needs its PDF checks. `untested` readability remains until extraction runs.

Domain errors:400validation,401session expired,403not entitled/forbidden,404owning-resource absent,409conflict/duplicate state,413upload/body too large,422unsupported/encrypted/scanned/insufficient evidence,429rate/quota withresetAt,503provider unavailable. Distinguish rate/burst limit from monthly allowance; UI keeps manual edit/history available on AI exhaustion per proposed policy.

## Endpoint catalog

| Endpoint | Input / output / invariant |
|---|---|
| POST /uploads | filename hint,MIME,size,sha256→uploadId,private signed PUT URL,maxBytes,expiresAt. Confirm owner and entitlement before upload; key generated on server |
| POST /uploads/:id/complete | observed checksum→202 extraction operation; validate actual bytes/MIME/quarantine before parse |
| GET /extractions/:id | unconfirmed field proposals,source/page/span/confidence,questions,manual fallback; no automatic confirmed status |
| POST /base-cvs | manual draft or selected extraction fields→draftId,revision; no false confirmation |
| PATCH /base-cvs/:id/draft | bounded typed item patch; expected revision→new revision; no arbitrary DB paths; validate references |
| POST /base-cvs/:id/confirm | selected claim IDs,expected revision,attestation scope→immutable snapshotId,new head,claim confirmations |
| POST /interviews | baseSnapshotId,targetEntityIds,selected gap IDs→202 bounded question/proposal operation |
| POST /interviews/:id/answers | answer text or skip/unknown,source revision→extracted unconfirmed claims,confirmable summary; no inferred metrics |
| POST /interviews/:id/confirm | selected claims+attestation+expectedBaseHead→new Base snapshot; skip stays skip |
| POST /jobs/import | kind text/manual/url/extension,content/url,captureConsent→job draft/operation; ingestion never auto-runs tailoring |
| PATCH /jobs/:id/draft | reviewed company/title/requirement required-preferred edits with evidence or user correction reason→new draft revision |
| POST /jobs/:id/confirm | expected revision→jobSnapshotId; requirement/evidence/version hash pinned |
| POST /analyses | baseSnapshotId,documentSnapshotId?,jobSnapshotId,methodVersion,asOf→cached score or202; only server-trusted rules allowed |
| GET /analyses/:id | dimensions,weights,required/preferred coverage,critical gaps,keyword statuses,evidence,uncertainty,readability,version/model provenance |
| POST /tailoring | Base/job snapshots,selected role/section IDs,locale,scope→202 proposed change set with support/limitations and estimated delta |
| POST /tailoring/:id/accept | acceptedChangeIds,rejectedChangeIds,expected document revision→immutable tailored snapshot; unsupported changes rejected server-side |
| POST /documents/:id/regenerate | scope summary/singleBullet,selectedItemId,confirmedClaimIds,jobSnapshotId,locale→one proposed patch; unaffected items unchanged |
| PATCH /documents/:id/draft | section/role/bullet order,label,selection,approved text edits,templateVersion; scope-limited mutation, optimistic concurrency |
| POST /documents/:id/checkpoints | expected revision→immutable content snapshot,author/reason,parent |
| POST /documents/:id/restore | historical snapshotId,expected revision→new snapshot; historical state remains immutable |
| POST /base-cvs/:id/promotions | fromTailoredSnapshotId,selectedNewClaimIds,attestation,expectedBaseHead→explicit confirmed Base version; never automatic |
| POST /exports | documentSnapshotId,templateVersionId,locale,selected contactIds,expectedContentHash→202; exact privacy projection and entitlement reserved |
| GET /exports/:id | queued/validation status,PDF text test results withuntested/pass/warn/fail,short signed download URL if available |
| POST /operations/:id/retry | retryable,within deadline; same logical operation,reservation idempotent; provider attempts still recorded |
| POST /operations/:id/cancel | cancel_requested; cooperative cancellation, no guarantee of unpaid provider cancellation |
| GET /entitlements | revision,status,features,periodStart/End,remaining,reserved,resetAt; read-only UI projection |
| POST /checkout-sessions | approved server-owned planKey,termMonths1/3/6→Stripe session URL; amount never client-supplied |
| POST /billing/portal | signed-in customer→short-lived portal URL; no arbitrary customer ID |
| POST /billing/stripe-webhook | public signed raw body→event persisted then200; async idempotent processing |
| POST /privacy/portability | reauthenticated request→202 encrypted/private bundle of JSON/sources/versions subject to lawful scope |
| POST /privacy/deletion | reauth,confirmed scope→resumable deletion operation,retention exceptions,estimated completion; production human approval policy applies |

## Dual-score analysis response1.1 (synthetic contract)

```json
{
  "analysisId":"analysis_demo","methodVersion":"compatibility-1.1.0",
  "inputVersions":{"profile":"profile_confirmed_1","document":"cv_1","job":"job_1","requirements":"requirements_1","rules":"compatibility-1.1.0","dictionary":"ro-en-1.1","normalizer":"normalized-reviewed-1","matcher":"synthetic-reviewed-1","asOf":"2026-10-23"},
  "candidateFit":{"score":94.93,"scope":"complete confirmed profile"},
  "cvMatch":{"score":59.93,"scope":"selected document evidence"},
  "eligibility":{"status":"requirements_satisfied","scope":"identified hard requirements only; not legal certification","persistentOn":["score","comparison","export_preview"]},
  "readability":{"state":"untested","exportId":null},
  "weightProfile":"baseline-1.1","calibrated":false
}
```

Full category denominators/effective weights,requirement IDs/priority/gate/evidence/match-strength/explanations,rule/input/requirement hashes and recommendations are in `../ats/worked-examples-v1.1.json`. Companion input schema in `../../schemas/cv/v1/assessment-input-1.1.schema.json`. No profile gives CandidateFitnull. Missing mandatory evidence gives needs_verification; confirmed contrary evidence gives confirmed_requirement_gap. Priorityrequired is not itself a non-compensatory gate. Strict credentials cannot be satisfied by transferable experience.

A proposed AI extraction/matching result is validated/cited then accepted into versioned replay inputs; the model never emits the authoritative total. CandidateFit cache depends onprofile+job+requirements+mapping+rules+dictionary+normalizer+as-of. CVMatch reuses accepted evidence and projects selected CVitems; CVwording alone cannot improve either score. Added substantive context needs real confirmed support and a revised mapping. Minor presentation edits do not resend the complete profile. Before/after locks all job/rule/matcher inputs; unchanged profile must yield unchanged CandidateFit. New confirmed facts change profileversion and their delta is separately attributed.

Recommendation shape `{id,type,requirementIds,jobSpanIds,availableClaimIds,unansweredQuestions,action,needsConfirmation,estimatedDelta?,limitations}`. Types include profile_present_cv_omitted,insufficiently_demonstrated,not_supported_in_available_profile. Delta staysnull until a concrete supported patch can be deterministically compared. Five keyword display statuses remain separate from relation,strength and eligibility axes.

## Workflows and failure recovery

**Upload→review:** reserve upload byte quota→signed private upload→checksum/MIME/ZIP/page limits→quarantine→sandbox extraction→deterministic normalization preserving partial dates→optional bounded AI structured field proposals→validate schema/references→review unconfirmed fields→selected user confirmations→immutable Base. OCR and remote parser are not automatic silent fallbacks. Unsupported/encrypted files return manual/paste recovery; repeated parse failures do not consume unlimited inference.

**Enrichment:** score/gap analysis selects a few questions→user answers/skip/unknown→answers retained with provenance→suggested claims/metrics→explicit review→confirmed revision. Need no quantified metric for legitimate qualitative impact. Confidential figures may stay absent. Schema links metric to an accomplishment rather than floating number generation.

**Job import:** text/manual is simplest; URL uses restricted fetch service/SSRF controls and size/time/redirect budgets [security]. Extension provides previewed text+URL+capture metadata and consent version. Deduplicate per-tenant canonical URL and normalized text hash; retain new snapshot when meaningful text changes. Requirements retain source spans and required/preferred confidence; ambiguous labels get review, not fabricated necessity.

**Scoring/cache:** deterministic normalize→controlled dictionary→requirement atom/evidence mapping→weighted dimensions→critical gaps and five statuses→section coaching→persist provenance. Cache key SHA256(tenant+CV/document hash+job hash+rules+dictionary+normalizer+reviewed evidence map+as-of+locale of explanations). No cross-user PII cache. Ongoing experience changes as-of even without CV edits. Name/contact color/order/template edits can reuse semantic analysis but invalidate PDF/export hash; selected evidence/prose changes invalidate visible-document coverage. Job edit invalidates requirements/score/tailor. Claim rejection/deletion invalidates every dependent export/cache and queues purge. New method/dictionary yields new scores, never overwrite old reports silently.

**Tailoring/selective generation:** fetch only selected confirmed facts and relevant job requirements; no full file/contact data by default. Provider returns structured proposed text+support IDs+warnings. Server validates IDs, values, numerals/qualification/title changes against evidence; regex checks alone cannot prove entailment, so user approval and later adversarial evals remain essential. Approval creates new content snapshot; each summary/bullet separately accepted. Base promotion is a different command. Translation is a generated reviewable artifact, not automatic fact translation.

**Export:** immutable approved document→privacy projection→safe reviewed template/escaped text/fonts→reviewed Browser Run PDF boundary with network/resource constraints and approved data terms→PDF bytes/checksum→independent text/order tests→private object→settle export quota. Fatal missing/interleaved contacts/body or no text blocks download; visual-only warnings can offer clear fallback. Snapshot/template/font/renderer/extractor versions and test result persisted. Enforce persistent mandatory-gap warning on preview even if PDF passes. A semantic gap is not a PDF render failure; allow truthful export according to explicit product policy.

## Jobs, retries and rate limits

Transaction writes operation+quota reservation+outbox. Worker claims ready rows with `FOR UPDATE SKIP LOCKED`, short DB transactions, lease expiry/heartbeat and attempt counter; never hold a DB transaction during an AI/network/render call. Job dedupe key derives from tenant+operation+input hash. Per-operation result unique key and fencing token reject late stale workers after lease renewal/cancellation. Effects may repeat outside DB; guarantees are idempotent logical state, not magical exactly-once provider charging.

Proposed deadlines: uploadparse60s, model call45s, render30s, whole operation3min; hard memory/page limits independently. Retry only429/transient5xx/network with jitter1/4/16s andmax3attempts; respectRetry-After/provider budgets. Invalid payload, unsupported file, permission/entitlement errors are final; exhausted jobs go to a durable failed queue for safe user retry/support triage. Worker death: lease expires, requeue if budget remains. Provider timeout may still be billed: record unknown usage/cost and reconcile instead of assuming zero. User cancellation fences persistence and stops queued work; in-flight charges still recorded, explicit refund/credit policy pending.

Proposed burst limits (not approved plan allowances): session/API60read/30write per minute per user; import5/min; concurrent AI2/user and bounded global semaphore; render1/user and2/host initially; auth endpoint IP/account throttles. Global provider/token/spend ceilings, request body/page/token bounds and per-account quotas protect costs. Large10k-user spikes queue with honest status; scenario sizing is not latency proof. Queue p95/oldest job age and rejected attempts need alerts before scaling. No unbounded retries or hidden automatic premium escalation.

## Preferred managed/free-pilot execution boundary

WorkerAPI+Supabase+BrowserRun is the directed discovery preference. ThinWorker requests lease Postgres jobs using narrow RPCs; no long transaction spans model/render calls. FreeCPU10ms/128MB andBrowser600sec/day/3sessions are hard feasibility boundaries,not guaranteed processingcapacity. Keep bounded payloads,privateHTML/fontassets,manualextractionfallback andper-providerquota reservation. Measure before supporting fullPDF/DOCX parsing onFree; no nativeOCR/process claim. Pause/queue atlimits ratherthan silently paying forWorkers/Supabase/Browser upgrades. OpenAI calls remain paid.
