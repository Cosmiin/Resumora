# Vacancy capture: common draft, later review

Owner decisions: capture immediately into the signed-in account as a draft, then review. Target
coverage is all major ATS platforms, including Greenhouse, “asky” (assumed Ashby; spelling not
independently confirmed), LinkedIn and BestJobs. This is a coverage goal, not a support guarantee.
No intake questions remain outstanding; per-site feasibility and authorized rollout remain work.

| Entry method | Implemented in this slice | Proposed next behavior | Verification |
| --- | --- | --- | --- |
| Pasted advert text | Authenticated draft save and later manual review | Common extraction seam | Synthetic API/UI and SQL checks; see delivery evidence |
| Active-page extension click | No | Preview visible advert, send to account as draft | Planned; no browser/site check |
| Pasted public URL | URL metadata only | Fetch allowed public advert, save capture before AI | Planned; no fetch/site check |
| Greenhouse / assumed Ashby | Paste only, site-independent | Extension and allowed public URL adapter | Both adapters planned, neither verified |
| LinkedIn / BestJobs | Paste only, site-independent | Visible-page capture where permitted; public URL only where feasible | Both adapters planned, neither verified |
| Other ATS platforms | Paste only, site-independent | Add narrowly scoped adapters after supported fixtures | No universal coverage claim |

The vacancy provides employer-side criteria for later comparison/tailoring against a chosen CV.
Capturing it does not prove candidate experience, change Base, create an ATS score or apply for a job.
Current enhancement uses saved candidate context only; AI vacancy extraction is future work.

## Shared flow and fields

Every adapter produces the same account-owned capture: method, exact original text, optional source
and application URLs, timestamp, source language when known, parser version and provenance. Save
first with explicit draft/extraction-pending state and an idempotency key. Show it in the account
immediately; asynchronous extraction failure leaves that draft accessible. Review suggested fields,
edit unknown/uncertain items, then confirm a reviewed version. Pin a selected editor snapshot (current
slice) or explicitly verified canonical CV/document/version (future publication), never guess mappings.

Accepted inventory: title, employer, location and remote policy, description, required/preferred
skills, experience, education/certifications, languages, stated salary with currency/period/range,
application link and source URL. Recruiter/contact and deadline are optional, present only if stated.
Application status is user-managed and independent of extraction; no inferred employer decision.
Missing fields stay null/unknown; ambiguous priority stays unspecified until review. Preserve exact
salary units/qualification wording; do not translate equivalence or infer numerical experience.

AI receives minimized advert text as untrusted data with a fixed schema. Each extracted field or
criterion carries an exact excerpt plus offset/locator in the immutable capture, classification
(required/preferred/unspecified), original language and uncertainty/review state. Validate excerpt
presence and bounds server-side. AI confidence is not confirmation. No advert instructions may
change tools, routing, prompts, permissions or candidate facts. Retain raw capture, extraction result
and reviewed version separately, with model/prompt/schema versions and safe token/cost accounting.
Current normalized jobs/versions/requirements/source spans support reviewed evidence; additional
raw capture states/field provenance and async operation persistence require a small reviewed
migration, not an extension-specific parallel database. The current slice stores raw text in the
owned job draft and pins its editor snapshot; it does not run asynchronous extraction.

## Extension boundary

Use explicit per-click activeTab plus scripting access only where necessary; no broad history,
cookie/password collection or background scraping. Collect visible advert text, not full DOM,
unrelated page sections, form contents or private messages. Show capture and destination account.
Sign-in reuses the existing app session via a narrowly scoped reviewed handoff, with short expiry,
state/nonce and origin validation; never export session cookies or provider keys to extension
storage. Exact authorization mechanism and store permissions need implementation review. Expired
session offers app sign-in with draft retained according to approved local privacy policy. Cancel
sends nothing. Do not claim current browser profile/account access was verified.

## URL retrieval boundary

Future server fetcher validates http(s), preferably HTTPS, no embedded credentials, host/port
allowlist and public resolved IPs. Deny loopback, private/link-local/reserved/metadata addresses,
IPv4/IPv6 aliases and DNS rebinding; verify destination on connection and **every** redirect, with
strict hop/byte/time/content-type limits and no cookies/auth forwarding. Use an approved outbound
proxy if connection pinning cannot be proven in Worker networking. Resolve relative application
links safely. Disable scripts, downloads, forms and arbitrary tools; no login/CAPTCHA bypass,
paywall workaround or authenticated-page fetching. Enforce site terms and rate controls before
claiming support. Unsupported/blocked/oversized/JS-only pages offer pasted text or explicit visible
extension capture; never display invented success or silently fetch internal URLs.

## Duplicates, failures and privacy

Same idempotency key + same capture returns the same draft; changed body conflicts. A normalized
source-URL hint and text hash can suggest duplicates within the account only, never merge distinct
advert versions automatically or share cross-account existence. Retain a new capture when source
text changes; user chooses whether it updates the same vacancy. Processing errors, refusals,
timeouts and cancellation keep original draft, show clear retry/manual review and preserve unknown
cost liability. Late extraction cannot overwrite a user's reviewed fields; bind expected revision.

Avoid collecting applicant contact data and unrelated recruiter personal information. Optional
recruiter details need clear purpose and retention policy; never trigger outreach. Secure transport,
RLS, user ownership, CSRF, no source/prompt/secret logging, bounded storage and deletion/retention
handling apply to all adapters. No EU-only or compliance guarantee follows from a region label.
No extension, URL fetcher, extraction deployment, paid call or cloud migration is authorized by
this design. Firstmate coordinates future per-site feasibility, async extraction and activation scope.
