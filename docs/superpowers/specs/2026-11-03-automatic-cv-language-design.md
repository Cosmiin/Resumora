# Automatic CV content language

Date: 3 November 2026

Status: proposed implementation design; product decisions confirmed, implementation approval pending.

## Intent and confirmed behavior

Resumora has one base CV. Users should not have to select its language. Detect the dominant narrative language and consistently use it for generated questions, hints, explanations, feedback, skills, summaries, rewrites, and tailored CV content.

The user confirmed:

- Interface language stays a separate preference. Navigation, buttons, operational errors, and account controls retain it.
- Content-language support must extend beyond Romanian and English to languages the configured AI can reliably handle.
- Judge narrative prose, especially experience descriptions. English business/technical terminology, product names, and borrowed vocabulary must not incorrectly turn another language's CV into English.
- Manual profiles initially use the interface language; infer their content language once substantial narrative exists.
- An explicitly translated CV uses its own target language for questions and improvements.
- Answers may be typed or dictated in a different language. Enrichment must express the supported information in the CV language consistently.
- Following a language correction, refresh old questions and feedback when next needed. Preserve accepted CV wording.
- Offer correction only for low- or medium-confidence detection. There is no routine language selector for a confidently detected base.
- Remove **Update from a CV**. Uploading another CV requires deleting the existing base first.
- Preserve current deletion behavior: delete base data and answers, including base language copies, while retaining current tailored job CVs and saved jobs. Do not delete user data as part of implementing this change.

## Existing behavior and affected areas

Import extraction currently returns `detectedLanguage: ro | en | null`; new drafts use it, otherwise they inherit the Romanian blank-draft default. The shared `contentLanguage` helper maps every non-Romanian locale to English. Some coaching flows already use this helper, but validators, feedback caches, job locale parameters, and database constraints still encode two languages. Job matching and suggestions do not consistently receive a content locale. Several selectors can change the base language without translating existing prose.

Explicit translations are separate representations, not additional base profiles. Job CVs have their own saved locale and survive base deletion. Browser dictation currently forces Romanian or English; recorded transcription already submits audio without a forced language. Document headings, duration text, and portions of preview/export rendering also assume two languages.

Relevant boundaries:

- `packages/contracts/src/editor/{model,content-language,import,transport,languages,language-transport,dates}.ts`
- `packages/contracts/src/intelligence/{model,context,experience,experience-policy,experience-assessment-prompt,translation}.ts`
- `packages/contracts/src/jobs/` locale contracts, validation, and document identity
- `apps/api/src/intelligence/` extraction, coaching, scores, skills, rewrites, summaries, and transcription
- `apps/api/src/jobs/` extraction commentary, matching, suggestions, tailoring, and verification
- `apps/api/src/languages/`, `apps/api/src/db/`, and Supabase locale validation/storage routines
- `apps/web/src/App.tsx`, profile/import components, coaching components/hooks, and language versions
- `apps/web/src/components/{DocumentContent,VoiceTyping,LiveDictation}.tsx`, templates and exports

## Approach

Use one persisted content-language decision per document and a shared resolver on both client and server. Detect during initial import, or through a bounded operation for manual/legacy content. Explicit translation establishes the target version's language. Every generation request derives language from the owned current document rather than UI preferences, a vacancy, or the most recent answer.

Two alternatives were considered:

1. Infer independently inside every prompt. This permits different workflows to choose different languages, makes low-confidence correction inconsistent, and can let an answer or vacancy change the language. It does not meet the user's consistency requirement.
2. Remove selectors and adjust only existing Romanian/English prompts. This leaves multilingual storage, job flows, caches, speech, and export behavior incorrect. It does not meet the confirmed scope.

The shared persisted decision is the recommended implementation. The user selected the product rules above; technical details below are implementation proposals rather than additional user preferences.

## Language model and resolution

Separate the existing two-language **interface locale** type from a validated **content locale**. Use canonical language tags with optional script/region where established; do not invent a regional variant from a person's name, location, or nationality. Preserve existing `ro-RO` and `en-GB` documents and valid historical payloads.

Persist content-language metadata containing the canonical locale, confidence (`high`, `medium`, or `low`), provenance (`import`, `narrative`, `user-correction`, or `translation`), policy version, and an identity for the narrative input used to detect it. Represent insufficient narrative explicitly, with a provisional interface-language fallback. A provisional fallback is not a high-confidence detection.

Resolution order:

