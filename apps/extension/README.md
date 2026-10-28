# Resumora capture 0.1.0

Development source package, not a Chrome Web Store installation. It saves on an
explicit toolbar action. There is no background page collection, application
automation, login/CAPTCHA bypass or paid AI. Scripts are bundled, never remote.

1. Download the ZIP from Resumora's Extension page and extract it into a folder.
2. Open `chrome://extensions`, enable Developer mode, choose **Load unpacked**,
   and select that folder. Only load source you trust. This developer workflow
   is not a normal one-click installation for Windows/macOS Chrome users.
3. Copy the assigned extension ID from Chrome. An operator must explicitly add
   that ID to the API's CAPTURE_EXTENSION_IDS (comma-separated, no wildcards).
4. Start the configured Resumora site/API. Click the extension's Connect account
   button, sign into the existing account and approve capture-only access.
5. On a full job posting, click the toolbar. A snapshot queues locally; a Saved
   receipt appears only after server acknowledgement. You can then close the
   popup/navigate and capture another job. Open Resumora Jobs to review drafts.

Connection lasts at most seven days/current login lifetime; ten-minute access
credentials renew through a revocable capture-only connection. Disconnect in
the popup or revoke connections in the site's Extension page. Signing out or
replacing the web login fences that login's connections. Pending transport is
kept locally for at most 24 hours, at most ten unsent captures; three automatic
attempts then explicit retry. Account changes require explicit reconciliation
under the original account, never silent reassignment. Local queued text is
removed after acknowledgement or discard. Stored credentials/pending text are
limited to trusted extension contexts and are never content-script accessible.

The default ZIP targets `http://127.0.0.1:5173` for both app/API. Chrome host
patterns cannot restrict a port; runtime fetch destinations use the exact
configured origin/port. Rebuild for an actual configured HTTPS site; do not
claim the pending resumora.ro domain is active. Build from repository root:
`npm run package --workspace @resumora/extension -- https://YOUR_SITE https://YOUR_SITE`.
No private environment variables or filesystem-discovered files enter the ZIP.
API setup/forward SQL and operator secret-hash provisioning must be completed
separately before capture works; downloading does not configure a server.

Synthetic verification targets: Greenhouse/Ashby job sections and JobPosting
data; rendered LinkedIn/BestJobs selectors; generic visible main/article text.
These are fixture-tested adapters, not verified live website support or an
all-sites promise. Hidden fields/form values/comments/navigation are excluded.
Missing fields remain unknown. Dynamic pages must finish loading before click.
Cross-origin embedded frames: open the actual posting directly. Restricted or
unreadable pages: paste job text into Resumora. No page-wide body fallback.

MIT licensed source; icons are original code-drawn document marks. No external
runtime libraries or remote executable assets are packaged.
