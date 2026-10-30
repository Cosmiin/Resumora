# Resumora job capture extension

Implementation boundary approved by Firstmate inbox 002/003: a persistent capture-only connection subordinate to existing account login. No Supabase access/refresh token, password, session cookie, CV or privileged key enters the extension.

## Threat boundary and contract

- Existing web login authenticates `POST /v1/extension/authorize` with the existing exact APP_ORIGIN, encrypted session and CSRF check. The signed-in account explicitly approves an extension/device, S256 challenge and random state. Only the packaged public identity (or exact release-configured extension IDs) and their `https://ID.chromiumapp.org/capture` callback are accepted. Codes expire after 120 seconds and exchange atomically once.
- The database binds the code to owner, workspace, login-session digest, extension ID and random device ID. It stores only SHA256 capability hashes. Exchange gives a capture-only connection (at most the remaining web-session lifetime, capped at seven days) and a ten-minute access credential. Renewal issues only another capture access credential, never a web session. This is a narrow capability bridge, not another account/password provider.
- `POST /v1/jobs` with an extension bearer credential accepts only `{requestId, snapshot}`; no account, tenant, CV or existing job IDs. Exact extension Origin and configured ID/device headers are mandatory. The database determines owner/workspace and validates membership on every command. No general database/JWT proxy exists.
- A bounded raw snapshot, new private draft and pending operation commit together before a receipt is returned (202). Same owner/request ID and body return the same job. Changed body with the same ID conflicts; a new intentional click gets a new ID even for the same URL. Latest saved Base is associated server-side if present; absent Base is null. No Base content is read by capture credentials.
- `POST /v1/jobs/capture-status` takes only `{requestId}` and returns that owner's receipt/status. It exposes no job contents or CVs. Logout/account replacement fences the old login-session's connections before clearing/replacing its cookie. An explicit app revoke-all action and extension disconnect revoke credentials immediately. Server failure fails closed. Connection expiry also fences expired web sessions; remote provider revocation outside this app is not an instantaneous notification mechanism.
- Credentials are revocable bearer capabilities associated with a random device installation, not hardware attestation. A stolen connection secret permits only capture/receipt access until revoked/expired. Extension CSP, bundled code, restricted storage access, exact API destination and absence of credential logging reduce exposure. Server CAPTURE_WORKER_SECRET can operate only these dedicated capture commands. It cannot impersonate arbitrary user JWTs or read/edit CVs.
- Before transport, a bounded local queue is persisted independently of popup lifetime. It is partitioned by connection generation; reconnect/account switch never silently sends older queued pages as the new account. Only durable server acknowledgement says saved. Retry keeps the same ID, uses bounded attempts/backoff and requires explicit recovery after exhaustion. No hidden paid retry.
- The durable operation is a small database outbox because this repository has no generic queue. The scheduled Worker performs only deterministic normalization, with leases and three bounded attempts. AI remains OFF and is not part of acceptance. Queued vacancy work owns full extraction/analysis/tailoring/translation/catalog. No `waitUntil` or popup lifetime is treated as durability.

## Coordination

Forward migration reserved: `20261028040000_p5_job_capture.sql`, after pending 10000/20000/30000. Never edit earlier migrations or apply to cloud here. Nullable `SavedJob.snapshotId/snapshotRevision` means no Base yet. Review remains available; later comparison/tailoring must resolve and pin the latest Base at operation start. Capture metadata lives under `intake.capture`; original text/source are retained. Outbox key is owner/request ID; status vocabulary is received/processing/ready/failed. Analysis feature owners must add their own explicitly enabled operation after save, never delay or replay capture on AI failure.

## Official documentation checked 2026-10-28