1. Explicit target locale for a saved translated representation or existing job document.
2. A confirmed correction or persisted inferred base/content locale.
3. A historical saved locale while its actual narrative awaits lazy detection.
4. The interface language for an empty/manual draft awaiting narrative.

The resolver must return the actual content locale; it must never map French, Spanish, Arabic, or other languages to English simply because they are not Romanian. Accept only validated locale data, never arbitrary strings as prompt instructions. Keep internal JSON keys and enum values stable.

## Detection lifecycle and confidence

Initial import detects language from the document narrative as part of the extraction operation. Return locale and confidence together, preserving original extracted wording and source quotations. Names, addresses, lists of spoken languages, technology lists, and isolated English titles are weak evidence; connected narrative is primary evidence. A genuinely bilingual CV uses its dominant narrative language; a close split yields lower confidence.

For manual and historical profiles, use a bounded server operation over relevant visible narrative. Schedule it after substantial prose is saved, or immediately before a content operation that needs a reliable language. Skip empty drafts and profiles consisting only of identifiers, dates, or skill names. Fingerprint the submitted prose; coalesce concurrent requests and fence results against changed content, account, revision, and deletion generation. Do not detect again after every answer, score, rerender, or interface switch.

Low/medium confidence shows the proposed language and an optional correction action in interface-language controls. It does not force a selection or block ordinary work. High-confidence detection has no correction control. A user correction remains authoritative; automatic detection must not overwrite it. Insufficient narrative stays provisional until enough prose exists.

Confidence is a categorical model assessment, not a calibrated percentage or a guarantee of fluency. If a model cannot identify or reliably produce the requested language, return an explicit recoverable result; do not silently generate English or Romanian instead. Use bounded validation/recovery, never an unbounded regeneration loop.

## Propagation to all prompts

Provide a shared language instruction and structured locale context to every operation that emits user-facing prose. Derive them server-side from the correct owned document; do not accept a client feedback-locale override that conflicts with it.

Cover:

- Import explanations and warnings, once the narrative language is available.
- Career and guided-experience questions, hints, answer examples, diagnostic feedback, assessments, and previews.
- Skills discovery and suggestions, role introductions, role rewrites, and summaries.
- Job matching explanations, clarification prompts, recommendations, tailoring reasons/warnings, and generated document wording.
- Translation review commentary and generated wording associated with the translated version.
- Any human-facing validation/verification explanations returned by model operations.

Source quotations and extracted employer requirements remain exact originals for evidence checking. They are not generated prose. User answers/transcripts remain original evidence; the model may interpret or translate their meaning internally when producing wording in the document language. Never alter numbers, names, technology names, attribution, uncertainty, or factual claims during this normalization.

Before a CV exists, job-ad extraction must still preserve its source. Any diagnostic content that cannot use a CV language uses the interface fallback; once a document exists, newly requested analysis uses its resolved language. A vacancy never changes the CV language.

Use the same policy for normal, streaming, retry, fallback-provider, and recovered operations. Historical completed operation receipts stay recoverable, but incompatible-language results must not be newly presented as current questions/feedback or applied as fresh proposals.

## Questions, scores, and persisted results

Include the resolved content locale and language-policy version in operation identity and cache compatibility. Keep previous payloads decodable. A language change makes dependent generated questions, feedback, hints, and unaccepted proposals stale; it does not erase user answers or modify accepted prose.

Refresh stale content on the next relevant interaction, including opening the relevant coaching/assessment surface. Do not run a bulk migration that regenerates every user's results. Preserve unresolved operation IDs for recovery and avoid duplicate paid calls after timeouts. Recovered older results can be retained as history without becoming an active language-mismatched round.

## Dictation

Separate spoken-input language from output language. Do not force recognition to the CV language when the user may speak another language. Prefer the existing recorded transcription path where automatic speech-language handling is needed; do not add a mandatory speech-language selector. Use live browser recognition only where its actual capabilities support the desired input behavior. Preserve transcript text for confirmation; all subsequent enrichment uses the resolved CV language.

This task does not authorize changing provider credentials, models, or paid-inference settings. Verify implementation with synthetic/provider-mocked inputs; report any live-provider validation separately.

## Preview, export, and multilingual limits

Document headings, generated labels, ongoing-date labels, duration text, and content annotations must follow the document language. App controls retain the interface language. Use locale-aware date/number formatting, correct HTML language/direction, and shared labels between preview and exported output. Established product/technology names remain unchanged.

