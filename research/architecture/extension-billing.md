# Extension, subscriptions and entitlements v1

Discovery contracts, not activated integrations. Prices, trial,quotas,grace/refund/cancellation policy and launch scope remain unapproved. Official sources E-05/11/14/15/22 in [register](sources.md).

## Chrome capture

ManifestV3; permissions `activeTab`, `scripting`, `identity` and only API-origin host access when needed. Optional storage.session for a short-lived token; no `tabs`/history/cookies/webRequest or broad `<all_urls>` persistence. Capture only after toolbar click. `activeTab` gives temporary permission; content script extracts selected job container/JSON-LD or plain visible text, strips unrelated profile/comments/nav and never sends passwords or browser cookies. Review text/title/company/URL locally; explicit Capture/Send consent before upload. Explain unsupported pages and paste/manual recovery; no login/captcha/anti-bot bypass, automated applications or background browsing collection.

Authentication: open the product authorization endpoint via `identity.launchWebAuthFlow`; authorization-code+PKCE(S256),random state,exact allowlisted extension-ID callback,one-time code,short expiry. Backend validates redirect,audience,scope and user; uses approved identity provider, not a client secret. Token scope `jobs:capture` only,proposed10min,keep in memory/session; revoke on signout,extension removal where signout is possible or account revocation. Refresh token persistence is avoided in minimal v1; reauth when needed. Never expose Supabase service key or broad web-app session. API CORS allows exact product/extension origin and validates token audience; CORS alone is not authorization.

Submission: `{captureId,sourceUrl,canonicalUrl,title,company,text,sourceLocale,capturedAt,consentVersion,textHash,parserVersion}`. Enforce UTF-8 body limits and same job import pipeline. Deduplicate within tenant by canonical URL (remove known tracking parameters only, preserve job identifier) and normalized text hash. Repeated capture returns existing job/snapshot; changed text offers new job snapshot after review. Store selected source metadata/time,not full browsing history. Job text may be copyrighted or include personal names; legal retention/use scope review needed.

Store constraints: single clear purpose; privacy policy/disclosures consistent with actual collection and AI/processor use; limited permissions/data use; packaged executable code/no remote executable logic; no misleading score/job outcome claims; supported-site selectors bundled/tested with fallback. Store review and publisher eligibility/fees are unmeasured; do not assume acceptance. Discover now,propose deferred launch while paste/manual loop is tested. Website scraping rules and public page terms reviewed separately.

## Term and quota proposal

The [PRD billing direction](../../docs/product/prd.md#10-account-subscriptions-entitlements-and-privacy) supersedes the earlier monthly-allowance proposal and owns allocations, renewal, rollover and remaining commercial choices. Future Stripe integration must allowlist approved immutable Price IDs server-side and disclose billed total, renewal date, cancellation and term commitment. No invented discount.

Manual edits, approved history viewing and deterministic cached recomputation do not consume AI units; burst limits still apply. Identical private cache hits return the original result without consuming another allowance; same-version PDF re-download is not a new export. Server input/output-token limits and expensive escalation budgets remain separate from public credit quantities. Credit consumption per action requires explicit approval before product use.

End-of-month/leap-year/timezone boundaries use UTC billing anchors and calendar-month arithmetic; tests before production. Never model every month as30days in entitlement code—the cost model uses30days only for an activity scenario. Available quota=`limit-settled-reserved`,with atomic reservation uniqueness. Premium escalation consumes internal spend ceiling rather than surprise public units; actual provider cost remains metered.

No free/trial entitlement chosen. Allowing free preview/manual features versus gating analysis/export is a product decision. User interface may show plan/remaining quotas from GET, but every expensive server command rechecks state and reserves. On success settle once; on failure release allowance according to published policy while recording real provider cost; on user cancellation never pretend billed tokens vanished. Race tests cover parallel requests and period renewal. Price/unit revisions are effective-dated; preserve old contracts for already-paid term unless lawful agreed change.

## Payment workflow and authority

1. Authenticated customer chooses allowed plan key/term; backend validates price mapping and creates Checkout session with idempotency key. No amount or Stripe customer ID from client accepted as authority.
2. Success/cancel URL returns informational pending state. It never grants paid access; prototype explicitly says local simulation,not real invoice/payment.
3. Webhook receives raw body; verify signature and tolerance with current endpoint secret; persist unique event ID and minimal payload securely; return200 after durable acceptance. Process via job/outbox.
4. Relevant checkout/subscription/invoice paid/payment_failed/deleted events trigger retrieval/reconciliation of current Stripe subscription/invoice state. Duplicate or out-of-order delivery cannot double-grant quotas. Pin API version and retain safe event/projection audit; daily reconcile catches missed deliveries.
5. Entitlement projection uses effective paid-through,status and policy revision. `active` after confirmed initial payment or explicit approved trial; `pending` until confirmation; `past_due` uses approved bounded grace or read-only mode; `unpaid/cancelled/expired` no new paid AI/export. Cancellation at period end leaves paid access until paid-through. Immediate cancellation/refund behavior requires explicit policy,not inference from events.
6. Customer portal handles renewal/cancel/payment method updates with reauthenticated customer mapping. Persist internal subscription mirror and entitlement periods; user cannot forge access by altering browser state.

States proposed: `none|pending|active|past_due|grace|cancel_at_period_end|expired|revoked`. Fraud/chargeback action requires reviewed policy/human approval; do not let AI terminate accounts. Billing data separated from private career data and statutory-retention exceptions; provider receives no CV content.

Romanian Stripe fees are payment-mix dependent. Calculator symbolic standard EEA fee inRON is `0.015*gross +1.00*transactions +0.007*billingVolume`. With equal gross and billing volume this is0.022*gross+transaction count,excludingTax/FX/disputes/premium/international cards. Term length changes transaction count; revenue,paid conversion and exchange rate are unknown, so no numerical margin or selling-price recommendation. PaddleMoR comparison is included in architecture; switching billing providers changes legal/tax responsibility and requires business approval.
