import { useEffect, useMemo, useRef, useState } from "react";
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
        <li>Extract the ZIP to get the Resumeify Extension folder.</li>
        <li>
          Open chrome://extensions, enable Developer mode, choose Load unpacked
          and select Resumeify Extension, the folder containing manifest.json.
        </li>
        <li>
          Click Connect account. If you are already signed in, connection is
          automatic; otherwise sign in with your existing Resumora account.
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
              Bounded visible page text or explicit visible selection; backend
              extraction follows your settings. Metadata is ancillary. Live
              sites unverified
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
        Bounded visible page text (or your explicit visible selection), source
        URL and ancillary job metadata are sent. Forms, hidden content,
        navigation and recognized account/recommendation areas are excluded.
        Missing fields stay unknown. No browser history, cookies, passwords or
        CV contents are collected. AI is off. Queued local snapshots expire
        after 24 hours and are removed after acknowledgement or discard. The
        extension can only capture jobs and check its receipts.
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
async function authorizeConnection(
  body: Record<string, string | null>,
  transport: AuthTransport,
  isCurrent: () => boolean,
) {
  const runtime = (
    globalThis as typeof globalThis & {
      chrome?: {
        runtime?: {
          sendMessage: (
            extensionId: string,
            message: unknown,
          ) => Promise<{ ok?: boolean }>;
        };
      };
    }
  ).chrome?.runtime;
  const updateMessage =
    "Update the extension, then click Connect account again.";
  if (!runtime?.sendMessage) throw Error(updateMessage);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let proof: { ok?: boolean };
  try {
    proof = await Promise.race([
      runtime.sendMessage(body.extensionId!, {
        type: "verify-connection",
        ...body,
      }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(Error(updateMessage)), 10000);
      }),
    ]);
  } catch {
    throw Error(updateMessage);
  } finally {
    clearTimeout(timer);
  }
  if (proof?.ok !== true)
    throw Error("Open the extension and click Connect account again.");
  if (!isCurrent()) throw Error("Connection cancelled.");
  const response = await transport("/v1/extension/authorize", {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!response.ok)
    throw Error(
      response.status === 503
        ? "The connection service is temporarily unavailable. Try again in a moment."
        : response.status === 401
          ? "Sign in to Resumora, then click Connect account again."
          : "We couldn't connect the extension. Try again.",
    );
  const result = await response.json(),
    redirect = new URL(result.redirect);
  if (
    redirect.origin !== `https://${body.extensionId}.chromiumapp.org` ||
    redirect.pathname !== "/capture" ||
    redirect.username ||
    redirect.password ||
    redirect.hash ||
    redirect.searchParams.getAll("state").length !== 1 ||
    redirect.searchParams.get("state") !== body.state ||
    redirect.searchParams.getAll("code").length !== 1 ||
    !/^[a-f0-9]{64}$/.test(redirect.searchParams.get("code") ?? "") ||
    [...redirect.searchParams.keys()].some(
      (key) => !["state", "code"].includes(key),
    )
  )
    throw Error(
      "We couldn't verify the connection. Open the extension and connect again.",
    );
  return redirect.href;
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
  const [retry, setRetry] = useState(0);
  const pending = useRef<{ key: string; request: Promise<string> } | null>(
    null,
  );
  const currentRequest = useRef<string | null>(null);
  const managing = window.location.pathname === "/extension/manage";
  const search = window.location.search;
  const params = useMemo(() => new URLSearchParams(search), [search]);
  const body = useMemo(
    () =>
      Object.fromEntries(
        ["extensionId", "deviceId", "challenge", "state"].map((key) => [
          key,
          params.get(key),
        ]),
      ),
    [params],
  );
  const valid =
    Object.keys(body).every((key) => params.getAll(key).length === 1) &&
    /^[a-p]{32}$/.test(body.extensionId ?? "") &&
    /^[0-9a-f-]{36}$/.test(body.deviceId ?? "") &&
    /^[A-Za-z0-9_-]{43}$/.test(body.challenge ?? "") &&
    /^[A-Za-z0-9_-]{43,128}$/.test(body.state ?? "");
  useEffect(() => {
    if (managing || !valid) return;
    let active = true;
    const key = JSON.stringify([account.id, search, retry]);
    currentRequest.current = key;
    setMessage("");
    setBusy(true);
    if (pending.current?.key !== key)
      pending.current = {
        key,
        request: authorizeConnection(
          body,
          transport,
          () => currentRequest.current === key,
        ),
      };
    pending.current.request
      .then((redirect) => {
        if (active) window.location.assign(redirect);
      })
      .catch((error) => {
        if (active) {
          setMessage(error.message);
          setBusy(false);
        }
      });
    return () => {
      active = false;
      currentRequest.current = null;
    };
  }, [account.id, body, managing, retry, search, transport, valid]);
  async function revoke() {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await transport("/v1/extension/revoke", {
        method: "POST",
        body: "{}",
      });
      if (!response.ok) throw Error();
      setMessage(
        "All capture connections revoked. Already saved drafts remain in your account.",
      );
    } catch {
      setMessage("We couldn't disconnect the extension. Try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-panel stack extension-connection">
      <h1>
        {managing ? "Manage connected extensions" : "Connect to Resumora"}
      </h1>
      <p>Signed in as {account.email}</p>
      <p>
        {managing
          ? "Revoke all extension connections for this account. New captures will require connecting again."
          : "Save job postings directly to your Resumora account."}
      </p>
      {!managing && !valid ? (
        <p role="alert">
          Invalid pairing request. Start again from the extension.
        </p>
      ) : managing ? (
        <button
          className="btn btn-primary"
          disabled={busy}
          onClick={() => void revoke()}
        >
          Revoke all capture connections
        </button>
      ) : busy ? (
        <p role="status">Connecting your account…</p>
      ) : null}
      {message && <p role={managing ? "status" : "alert"}>{message}</p>}
      {!managing && valid && message && (
        <button
          className="btn btn-primary"
          onClick={() => setRetry((value) => value + 1)}
        >
          Try again
        </button>
      )}
      <a href="/extension">{managing ? "Back" : "Cancel"}</a>
    </main>
  );
}