Keep current Romanian/English labels. For additional languages, obtain a bounded validated set of localized document labels through the language/localization operation and persist/cache it with its locale and version. This avoids per-render inference and English headings inside an otherwise non-English document. Missing localized content must produce a clear interface-language availability state rather than an unnoticed English document fallback.

Support both left-to-right and right-to-left document layout, and verify representative non-Latin text/font coverage in actual export artifacts. A language tag passing validation is not proof that OCR, speech, fonts, or the configured model support that language. Surface actual limitations explicitly; do not advertise universal end-to-end support based only on generalized schemas.

The existing local Romanian/English OCR assets serve source-quote geometry. Do not claim they recognize all scripts. Inspect the main extraction path separately; preserve usable multilingual source extraction while making unsupported optional highlighting unavailable instead of inventing source locations. If the main extraction cannot read a document, report that limitation rather than infer language from garbled text.

## Single-base upload and deletion

Remove the update action and the UI route into the comparison/merge flow while a base exists. Enforce the same rule at the API/import start and acceptance boundaries so direct navigation, replay, old pending imports, and concurrent tabs cannot apply a second upload to an existing base. Preserve initial staged-import review and same-operation recovery; identify it by its import ID and lifecycle generation, not merely by whether a draft now exists.

Keep deletion semantics as currently confirmed. Delete language metadata, cached base feedback, base language copies, and pending base import work with the base; preserve tailored job CVs with their own locale and necessary rendering resources. Old responses must not recreate a deleted base. The next new base starts detection afresh.

Remove the product entry point and prevent updates; whether now-unreachable comparison code is deleted is an implementation cleanup choice. Do not broadly remove unrelated import review or provenance behavior.

## Storage and rollout

Generalize relevant API/contracts and database constraints currently restricted to `ro`/`en`, including job document locale keys, workflow locale fields, source/target locale validation, and translation context routines. Keep interface locale storage unchanged. Canonicalization must be consistent so aliases/case differences cannot create duplicate document identities.

Use additive, compatibility-preserving changes. Decode existing snapshots, operation receipts, and translation lineage. Existing data is inferred lazily; no bulk prose rewrite. Preserve revision/idempotency checks, generation fences, ownership checks, and current job-document uniqueness.

Prepare migrations and verify them locally before any hosted application. Implementation alone must not be reported as end-to-end operational until the required schema is present in the configured environment. Follow the repository's environment guide and keep secrets out of output. Preserve existing unfinished changes in this checkout.

## Acceptance and verification

Required behavior checks:

1. Romanian narrative containing English business/technical terms stays Romanian with an English interface.
2. English, French/Spanish, and representative non-Latin/RTL narratives retain their actual language through save/reopen, coaching, job tailoring, and preview/export.
3. Empty manual profiles use the interface fallback; substantial prose triggers bounded inference without repeated calls on UI changes.
4. Low/medium detection allows correction; high detection hides it. Correction persists and invalidates only language-dependent results.
5. Answers and dictated transcripts in another language produce grounded output in the CV language and preserve original evidence.
6. A foreign-language job advert does not switch CV output language; exact evidence quotations remain intact.
7. A translated version uses its target locale for new questions and edits, and an independently preserved job CV does not depend on the base still existing.
8. Legacy payloads remain readable. Old generated results refresh lazily; accepted wording and user answers stay unchanged.
9. New uploads are blocked while a base exists, including direct API requests and stale/concurrent import flows; initial import recovery still works.
10. Base deletion retains current job CVs and saved adverts, clears base data/answers, and fences delayed work.

Run focused contract/API/frontend/database suites, TypeScript checks, and the relevant build/export checks. Add tests for cross-language behavior and lifecycle regressions rather than tests that only repeat the implementation. Browser checks must exercise the visible low-confidence controls, removed selectors/update action, translated versions, and representative exports.

No startup changes are planned. If implementation changes startup or environment handling, run the environment checks required by `AGENTS.md`. Report mocked correctness, process state, and live provider/end-to-end verification as separate evidence.

## Decisions left to implementation

Choose exact metadata names, canonical locale validation/catalog implementation, substantial-narrative thresholds, batching/debounce details, and localized-label schema within the behavior above. Choose minimal migration and test decomposition after tracing existing validators and RPC wrappers. Do not narrow multilingual support back to Romanian/English, silently alter deletion scope, or translate accepted prose as a convenience.