- [Identity API](https://developer.chrome.com/docs/extensions/reference/api/identity), last updated 2026-10-28: `launchWebAuthFlow` and exact Chromium callback.
- [activeTab](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab), last updated 2012-09-21: explicit temporary page access with scripting.
- [Distribution](https://developer.chrome.com/docs/extensions/how-to/distribute), last updated 2023-12-12: normal installation through signed Store publication; unpacked code for development. Windows/macOS self-hosted installation requires enterprise policy.
- [Alternative installation](https://developer.chrome.com/docs/extensions/how-to/distribute/install-extensions), last updated 2012-09-17.
- [MV3](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3), no last-updated date exposed in the fetched page: service workers and packaged executable code.
- [Security](https://developer.chrome.com/docs/extensions/develop/security-privacy/stay-secure), last updated 2018-03-06: minimum permissions, hostile content-script inputs, no credential transfer to pages.
- [Storage](https://developer.chrome.com/docs/extensions/reference/api/storage) and [alarms](https://developer.chrome.com/docs/extensions/reference/api/alarms), last updated 2026-10-28. Storage uses local/session, restricted to trusted contexts. Alarms are re-established at worker start; scheduling can be delayed. Opportunistic immediate send plus durable local queue handles recovery without claiming a timing guarantee.

## Operator readiness (not executed here)

1. Review/apply the forward migration in order through the separately approved database process. Existing pending 10000/20000/30000 are not edited here. The test runner uses disposable local PG only.
2. Provision a new random server-only CAPTURE_WORKER_SECRET (at least 32 characters) to the Worker and its SHA256 digest into the singleton `app.capture_worker_authorization`. Only an approved privileged database operator can insert the digest; never put the plaintext in migration history or the ZIP. This is distinct from AI_WORKER_SECRET and grants only the named capture RPC authority.
3. Set the existing same-origin APP_ORIGIN/API_ORIGIN and Supabase publishable config on the API. Supply those same public origin values to the web build, e.g. `APP_ORIGIN=https://YOUR_SITE API_ORIGIN=https://YOUR_SITE npm run build --workspace @resumora/web`. The build generates `dist/downloads/resumora-extension.zip` from the fixed source allowlist; no checked-in local ZIP can be shipped accidentally. Production builds without an origin fail. Vite development serves a generated local package. The public manifest key fixes unpacked identity `nijbkdlbbeepfncgdldnmppflmkjmhpj`, which the API accepts by default; users never need per-install ID registration. CAPTURE_EXTENSION_IDS remains an optional exact release identity override (comma-separated, at most five), needed when adopting the eventual Store identity. No wildcard IDs/origins or privileged Supabase key.
4. The configured one-minute scheduled handler drains at most ten deterministic operations with two-minute leases and at most three attempts. Paid extraction is absent/off. Backpressure rejects new extension drafts when an owner has 100 unprocessed operations; a retry preserves request ID. Failures keep the source/draft and surface failed status; this does not authorize a paid retry or analysis operation.
5. Keep the site's extension/connect pages protected from framing and referrer leakage. Vite development/preview headers and the static `_headers` artifact are included. The actual host must honor equivalent headers and same-origin `/v1` proxy routing; live hosting is unverified. An ordinary site deployment does not automatically provide Chrome Web Store publication.
6. Ordinary installed-site distribution still requires an external Store action: an authorized operator must create a Store item, obtain its dashboard public key, replace the source manifest key and corresponding `captureExtensionId`, verify the installed ID, and publish the item through the approved process. The current public key is a stable unpacked identity, not proof of a registered Store item. No Store action/payment is authorized here. See [Chrome's public key guidance](https://developer.chrome.com/docs/extensions/reference/manifest/key). Set public VITE_CHROME_WEB_STORE_URL only to an actual published `https://chromewebstore.google.com/detail/.../ID` listing. The UI otherwise displays unpublished status and the developer ZIP download; no placeholder Store link is supplied.

`npm run package --workspace @resumora/extension -- https://YOUR_SITE https://YOUR_SITE` deterministically generates a standalone developer ZIP in the ignored public download path. The site build always emits a fresh archive for its own configured origins. The fixed archive allowlist contains only source, config, original icons, README and MIT license; no environment/session files or dependencies. Chrome host patterns cannot restrict ports; runtime requests are restricted to the exact configured origin and use no cookies.

Manual paste uses the existing authenticated `POST /v1/jobs` contract, with a null snapshot pair requesting server association to the latest saved Base or none. Retry identity is based on the submitted null pair, so a Base saved later does not mutate/reassign an earlier draft. Unreviewed extension metadata is displayed as data; classification not explicit in source remains unknown. Schema.org skills stay general skills rather than being silently classified as required/preferred.

This source change does not publish a Store listing, deploy a site, apply a hosted migration, configure secrets or establish real installed-Chrome/provider assurance.

## Capture coverage and remaining evidence

The collector handles structured JobPosting descriptions before requiring a rendered job container, known ATS sections, and bounded generic job-heading/section text even without main/article. The API snapshot contract accepts every emitted adapter label. Forms, navigation, comments, hidden elements and unrelated page chrome are excluded from rendered text; there is no body-wide traversal, background browsing collection or login bypass. Structured locations normalize explicit locality/region/country, string addresses, named places and location arrays when snapshot location is missing. Unknowns stay unknown and review remains required.

| Synthetic fixture path | Installed Chrome / live platform |
| --- | --- |
| Greenhouse / Ashby rendered and JobPosting | Unverified |
| LinkedIn / BestJobs rendered | Unverified |
| Lever / Workday / SmartRecruiters / iCIMS rendered | Unverified |
| Oracle / Taleo / SuccessFactors / Workable rendered | Unverified |
| Recruitee / BambooHR / Personio / Teamtailor / Indeed rendered | Unverified |
| Unknown host with JobPosting only, generic containers, heading siblings and sections | Unverified |

Broad major-ATS support remains the goal, not a claim proven by fixtures. Installed Chrome identity/auth flow, Origin/CORS, permissions and worker lifecycle, live dynamic ATS pages, embedded frames, hosted proxy/SQL/cron and real account revocation still require separately authorized evidence. Store publication and deployment remain external operator steps.


## Capture repair boundaries

Rendered extraction starts from a local job selector or heading and gathers adjacent job sections within that context. It no longer merges page-wide job-word anchors or widens to the application wrapper. Existing requirements-section and structured paragraph/list/line-break regressions remain required; recommendation, account-profile and navigation content must stay outside captured text. Text and node budgets remain shared across the gathered sections.

The worker pins user ID and connection generation before tab lookup and script injection. Enqueue requires that expected identity, rechecks it inside its serialized storage operation, and stamps the row with the pinned values. Connection writes use the same queue lock as enqueue, so the check and persistence are ordered atomically with disconnect/reconnect. Disconnect, account replacement and same-account reconnect during extraction reject that capture; already queued requests retain their original owner and remain fenced by the delivery checks.

Certifications and candidate-language requirements remain unknown during deterministic normalization. Schema.org [qualifications](https://schema.org/qualifications) can describe broad experience or education; [inLanguage](https://schema.org/inLanguage) describes content language. Their original keyed values remain in the saved `capture.structured` JobPosting data, without being relabelled as certification or candidate requirements. The existing Jobs display shows unknown for these unsupported extracted fields.

## 30 October capture boundary

The collector now uses one bounded primary description or one unambiguous structured JobPosting. It no longer expands an introduction using English heading heuristics or widens to a generic main/common ancestor. Split/ambiguous pages, multiple postings and conflicting titles require explicit selection of the full advert or manual paste. Selecting text explicitly transmits only selected visible text outside forms/navigation/profile containers. Oversized content fails without sending a silently truncated fragment. JSON-LD description HTML is converted to inert text with paragraph/list/br separators; raw description/forms and arbitrary nested metadata are excluded from the submitted structured metadata.

Greenhouse/Ashby/LinkedIn/BestJobs and the bundled other named selectors have synthetic fixture coverage only. Generic main/article pages require selection unless a specific job-description container or structured posting exists. Live provider layouts, installed-Chrome permissions and real account launchWebAuthFlow remain unverified; fixtures do not establish universal site support. Server-side URL retrieval has a separate smaller matrix: exact vendor-owned Greenhouse, Ashby, Lever and SmartRecruiters hosts with a single public structured posting; no redirects, credentials, arbitrary hosts or authenticated pages. Failures preserve the saved URL record and offer paste/extension recovery.

Rechecked public authoritative Chrome documentation on 2026-10-30 (no personal browser/account used):

| Source | Page's reported update date | Relevant contract |
| --- | --- | --- |
| [activeTab](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab) | 2012-09-21 UTC | Temporary explicit-action page access; scripting permission is separate. |
| [Alternative installation](https://developer.chrome.com/docs/extensions/how-to/distribute/install-extensions) | 2012-09-17 UTC | Ordinary installation comes from a Store listing; Windows/macOS external update URLs must point to the Store. The ZIP is developer load-unpacked source, not one-click normal installation. |
| [Identity](https://developer.chrome.com/docs/extensions/reference/api/identity) | 2026-10-29 UTC | Exact extension callback and explicit interactive launchWebAuthFlow. |
| [MV3 remote code](https://developer.chrome.com/docs/extensions/develop/migrate/remote-hosted-code) | 2023-12-13 UTC | Executable code is bundled; remote JSON is data, never executed. |

No Store listing/publication or deployment is implied. Dates above are the pages' reported dates, distinct from this verification date.
