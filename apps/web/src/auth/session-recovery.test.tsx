import { webcrypto } from "node:crypto";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AuthShell, type AuthTransport } from "./AuthShell";
import { ConnectedApp } from "./ConnectedApp";
import { ImportDocument } from "../components/ImportDocument";
import { httpIntelligence } from "../base/intelligence";
import { maraReviewDraft } from "../base/fixture";
import { blankDraft, fact, newOptionalEntry } from "../base/model";
import { authRoute } from "../../../api/src/auth/routes";
import {
  authenticateRequest,
  authHeaders,
  saveSession,
} from "../../../api/src/auth/session";
import type { AuthConfig } from "../../../api/src/auth/session";
import type { Snapshot } from "../base/adapter";

afterEach(() => vi.unstubAllGlobals());
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
async function backend() {
  vi.stubGlobal("crypto", webcrypto);
  vi.stubGlobal("fetch", () => {
    throw Error("NETWORK_DENIED");
  });
  let now = Date.now();
  vi.spyOn(Date, "now").mockImplementation(() => now);
  const env: AuthConfig = {
    APP_ENV: "development",
    APP_ORIGIN: "http://127.0.0.1:5173",
    API_ORIGIN: "http://127.0.0.1:5173",
    SUPABASE_URL: "https://synthetic.supabase.co",
    SUPABASE_PUBLISHABLE_KEY: "sb_publishable_synthetic",
    AUTH_COOKIE_KEY: btoa(String.fromCharCode(...new Uint8Array(32).fill(19))),
  };
  const user = {
    id: crypto.randomUUID(),
    email: "a@synthetic.invalid",
    email_confirmed_at: "2026-01-01T00:00:00Z",
    aud: "authenticated",
    app_metadata: {},
    user_metadata: {},
    created_at: "2026-01-01T00:00:00Z",
  };
  let currentUser = user,
    invalidRefresh = false,
    refreshGate: Promise<void> | undefined;
  let unavailable = false;
  let refreshes = 0,
    sessions = 0;
  const session = () => ({
    access_token:
      "eyJhbGciOiJIUzI1NiJ9." +
      btoa(
        JSON.stringify({
          sub: currentUser.id,
          exp: Math.floor(now / 1000) + 3600,
        }),
      ) +
      ".synthetic",
    refresh_token: crypto.randomUUID(),
    expires_at: Math.floor(now / 1000) + 3600,
    expires_in: 3600,
    token_type: "bearer" as const,
    user: currentUser,
  });
  const provider: typeof fetch = async (input) => {
    const url = new URL(String(input));
    expect(url.origin).toBe(env.SUPABASE_URL);
    if (url.pathname === "/auth/v1/user") return Response.json(currentUser);
    expect(url.pathname).toBe("/auth/v1/token");
    expect(url.searchParams.get("grant_type")).toBe("refresh_token");
    refreshes++;
    await refreshGate;
    if (unavailable)
      return Response.json(
        { message: "synthetic unavailable" },
        { status: 429 },
      );
    return invalidRefresh
      ? Response.json({ error: "invalid_grant" }, { status: 400 })
      : Response.json(session());
  };
  const jar = new Map<string, string>();
  const accept = (response: Response) => {
    for (const value of response.headers.getSetCookie()) {
      const [pair] = value.split(";");
      const at = pair.indexOf("=");
      if (pair.slice(at + 1)) jar.set(pair.slice(0, at), pair.slice(at + 1));
      else jar.delete(pair.slice(0, at));
    }
  };
  const headers = authHeaders();
  await saveSession(
    headers,
    env,
    { ...session(), expires_at: Math.floor(now / 1000) + 100 },
    false,
    "csrf-a",
  );
  accept(new Response(null, { headers }));
  const draft = maraReviewDraft(),
    defaults = blankDraft();
  draft.contacts.push(
    {
      ...defaults.contacts.find((c) => c.kind === "phone")!,
      value: fact("+40 700 000 000"),
    },
    {
      ...defaults.contacts.find((c) => c.platform === "linkedin")!,
      value: fact("https://linkedin.com/in/synthetic-candidate"),
    },
  );
  const language = newOptionalEntry();
  language.title = fact("Română");
  language.proficiency = fact("Native");
  draft.optionalSections.push({
    id: "languages",
    kind: "languages",
    label: "",
    entries: [language],
  });
  draft.technicalSkills[0].status = "extracted_unconfirmed";
  draft.technicalSkills[0].acceptance = "automatic";
  draft.technicalSkills[0].sourceClaimId = "skill";
  draft.importReview = {
    id: crypto.randomUUID(),
    sourceHash: "a".repeat(64),
    format: "pdf",
    parserVersion: "synthetic",
    pages: 1,
    admission: { kind: "cv", reason: "CV", pages: [1] },
    extraction: {
      schemaVersion: "cv-extraction/1",
      candidates: [
        {
          id: "skill",
          path: "technicalSkills.0",
          value: "SQL",
          quote: "SQL",
          page: 1,
          confidence: "high",
        },
      ],
      warnings: [],
      omittedPages: [],
    },
    confirmedIds: [],
  };
  let snapshot: Snapshot = {
    id: crypto.randomUUID(),
    revision: 1,
    parentId: null,
    createdAt: new Date().toISOString(),
    reason: "autosave",
    draft,
  };
  const writes: Record<string, unknown>[] = [],
    attempts: {
      path: string;
      body: unknown;
      signal?: AbortSignal | null;
      headers: Headers;
    }[] = [];
  const events: string[] = [];
  let beforeUpload: (() => void) | undefined;
  const fetcher: typeof fetch = async (input, init = {}) => {
    const path = String(input),
      hdrs = new Headers(init.headers);
    hdrs.set("Cookie", [...jar].map(([k, v]) => `${k}=${v}`).join("; "));
    if (init.method === "POST") hdrs.set("Origin", env.APP_ORIGIN!);
    const request = new Request(env.APP_ORIGIN + path, {
      ...init,
      signal: undefined,
      body: init.body instanceof File ? "synthetic-file" : init.body,
      headers: hdrs,
    });
    if (path.startsWith("/v1/auth/")) {
      sessions++;
      const response = await authRoute(request, env, provider);
      accept(response);
      return response;
    }
    if (path === "/v1/intelligence/imports" && init.method === "POST")
      beforeUpload?.();
    attempts.push({
      path,
      body: init.body,
      signal: init.signal,
      headers: hdrs,
    });
    const identity = await authenticateRequest(request, env, provider);
    if (identity.response) {
      expect(identity.response.headers.getSetCookie()).toEqual([]);
      return identity.response;
    }
    if (identity.user.id !== user.id) {
      expect(path).toBe("/v1/base-cv");
      return Response.json(null);
    }
    if (path === "/v1/base-cv") return Response.json(snapshot);
    if (path === "/v1/base-cv/save") {
      const body = JSON.parse(String(init.body));
      expect(body.expectedRevision).toBe(snapshot.revision);
      writes.push(body);
      snapshot = {
        ...snapshot,
        id: crypto.randomUUID(),
        parentId: snapshot.id,
        revision: snapshot.revision + 1,
        draft: body.draft,
        reason: body.mode,
      };
      return Response.json(snapshot);
    }
    events.push(path);
    if (path.endsWith("/cancel")) return Response.json({});
    if (path === "/v1/intelligence/imports" && init.method !== "POST")
      return Response.json([]);
    return Response.json({ id: path.split("/").at(-1), state: "cancelled" });
  };
  return {
    fetcher,
    writes,
    attempts,
    events,
    draft,
    get snapshot() {
      return snapshot;
    },
    get refreshes() {
      return refreshes;
    },
    get sessions() {
      return sessions;
    },
    age() {
      now += 11000;
    },
    onUpload(fn: () => void) {
      beforeUpload = fn;
    },
    hold(gate: Promise<void>) {
      refreshGate = gate;
    },
    invalid() {
      invalidRefresh = true;
    },
    unavailable() {
      unavailable = true;
    },
    switchAccount() {
      currentUser = {
        ...user,
        id: crypto.randomUUID(),
        email: "b@synthetic.invalid",
      };
    },
  };
}
it.each(["autosave", "checkpoint"] as const)(
  "refreshes a 100-second session after 11 seconds while preserving the actual editor and one %s",
  async (mode) => {
    const server = await backend(),
      gate = deferred();
    server.hold(gate.promise);
    window.location.hash = "#base";
    render(
      <AuthShell fetcher={server.fetcher}>
        {(account, transport) => (
          <ConnectedApp account={account} transport={transport} />
        )}
      </AuthShell>,
    );
    const first = await screen.findByRole<HTMLInputElement>("textbox", {
      name: /Prenume/,
    });
    expect(server.refreshes).toBe(0);
    server.age();
    fireEvent.change(first, { target: { value: "Edited" } });
    if (mode === "checkpoint") {
      fireEvent.click(
        screen.getByRole("button", {
          name: /Salvează acum/,
        }),
      );
    }
    await waitFor(() => expect(server.refreshes).toBe(1));
    expect(screen.getByRole("textbox", { name: /Prenume/ })).toBe(first);
    expect(first.value).toBe("Edited");
    await act(async () => gate.resolve());
    await waitFor(() => expect(server.writes).toHaveLength(1));
    expect(server.refreshes).toBe(1);
    expect(server.sessions).toBe(2);
    expect(screen.getByRole("textbox", { name: /Prenume/ })).toBe(first);
    expect(first.value).toBe("Edited");
    expect(server.snapshot.draft.nameParts?.first).toBe("Edited");
    expect(server.snapshot.draft.importReview?.confirmedIds).toEqual([]);
    expect(server.snapshot.draft.technicalSkills[0]).toMatchObject({
      status: "extracted_unconfirmed",
      acceptance: "automatic",
      sourceClaimId: "skill",
    });
    expect(server.snapshot.draft.answers).toEqual(server.draft.answers);
    expect(server.snapshot.draft.presentation).toEqual(
      server.draft.presentation,
    );
    const sent = server.attempts.filter((a) => a.path.endsWith("/save"));
    expect(sent).toHaveLength(2);
    expect(sent[0].body).toBe(sent[1].body);
    expect(server.writes[0].expectedRevision).toBe(1);
    expect(server.writes[0].mode).toBe(mode);
  },
);
it("refreshes while saving staged confirmation and opens the editor only after an unaccepted historical fact is reviewed", async () => {
  const server = await backend(),
    gate = deferred();
  delete server.draft.technicalSkills[0].acceptance;
  server.hold(gate.promise);
  window.location.hash = "#base";
  render(
    <AuthShell fetcher={server.fetcher}>
      {(account, transport) => (
        <ConnectedApp account={account} transport={transport} />
      )}
    </AuthShell>,
  );
  const confirm = await screen.findByRole("button", {
    name: "Confirmă și deschide editorul",
  });
  expect(screen.queryByRole("textbox", { name: /Prenume/ })).toBeNull();
  expect(server.writes).toEqual([]);
  server.age();
  fireEvent.click(confirm);
  await waitFor(() => expect(server.refreshes).toBe(1));
  const first = await screen.findByRole("textbox", { name: /Prenume/ });
  expect(server.writes).toEqual([]);
  await act(async () => gate.resolve());
  await waitFor(() => expect(server.writes).toHaveLength(1));
  expect(screen.getByRole("textbox", { name: /Prenume/ })).toBe(first);
  expect(server.snapshot.draft.importReview?.confirmedIds).toEqual(["skill"]);
  expect(server.snapshot.draft.technicalSkills[0]).toMatchObject({
    status: "user_confirmed",
    sourceClaimId: "skill",
  });
  expect(server.writes[0].mode).toBe("autosave");
  const sent = server.attempts.filter((a) => a.path.endsWith("/save"));
  expect(sent).toHaveLength(2);
  expect(sent[0].body).toBe(sent[1].body);
  expect(server.refreshes).toBe(1);
});
it.each(["invalid", "switch"] as const)(
  "fails closed on %s refresh without dispatching the old draft",
  async (outcome) => {
    const server = await backend();
    window.location.hash = "#base";
    render(
      <AuthShell fetcher={server.fetcher}>
        {(account, transport) => (
          <ConnectedApp account={account} transport={transport} />
        )}
      </AuthShell>,
    );
    const first = await screen.findByRole<HTMLInputElement>("textbox", {
      name: /Prenume/,
    });
    server.age();
    if (outcome === "invalid") server.invalid();
    else server.switchAccount();
    fireEvent.change(first, { target: { value: "Private edit A" } });
    await waitFor(() => expect(server.refreshes).toBe(1));
    await waitFor(() =>
      expect(screen.queryByDisplayValue("Private edit A")).toBeNull(),
    );
    expect(server.writes).toEqual([]);
    expect(
      server.attempts.filter((a) => a.path.endsWith("/save")),
    ).toHaveLength(1);
  },
);
it.each(["cancel", "unmount"] as const)(
  "does not replay upload when %s occurs during explicit refresh after a straddled precheck",
  async (action) => {
    const server = await backend(),
      gate = deferred();
    server.hold(gate.promise);
    server.onUpload(() => server.age());
    const view = render(
      <AuthShell fetcher={server.fetcher}>
        {(_, transport) => (
          <ImportDocument
            client={httpIntelligence(transport)}
            revision={1}
            start={() => {}}
          />
        )}
      </AuthShell>,
    );
    const file = await screen.findByLabelText("Document CV");
    fireEvent.change(file, {
      target: { files: [new File(["%PDF-synthetic"], "cv.pdf")] },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Încarcă și analizează" }),
    );
    await waitFor(() => expect(server.refreshes).toBe(1));
    if (action === "cancel")
      fireEvent.click(
        screen.getByRole("button", { name: "Anulează importul" }),
      );
    else view.unmount();
    await act(async () => gate.resolve());
    if (action === "cancel")
      await screen.findByText(
        "Import anulat. Alege un document pentru a continua.",
      );
    expect(
      server.attempts.filter(
        (a) => a.path === "/v1/intelligence/imports" && a.signal,
      ),
    ).toHaveLength(1);
    expect(server.events.filter((p) => p.endsWith("/cancel"))).toHaveLength(
      action === "cancel" ? 1 : 0,
    );
  },
);
it("bounds recovery to one replay and keeps the dirty editor on a repeated pre-dispatch rejection", async () => {
  const server = await backend();
  let rejected = 0;
  const fetcher: typeof fetch = (input, init) => {
    if (!String(input).endsWith("/save")) return server.fetcher(input, init);
    rejected++;
    return Promise.resolve(
      Response.json(
        { error: { code: "SESSION_REFRESH_REQUIRED" } },
        { status: 409 },
      ),
    );
  };
  window.location.hash = "#base";
  render(
    <AuthShell fetcher={fetcher}>
      {(account, transport) => (
        <ConnectedApp account={account} transport={transport} />
      )}
    </AuthShell>,
  );
  const first = await screen.findByRole<HTMLInputElement>("textbox", {
    name: /Prenume/,
  });
  fireEvent.change(first, { target: { value: "Retained dirty draft" } });
  await screen.findByText(/Reverifică sesiunea/);
  expect(screen.getByDisplayValue("Retained dirty draft")).toBe(first);
  expect(server.writes).toEqual([]);
  expect(server.sessions).toBe(2);
  expect(rejected).toBe(2);
});

it("replays only the pre-dispatch upload with its original operation and revision, then safely recovers status and cancellation", async () => {
  const server = await backend();
  server.onUpload(() => server.age());
  let transport!: AuthTransport;
  render(
    <AuthShell fetcher={server.fetcher}>
      {(_, next) => {
        transport = next;
        return <p>Mounted account</p>;
      }}
    </AuthShell>,
  );
  await screen.findByText("Mounted account");
  const client = httpIntelligence(transport),
    controller = new AbortController();
  const op = crypto.randomUUID(),
    file = new File(["%PDF-synthetic"], "cv.pdf");
  await act(async () => {
    await client.importDocument(file, op, 7, controller.signal);
  });
  const uploads = server.attempts.filter(
    (a) => a.path === "/v1/intelligence/imports",
  );
  expect(uploads).toHaveLength(2);
  for (const upload of uploads) {
    expect(upload.body).toBe(file);
    expect(upload.headers.get("X-Operation-Id")).toBe(op);
    expect(upload.headers.get("X-Expected-Revision")).toBe("7");
  }
  expect(
    server.events.filter((p) => p === "/v1/intelligence/imports"),
  ).toHaveLength(1);
  await act(async () => {
    await client.importStatus(op, controller.signal);
    await client.cancelImport(op, controller.signal);
  });
  expect(server.events).toContain(`/v1/intelligence/imports/${op}`);
  expect(server.events.filter((p) => p.endsWith("/cancel"))).toHaveLength(1);
  expect(server.refreshes).toBe(1);
});

it.each(["status", "cancel"] as const)(
  "recovers a refresh-required import %s without duplicate control dispatch",
  async (action) => {
    const server = await backend();
    let transport!: AuthTransport;
    render(
      <AuthShell fetcher={server.fetcher}>
        {(_, next) => {
          transport = next;
          return <p>Mounted account</p>;
        }}
      </AuthShell>,
    );
    await screen.findByText("Mounted account");
    server.age();
    const client = httpIntelligence(transport),
      op = crypto.randomUUID(),
      controller = new AbortController();
    await act(async () => {
      if (action === "status") await client.importStatus(op, controller.signal);
      else await client.cancelImport(op, controller.signal);
    });
    const path = `/v1/intelligence/imports/${op}${action === "cancel" ? "/cancel" : ""}`;
    expect(server.attempts.filter((a) => a.path === path)).toHaveLength(2);
    expect(server.events.filter((p) => p === path)).toHaveLength(1);
    expect(server.refreshes).toBe(1);
  },
);
it("retains the actual dirty editor with a recoverable error when explicit refresh is temporarily unavailable", async () => {
  const server = await backend();
  window.location.hash = "#base";
  render(
    <AuthShell fetcher={server.fetcher}>
      {(account, transport) => (
        <ConnectedApp account={account} transport={transport} />
      )}
    </AuthShell>,
  );
  const first = await screen.findByRole<HTMLInputElement>("textbox", {
    name: /Prenume/,
  });
  server.age();
  server.unavailable();
  fireEvent.change(first, { target: { value: "Recoverable private edit" } });
  await screen.findByRole(
    "button",
    { name: "Reîncearcă conexiunea" },
    { timeout: 3000 },
  );
  expect(screen.getByDisplayValue("Recoverable private edit")).toBe(first);
  expect(server.writes).toEqual([]);
  expect(server.refreshes).toBe(1);
});

it.each(["questions", "rewrite"] as const)(
  "retains a recoverable error without replaying an uncancellable %s operation",
  async (action) => {
    const server = await backend();
    let transport!: AuthTransport,
      requests = 0;
    const fetcher: typeof fetch = (input, init) => {
      if (String(input) !== `/v1/intelligence/${action}`)
        return server.fetcher(input, init);
      requests++;
      return Promise.resolve(
        Response.json(
          { error: { code: "SESSION_REFRESH_REQUIRED" } },
          { status: 409 },
        ),
      );
    };
    render(
      <AuthShell fetcher={fetcher}>
        {(_, next) => {
          transport = next;
          return <p>Retained reviewed facts</p>;
        }}
      </AuthShell>,
    );
    await screen.findByText("Retained reviewed facts");
    let response!: Response;
    await act(async () => {
      response = await transport(`/v1/intelligence/${action}`, {
        method: "POST",
        body: JSON.stringify({ operationId: crypto.randomUUID(), revision: 7 }),
      });
    });
    expect(response.status).toBe(409);
    expect(requests).toBe(1);
    expect(screen.getByText("Retained reviewed facts")).toBeTruthy();
    expect(screen.getByText(/Reverifică sesiunea/)).toBeTruthy();
  },
);
