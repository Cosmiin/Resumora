# Resumora capture 0.1.0

Capture runs only on an explicit toolbar action. There is no background page
collection, application automation, login/CAPTCHA bypass or paid AI. Scripts
are bundled, never remote.

1. Download the ZIP from your Resumora site's Extension page and extract it.
   All extension files are inside the **Resumeify Extension** folder.
2. Open `chrome://extensions`, enable Developer mode, choose **Load unpacked**,
   and select **Resumeify Extension**, the folder containing `manifest.json`.
   Only load source you trust. This developer workflow
   is not a normal one-click installation for Windows/macOS Chrome users.
3. Click Connect account. If you are already signed in, the extension connects
   automatically; otherwise sign into your existing account on the site.
   The packaged public manifest key
   fixes the extension ID across installation folders and users; there is no
   per-install operator registration.
4. On a full job posting, click the toolbar. A snapshot queues locally; a Saved
   receipt appears only after server acknowledgement. You can then close the
   popup/navigate and capture another job. Each receipt shows the posting title
   and site, with an **Open saved job** link to its draft. The toolbar click
   saves immediately; the popup offers a capture button only if extraction
   failed, so opening it and clicking again cannot queue two copies.

Connection lasts at most seven days/current login lifetime; ten-minute access
credentials renew through a revocable capture-only connection. Disconnect in
the popup or revoke connections in the site's Extension page. Signing out or
replacing the web login fences that login's connections. Pending transport is
kept locally for at most 24 hours, at most ten unsent captures; three automatic
delivery attempts then explicit retry. Accepted receipts continue polling even
when acknowledgement took three attempts. Account changes require explicit
reconciliation under the original account, never silent reassignment. A capture pins its account and connection generation
before tab lookup/extraction; a connection change rejects enqueue. Local
queued text is removed after acknowledgement or discard. Identical URL and
source content reuse the same pending request or retained saved receipt,
including after popup closure or worker restart. Local records expire after
24 hours; at most the newest twenty acknowledged receipts are retained.
Before reusing an acknowledged receipt, the extension verifies its server
status. A confirmed permanent deletion retires the local receipt and allows
a new capture; an unavailable or ambiguous status shows an error without
creating a second request. Changed
posting text or metadata at the same URL creates a separate capture. Reuse
never crosses an account or connection generation. Dismissing/discarding the
local record allows the posting to be captured again. A content fingerprint,
posting title and source URL remain with the receipt until it expires; full
source text does not. Stored credentials
and pending text are limited to trusted extension contexts.

## Site package

The site build generates its download from exact public `APP_ORIGIN` and
`API_ORIGIN` values. They must match because existing account authentication
uses the site's same-origin `/v1` proxy. HTTPS is required except for explicitly
configured local 127.0.0.1 development. No active public hostname is assumed.
A production build fails without an origin, rather than shipping a local ZIP.
Local Vite development serves a generated 127.0.0.1:5173 package by default.

For a separate package, from the repository root:
`npm run package --workspace @resumora/extension -- https://YOUR_SITE https://YOUR_SITE`.
This writes `apps/web/public/downloads/resumora-extension.zip`; it is generated,
not checked in. No private environment values or discovered files enter it.
Chrome host patterns cannot restrict a port; runtime requests use the exact
configured origin/port and send no cookies. Server migration and server-only
worker authorization remain separately approved operator setup.

The current public identity is `nijbkdlbbeepfncgdldnmppflmkjmhpj`, accepted by
the API by default. It is a stable unpacked identity, not a published Store
item. Normal Store installation remains an external operator action: create
an item, adopt its dashboard public key and matching API identity, verify the
installed ID, publish through the approved Store process, and configure the
real listing URL. No Store registration, payment, upload or publication was
performed here. See the repository's `docs/setup/job-extension.md`.

## Capture coverage

| Path | Synthetic fixture coverage | Live installed Chrome |
| --- | --- | --- |
| Greenhouse, Ashby | Visible page text and ancillary JobPosting metadata | Unverified |
| LinkedIn, BestJobs | Rendered sections | Unverified |
| Lever, Workday, SmartRecruiters, iCIMS | Rendered sections | Unverified |
| Oracle/Taleo, SuccessFactors, Workable | Rendered sections | Unverified |
| Recruitee, BambooHR, Personio, Teamtailor, Indeed | Rendered sections | Unverified |
| Unknown hosts | Bounded sanitized visible page text or explicit visible selection; ancillary metadata only | Unverified |

Broad ATS support is the goal; synthetic fixtures do not prove all ATS work.
Hidden text, form values, navigation, comments and recognized account/profile,
recommendation and page-chrome containers are excluded from rendered text. On
an explicit click, the collector reads bounded sanitized visible page text for
backend AI extraction; a short/missing primary job container does not narrow
that source. Explicit selection limits capture to selected visible text.
JSON-LD is ancillary allowlisted metadata only: hidden descriptions never
supply or replace source text, and conflicting/multiple posting metadata is
omitted. Scripts and forms are never executed or collected.
Missing fields remain unknown and saved metadata is unreviewed. Broad structured
qualifications and content language remain original source data; they do not
establish certifications or candidate language requirements. Dynamic pages
must finish loading before click. For cross-origin embedded frames, open the
posting directly; for restricted/unreadable pages, paste the advert in Jobs.

MIT licensed source; icons are original code-drawn document marks. No external
runtime libraries or remote executable assets are packaged.

Ambiguous profile/account regions, multiple visible/structured jobs, missing/too-short visible content, restricted frames and oversized captures require opening the original posting, explicit selection or manual paste. Oversized captures are rejected without silent truncation. The popup discloses visible page/selected-text transmission. Named adapters label synthetic-fixture coverage only; live-site and installed Chrome verification remain pending. No metadata description HTML is submitted as source text.
