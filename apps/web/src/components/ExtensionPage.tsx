import { useState } from "react";
import type { Account, AuthTransport } from "../auth/AuthShell";

export function storeLink(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "chromewebstore.google.com" ||
      url.port ||
      url.username ||
      url.password ||
      !/^\/detail\/(?:[a-z0-9-]+\/)?[a-p]{32}$/.test(url.pathname) ||
      url.search ||
      url.hash
    )
      return null;
    return url.href;
  } catch {
    return null;
  }
}
export function ExtensionPage({
  storeUrl = import.meta.env.VITE_CHROME_WEB_STORE_URL,
}: {
  storeUrl?: string;
}) {
  const published = storeLink(storeUrl);
  return (
    <main className="auth-panel stack">
      <a href="/">Resumora</a>
      <h1>Capture a job. Review afterward.</h1>
      <p>
        On a job posting, click the Resumora toolbar button to save a private
        draft in your account. You can move to another posting while the server
        prepares it.
      </p>
      {published ? (
        <a className="btn btn-primary" href={published} rel="noreferrer">
          Install from Chrome Web Store
        </a>
      ) : (
        <p>Chrome Web Store installation is not published/configured yet.</p>
      )}
      <a
        className="btn btn-secondary"
        href="/downloads/resumora-extension.zip"
        download
      >
        Download developer ZIP · v0.1.0
      </a>
      <p>
        This source ZIP is built for this site and has a stable extension ID. It
        requires Chrome Developer mode and does not install by opening the ZIP.
      </p>
      <ol>
        <li>Extract the ZIP into a folder.</li>
        <li>
          Open chrome://extensions, enable Developer mode, choose Load unpacked
          and select the folder.
        </li>
        <li>
          Connect your existing Resumora account and approve capture-only access.
          Each installation uses the same public extension identity.
        </li>
        <li>
          Open the full job posting and click the toolbar. Wait for a saved
          receipt; review the draft in Jobs.
        </li>
      </ol>
      <p>
        Normal Chrome installation for Windows/macOS uses a published Store
        listing. The ZIP is for developer loading; downloading it does not
        configure or deploy the backend.
      </p>
      <h2>Site readiness</h2>
      <table>
        <thead>
          <tr>
            <th>Adapter</th>
            <th>Verification</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Greenhouse / Ashby</td>
            <td>Synthetic rendered job sections and JobPosting fixtures</td>
          </tr>
          <tr>
            <td>LinkedIn / BestJobs</td>
            <td>
              Synthetic rendered job sections; live site compatibility
              unverified
            </td>
          </tr>
          <tr>
            <td>Lever / Workday / SmartRecruiters / iCIMS</td>
            <td>Synthetic rendered job sections; live sites unverified</td>
          </tr>
          <tr>
            <td>Oracle / Taleo / SuccessFactors / Workable</td>
            <td>Synthetic rendered job sections; live sites unverified</td>
          </tr>
          <tr>
            <td>Recruitee / BambooHR / Personio / Teamtailor / Indeed</td>
            <td>Synthetic rendered job sections; live sites unverified</td>
          </tr>
          <tr>
            <td>Other sites</td>
            <td>
              Structured JobPosting or a bounded job-description container; ambiguous pages require explicit text selection or manual paste. Live sites unverified
            </td>
          </tr>
        </tbody>
      </table>
      <p>
        Wait for dynamic content to load. For embedded/restricted/unreadable
        pages, open the original job page or paste the advert in Jobs. There is
        no login/CAPTCHA bypass, automatic application or all-sites guarantee.
      </p>
      <h2>Your data</h2>
      <p>
        Only your selected job text, source URL and available job metadata are
        sent. Missing fields stay unknown. No browser history, cookies,
        passwords or CV contents are collected. AI is off. Queued local
        snapshots expire after 24 hours and are removed after acknowledgement or
        discard. The extension can only capture jobs and check its receipts.
      </p>
      <p>
        Disconnect in the extension, sign out of the connected web login, or{" "}
        <a href="/extension/manage">
          revoke all capture connections in your account
        </a>
        .
      </p>
    </main>
  );
}
export function ExtensionConnection({
  account,
  transport,
}: {
  account: Account;
  transport: AuthTransport;
}) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const managing = window.location.pathname === "/extension/manage";
  const params = new URLSearchParams(window.location.search);
  const body = Object.fromEntries(
    ["extensionId", "deviceId", "challenge", "state"].map((key) => [
      key,
      params.get(key),
    ]),
  );
  const valid =
    Object.keys(body).every((key) => params.getAll(key).length === 1) &&
    /^[a-p]{32}$/.test(body.extensionId ?? "") &&
    /^[0-9a-f-]{36}$/.test(body.deviceId ?? "") &&
    /^[A-Za-z0-9_-]{43}$/.test(body.challenge ?? "") &&
    /^[A-Za-z0-9_-]{43,128}$/.test(body.state ?? "");
  async function approve() {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await transport(
        "/v1/extension/" + (managing ? "revoke" : "authorize"),
        { method: "POST", body: JSON.stringify(managing ? {} : body) },
      );
      if (!response.ok) throw Error();
      if (managing)
        setMessage(
          "All capture connections revoked. Already saved drafts remain in your account.",
        );
      else {
        const result = await response.json(),
          redirect = new URL(result.redirect);
        if (
          redirect.origin !== `https://${body.extensionId}.chromiumapp.org` ||
          redirect.pathname !== "/capture" ||
          redirect.searchParams.get("state") !== body.state
        )
          throw Error();
        window.location.assign(redirect.href);
      }
    } catch {
      setMessage(
        "Could not confirm the connection change. Retry, or cancel and reconnect from the extension.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-panel stack">
      <h1>{managing ? "Manage capture connections" : "Connect job capture"}</h1>
      <p>Account: {account.email}</p>
      <p>
        {managing
          ? "Revoke all extension connections for this account. New captures will require connecting again."
          : "Allow this installation to save jobs and check capture receipts. It cannot read/edit your CV or administer your account. Saved jobs may be analyzed automatically if enabled in your Resumora settings."}
      </p>
      {!managing && valid && (
        <p>
          Extension {body.extensionId} · device {body.deviceId?.slice(0, 8)} ·
          permission jobs:capture · expires within seven days/current login
          lifetime.
        </p>
      )}
      {!managing && !valid ? (
        <p role="alert">
          Invalid pairing request. Start again from the extension.
        </p>
      ) : (
        <button
          className="btn btn-primary"
          disabled={busy}
          onClick={() => void approve()}
        >
          {managing
            ? "Revoke all capture connections"
            : "Allow capture-only connection"}
        </button>
      )}
      {message && <p role="status">{message}</p>}
      <a href="/extension">Cancel / extension information</a>
    </main>
  );
}
