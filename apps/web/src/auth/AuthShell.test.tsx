import { openProfileDetails, openProfilePresentation } from "../test-profile";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AuthShell, type AuthTransport } from "./AuthShell";
import { ConnectedApp } from "./ConnectedApp";
import { blankDraft, newRole } from "../base/model";
import { AiSuggestions } from "../components/AiSuggestions";
import { LanguageContext } from "../components/ui";
const anonymous = { user: null, csrfToken: "synthetic-csrf", recovery: false };
const signed = {
  ...anonymous,
  user: { id: "synthetic-id", email: "test@example.invalid" },
};
function fake() {
  let status = anonymous as typeof anonymous | typeof signed;
  const fetcher = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path.endsWith("/session")) return Response.json(status);
      if (path.endsWith("/login")) {
        status = signed;
        return Response.json({ user: signed.user });
      }
      if (path.endsWith("/logout") || path.endsWith("/password")) {
        status = anonymous;
        return Response.json({ message: "Done" });
      }
      return Response.json({ message: "Check email" });
    },
  );
  return {
    fetcher,
    setStatus: (next: typeof status) => {
      status = next;
    },
  };
}
describe("AuthShell", () => {
  it("submits signup/login/recovery without exposing tokens and clears account UI immediately on logout", async () => {
    const p = fake();
    render(
      <AuthShell fetcher={p.fetcher}>
        {(account) => <p>Private editor {account.email}</p>}
      </AuthShell>,
    );
    await screen.findByRole("heading", { name: "Autentificare" });
    fireEvent.click(screen.getByRole("button", { name: "Creează cont" }));
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "test@example.invalid" },
    });
    fireEvent.change(screen.getByLabelText("Parolă"), {
      target: { value: "synthetic-password" },
    });
    fireEvent.click(
      screen
        .getAllByRole("button", { name: "Creează cont" })
        .find((button) => button.getAttribute("type") === "submit")!,
    );
    await screen.findByRole("status");
    expect(
      p.fetcher.mock.calls.find(([path]) => path === "/v1/auth/signup")?.[1],
    ).toMatchObject({
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
    });
    fireEvent.click(screen.getByRole("button", { name: "Ai uitat parola?" }));
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "test@example.invalid" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Trimite link" }));
    await waitFor(() =>
      expect(
        p.fetcher.mock.calls.some(([path]) => path === "/v1/auth/recovery"),
      ).toBe(true),
    );
    await screen.findByRole("status");
    fireEvent.click(screen.getByRole("button", { name: "Autentificare" }));
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "test@example.invalid" },
    });
    fireEvent.change(screen.getByLabelText("Parolă"), {
      target: { value: "synthetic-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Intră în cont" }));
    await screen.findByText("Private editor test@example.invalid");
    const login = p.fetcher.mock.calls.find(
      ([path]) => path === "/v1/auth/login",
    );
    expect(new Headers(login?.[1]?.headers).get("x-csrf-token")).toBe(
      "synthetic-csrf",
    );
    fireEvent.click(screen.getByRole("button", { name: "Deconectare" }));
    expect(
      screen.queryByText("Private editor test@example.invalid"),
    ).toBeNull();
    await screen.findByRole("heading", { name: "Autentificare" });
  });
  it("locks direct reset visits; only verified recovery context allows completion and returns to login", async () => {
    window.history.replaceState(null, "", "/reset-password");
    const p = fake();
    const rendered = render(
      <AuthShell fetcher={p.fetcher}>{() => <p>Private editor</p>}</AuthShell>,
    );
    await screen.findByText(
      "Cere un link de resetare și deschide-l în acest browser.",
    );
    expect(
      screen.queryByRole("button", { name: "Salvează parola" }),
    ).toBeNull();
    rendered.unmount();
    const recovery = vi.fn(async (input: RequestInfo | URL) =>
      String(input).endsWith("/session")
        ? Response.json({ ...signed, recovery: true })
        : Response.json({ message: "Done" }),
    );
    render(
      <AuthShell fetcher={recovery}>{() => <p>Private editor</p>}</AuthShell>,
    );
    await screen.findByLabelText("Parolă nouă");
    expect(screen.queryByText("Private editor")).toBeNull();
    fireEvent.change(screen.getByLabelText("Parolă nouă"), {
      target: { value: "new-synthetic-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvează parola" }));
    await screen.findByText("Parolă schimbată. Autentifică-te cu parola nouă.");
    expect(
      recovery.mock.calls.some(([path]) => path === "/v1/auth/password"),
    ).toBe(true);
    window.history.replaceState(null, "", "/");
  });
  it("displays a friendly unavailable message without configuration diagnostics or opening the editor", async () => {
    const fetcher = vi.fn(async () =>
      Response.json(
        { error: { message: "Configure Worker AUTH_COOKIE_KEY." } },
        { status: 503 },
      ),
    );
    render(
      <AuthShell fetcher={fetcher}>{() => <p>Private editor</p>}</AuthShell>,
    );
    await screen.findByRole("alert");
    expect(screen.getByRole("alert").textContent).toContain(
      "Autentificarea nu este disponibilă momentan.",
    );
    expect(screen.queryByText("Private editor")).toBeNull();
    expect(
      screen
        .getByRole("button", { name: "Intră în cont" })
        .hasAttribute("disabled"),
    ).toBe(true);
  });
});

it("ignores a status response started before logout, keeping the private editor unmounted", async () => {
  let count = 0;
  let resolveOld: (response: Response) => void = () => {};
  const fetcher = vi.fn(async (input: RequestInfo | URL) => {
    if (!String(input).endsWith("/session"))
      return Response.json({ message: "Done" });
    count++;
    if (count === 1) return Response.json(signed);
    if (count === 2)
      return new Promise<Response>((resolve) => {
        resolveOld = resolve;
      });
    return Response.json(anonymous);
  });
  render(
    <AuthShell fetcher={fetcher}>{() => <p>Private editor</p>}</AuthShell>,
  );
  await screen.findByText("Private editor");
  fireEvent.focus(window);
  await waitFor(() => expect(count).toBe(2));
  fireEvent.click(screen.getByRole("button", { name: "Deconectare" }));
  await screen.findByRole("heading", { name: "Autentificare" });
  await act(async () => {
    resolveOld(Response.json(signed));
  });
  await waitFor(() =>
    expect(
      screen
        .getByRole("button", { name: "Intră în cont" })
        .hasAttribute("disabled"),
    ).toBe(false),
  );
  expect(screen.queryByText("Private editor")).toBeNull();
});

it.each(["changed", "same"])(
  "fences retired account transports with %s CSRF after a queued replacement session",
  async (token) => {
    let current = { ...signed, csrfToken: "account-a-csrf" };
    let resolveOld: (response: Response) => void = () => {};
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === "/v1/base-cv")
        return new Promise<Response>((resolve) => {
          resolveOld = resolve;
        });
      return Response.json(current);
    });
    let accountTransport:
      ((path: string, init?: RequestInit) => Promise<Response>) | undefined;
    render(
      <AuthShell fetcher={fetcher}>
        {(account, transport) => {
          accountTransport = transport;
          return <p>Private {account.email}</p>;
        }}
      </AuthShell>,
    );
    await screen.findByText("Private test@example.invalid");
    const retired = accountTransport!;
    const pending = retired("/v1/base-cv");
    await waitFor(() =>
      expect(fetcher.mock.calls.some(([path]) => path === "/v1/base-cv")).toBe(
        true,
      ),
    );
    current = {
      ...signed,
      csrfToken: token === "same" ? "account-a-csrf" : "account-b-csrf",
      user: { id: "account-b", email: "b@example.invalid" },
    };
    fireEvent.focus(window);
    await act(async () => {
      resolveOld(
        Response.json({ error: { code: "unauthorized" } }, { status: 401 }),
      );
      await expect(pending).rejects.toThrow(
        /SESSION_CHANGED|SESSION_UNVERIFIED/,
      );
    });
    await screen.findByText("Private b@example.invalid");
    const count = fetcher.mock.calls.length;
    await expect(
      retired("/v1/base-cv/save", { method: "POST", body: "{}" }),
    ).rejects.toThrow("SESSION_CHANGED");
    expect(fetcher.mock.calls.length).toBe(count);
    expect(screen.getByText("Private b@example.invalid")).toBeTruthy();
  },
);

it.each(["network", "provider"])(
  "preserves an unsaved real CV through a %s status failure and fences all CV actions",
  async (failure) => {
    window.location.hash = "#base";
    let unavailable = false;
    let session: typeof anonymous | typeof signed = signed;
    const draft = blankDraft();
    draft.name.value = "Ana Alpha";
    draft.nameParts = { first: "Ana", last: "Alpha" };
    const snapshot = {
      id: crypto.randomUUID(),
      revision: 1,
      parentId: null,
      createdAt: new Date().toISOString(),
      reason: "save",
      draft,
    };
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith("/session")) {
        if (unavailable) {
          if (failure === "network") throw Error("Offline");
          return Response.json(
            { error: { code: "AUTH_UNAVAILABLE", message: "Try again" } },
            { status: 503 },
          );
        }
        return Response.json(session);
      }
      if (String(input) === "/v1/document-languages")
        return Response.json({ source: null, versions: [] });
      if (String(input).startsWith("/v1/workspace-drafts"))
        return Response.json(null);
      return Response.json(snapshot);
    });
    let cvTransport: AuthTransport = async () => Response.json(null);
    render(
      <AuthShell fetcher={fetcher}>
        {(account, transport) => {
          cvTransport = transport;
          return <ConnectedApp account={account} transport={transport} />;
        }}
      </AuthShell>,
    );
    await openProfileDetails();
    const name = await screen.findByRole("textbox", { name: /Prenume/ });
    await waitFor(() => expect((name as HTMLInputElement).value).toBe("Ana"));
    fireEvent.change(name, { target: { value: "Unsaved" } });
    const originalTransport = cvTransport;
    unavailable = true;
    fireEvent.focus(window);
    await screen.findByRole("alert");
    expect(screen.getByRole("textbox", { name: /Prenume/ })).toBe(name);
    expect((name as HTMLInputElement).value).toBe("Unsaved");
    const unload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);
    const calls = fetcher.mock.calls.length;
    for (const path of ["", "/history", "/save", "/restore"]) {
      await expect(
        cvTransport(`/v1/base-cv${path}`, {
          method: path === "/save" || path === "/restore" ? "POST" : "GET",
        }),
      ).rejects.toThrow("SESSION_UNVERIFIED");
    }
    expect(fetcher.mock.calls.length).toBe(calls);
    unavailable = false;
    fireEvent.click(
      screen.getByRole("button", { name: "Reîncearcă conexiunea" }),
    );
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(cvTransport).toBe(originalTransport);
    expect(screen.getByRole("textbox", { name: /Prenume/ })).toBe(name);
    expect((name as HTMLInputElement).value).toBe("Unsaved");
    await expect(
      cvTransport("/v1/base-cv/save", { method: "POST", body: "{}" }),
    ).resolves.toBeInstanceOf(Response);
    session = anonymous;
    fireEvent.focus(window);
    await screen.findByRole("heading", { name: "Autentificare" });
    expect(screen.queryByDisplayValue("Unsaved")).toBeNull();
    await expect(
      originalTransport("/v1/base-cv/save", { method: "POST", body: "{}" }),
    ).rejects.toThrow("SESSION_CHANGED");
  },
);

it("fences CV requests after a protected verification failure and resumes the same transport on status recovery", async () => {
  let cvTransport: AuthTransport = async () => Response.json(null);
  const fetcher = vi.fn(async (input: RequestInfo | URL) =>
    String(input).endsWith("/session")
      ? Response.json(signed)
      : Response.json({ error: { code: "AUTH_UNAVAILABLE" } }, { status: 503 }),
  );
  render(
    <AuthShell fetcher={fetcher}>
      {(_, transport) => {
        cvTransport = transport;
        return <input aria-label="Draft" defaultValue="Unsaved" />;
      }}
    </AuthShell>,
  );
  const input = await screen.findByLabelText("Draft");
  await act(async () => {
    await expect(cvTransport("/v1/base-cv")).rejects.toThrow(
      "SESSION_UNVERIFIED",
    );
  });
  const calls = fetcher.mock.calls.length;
  await expect(
    cvTransport("/v1/base-cv/save", { method: "POST" }),
  ).rejects.toThrow("SESSION_UNVERIFIED");
  expect(fetcher.mock.calls.length).toBe(calls);
  fireEvent.focus(window);
  await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  expect(screen.getByLabelText("Draft")).toBe(input);
  await expect(cvTransport("/v1/base-cv")).rejects.toThrow(
    "SESSION_UNVERIFIED",
  );
});

it.each(["cleared", "retained", "unavailable"])(
  "recovers logout retry CSRF with %s cookie context while keeping private UI closed",
  async (context) => {
    let session = { ...signed } as typeof anonymous | typeof signed;
    let attempts = 0,
      failedStatus = false;
    const fetcher = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input).endsWith("/session")) {
          if (failedStatus) {
            failedStatus = false;
            return Response.json(
              { error: { message: "Unavailable" } },
              { status: 503 },
            );
          }
          return Response.json(session);
        }
        expect(new Headers(init?.headers).get("x-csrf-token")).toBe(
          session.csrfToken,
        );
        attempts++;
        if (attempts === 1) {
          if (context !== "retained")
            session = { ...anonymous, csrfToken: "new-anonymous-csrf" };
          if (context === "unavailable") failedStatus = true;
          return Response.json(
            { error: { code: "LOGOUT_INCOMPLETE" } },
            { status: 503 },
          );
        }
        session = { ...anonymous, csrfToken: "final-anonymous-csrf" };
        return Response.json({ message: "Signed out" });
      },
    );
    render(
      <AuthShell fetcher={fetcher}>{() => <p>Private editor</p>}</AuthShell>,
    );
    await screen.findByText("Private editor");
    fireEvent.click(screen.getByRole("button", { name: "Deconectare" }));
    await screen.findByRole("alert");
    expect(screen.queryByText("Private editor")).toBeNull();
    fireEvent.focus(window);
    expect(screen.queryByText("Private editor")).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Reîncearcă conexiunea" }),
    );
    await waitFor(() => expect(attempts).toBe(2));
    await waitFor(() =>
      expect(
        screen
          .getByRole("button", { name: "Intră în cont" })
          .hasAttribute("disabled"),
      ).toBe(false),
    );
    expect(screen.queryByText("Private editor")).toBeNull();
  },
);

it.each([400, 401, 503, 0])(
  "refreshes cookie-cleared password error context (%s) before another auth action",
  async (statusCode) => {
    window.history.replaceState(null, "", "/reset-password");
    let context: typeof anonymous | typeof signed = {
      ...signed,
      recovery: true,
    };
    const fetcher = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input).endsWith("/session")) return Response.json(context);
        expect(new Headers(init?.headers).get("x-csrf-token")).toBe(
          context.csrfToken,
        );
        if (String(input).endsWith("/password")) {
          context = { ...anonymous, csrfToken: "recovered-csrf" };
          if (!statusCode) throw Error("Offline");
          return Response.json(
            { error: { message: "Password failed" } },
            { status: statusCode },
          );
        }
        return Response.json({ message: "Check email" });
      },
    );
    render(
      <AuthShell fetcher={fetcher}>{() => <p>Private editor</p>}</AuthShell>,
    );
    const password = await screen.findByLabelText("Parolă nouă");
    fireEvent.change(password, { target: { value: "new-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvează parola" }));
    await screen.findByRole("heading", { name: "Autentificare" });
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Ai uitat parola?" }));
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "test@example.invalid" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Trimite link" }));
    await screen.findByRole("status");
    expect(
      fetcher.mock.calls.some(([path]) => path === "/v1/auth/recovery"),
    ).toBe(true);
    expect(screen.queryByText("Private editor")).toBeNull();
    window.history.replaceState(null, "", "/");
  },
);

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

it.each(["stop", "target", "snapshot", "unmount"])(
  "keeps the authenticated transport usable after suggestion %s cancellation",
  async (cause) => {
    const user = userEvent.setup();
    const draft = blankDraft(),
      role = newRole(),
      other = newRole();
    draft.roles.push(role, other);
    let targetId = role.id,
      visible = true;
    let snapshot = { id: crypto.randomUUID(), revision: 1 };
    let cvTransport: AuthTransport = async () => Response.json(null);
    const fetcher = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input).endsWith("/session")) return Response.json(signed);
        if (String(input) === "/v1/enhancement") {
          return new Promise<Response>((_resolve, reject) => {
            init!.signal!.addEventListener(
              "abort",
              () => reject(new DOMException("Cancelled", "AbortError")),
              { once: true },
            );
          });
        }
        return Response.json({ saved: true });
      },
    );
    const tree = () => (
      <AuthShell fetcher={fetcher}>
        {(_, transport) => {
          cvTransport = transport;
          return (
            <LanguageContext value="en">
              <p>Private editor</p>
              {visible && (
                <AiSuggestions
                  draft={draft}
                  targetId={targetId}
                  snapshot={snapshot}
                  ready
                  transport={transport}
                  change={vi.fn()}
                />
              )}
            </LanguageContext>
          );
        }}
      </AuthShell>
    );
    const view = render(tree());
    await user.click(
      await screen.findByRole("button", { name: "Suggest wording" }),
    );
    await waitFor(() =>
      expect(
        fetcher.mock.calls.some(([path]) => path === "/v1/enhancement"),
      ).toBe(true),
    );
    const stopButton = await screen.findByRole("button", { name: "Stop" });
    const originalTransport = cvTransport;
    if (cause === "stop") await user.click(stopButton);
    else {
      if (cause === "target") targetId = other.id;
      if (cause === "snapshot")
        snapshot = { id: crypto.randomUUID(), revision: 2 };
      if (cause === "unmount") visible = false;
      view.rerender(tree());
    }
    await act(async () => {
      for (const path of ["/v1/base-cv/save", "/v1/jobs"]) {
        const response = await cvTransport(path, {
          method: "POST",
          body: "{}",
        });
        expect(response.ok).toBe(true);
      }
    });
    expect(cvTransport).toBe(originalTransport);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText("Private editor")).toBeTruthy();
    expect(
      fetcher.mock.calls.filter(([path]) => String(path).endsWith("/session")),
    ).toHaveLength(1);
  },
);

it.each(["network", "unexpected-abort", "cancelled-network", "unauthorized"])(
  "still fences private requests after %s failure",
  async (failure) => {
    let cvTransport: AuthTransport = async () => Response.json(null);
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith("/session")) return Response.json(signed);
      if (failure === "unauthorized") return Response.json({}, { status: 401 });
      if (failure === "unexpected-abort")
        throw new DOMException("Unexpected", "AbortError");
      throw new TypeError("Connection failed");
    });
    render(
      <AuthShell fetcher={fetcher}>
        {(_, transport) => {
          cvTransport = transport;
          return <p>Private editor</p>;
        }}
      </AuthShell>,
    );
    await screen.findByText("Private editor");
    const signal = new AbortController();
    if (failure === "cancelled-network") signal.abort();
    const retired = cvTransport;
    await act(async () => {
      const result = await Promise.allSettled([
        cvTransport("/v1/enhancement", {
          method: "POST",
          signal: signal.signal,
        }),
      ]);
      expect(result[0].status).toBe("rejected");
    });
    const calls = fetcher.mock.calls.length;
    await expect(retired("/v1/jobs")).rejects.toThrow(
      failure === "unauthorized" ? "SESSION_CHANGED" : "SESSION_UNVERIFIED",
    );
    expect(fetcher.mock.calls.length).toBe(calls);
    if (failure === "unauthorized")
      expect(screen.queryByText("Private editor")).toBeNull();
  },
);

it("finishes anonymous cookie responses and CSRF updates before dispatching login", async () => {
  const delayed = deferred();
  const events: string[] = [];
  let checks = 0;
  let cookie: string | null = null,
    cookieCsrf = anonymous.csrfToken;
  const fetcher = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith("/session")) {
        checks++;
        if (checks === 2) {
          events.push("check started");
          await delayed.promise;
          cookie = null;
          cookieCsrf = "new-browser-csrf";
          events.push("anonymous cookies applied");
        }
        return Response.json(
          cookie
            ? { ...signed, csrfToken: cookieCsrf }
            : { ...anonymous, csrfToken: cookieCsrf },
        );
      }
      expect(String(input)).toBe("/v1/auth/login");
      events.push("login sent");
      expect(new Headers(init?.headers).get("x-csrf-token")).toBe(cookieCsrf);
      cookie = "new-session";
      cookieCsrf = "new-session-csrf";
      return Response.json({ user: signed.user });
    },
  );
  render(
    <AuthShell fetcher={fetcher}>
      {() => <input aria-label="Private draft" defaultValue="New draft" />}
    </AuthShell>,
  );
  await screen.findByRole("heading", { name: "Autentificare" });
  fireEvent.change(screen.getByLabelText("Email"), {
    target: { value: signed.user.email },
  });
  fireEvent.change(screen.getByLabelText("Parolă"), {
    target: { value: "synthetic-password" },
  });
  fireEvent.focus(window);
  await waitFor(() => expect(events).toEqual(["check started"]));
  fireEvent.click(screen.getByRole("button", { name: "Intră în cont" }));
  await act(async () => {});
  expect(events).toEqual(["check started"]);
  delayed.resolve();
  const input = await screen.findByLabelText("Private draft");
  fireEvent.change(input, { target: { value: "Unsaved CV" } });
  expect(events).toEqual([
    "check started",
    "anonymous cookies applied",
    "login sent",
  ]);
  expect(cookie).toBe("new-session");
  fireEvent.focus(window);
  await act(async () => {});
  expect(screen.getByLabelText("Private draft")).toBe(input);
  expect((input as HTMLInputElement).value).toBe("Unsaved CV");
});

it.each(["session", "anonymous-session", "cv", "intelligence"])(
  "orders outstanding %s cookies before logout and discards queued retired CV work",
  async (source) => {
    const delayed = deferred();
    const events: string[] = [];
    let checks = 0;
    let cookie: string | null = "old-session",
      cookieCsrf = signed.csrfToken;
    let account = signed.user;
    let cvTransport: AuthTransport = async () => Response.json(null);
    const fetcher = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = String(input);
        if (path.endsWith("/session")) checks++;
        if (
          (source !== "cv" &&
            source !== "intelligence" &&
            path.endsWith("/session") &&
            checks === 2) ||
          path === "/v1/base-cv" ||
          path === "/v1/intelligence/imports"
        ) {
          events.push("old request sent");
          await delayed.promise;
          cookie =
            source === "anonymous-session" ? null : "rotated-old-session";
          if (source === "anonymous-session") cookieCsrf = "new-browser-csrf";
          events.push("old cookies applied");
        }
        if (path.endsWith("/session"))
          return Response.json({
            ...anonymous,
            user: cookie ? account : null,
            csrfToken: cookieCsrf,
          });
        if (path.endsWith("/logout")) {
          events.push("logout sent");
          expect(cookie).toBe(
            source === "anonymous-session" ? null : "rotated-old-session",
          );
          expect(new Headers(init?.headers).get("x-csrf-token")).toBe(
            cookieCsrf,
          );
          cookie = null;
          cookieCsrf = "anonymous-after-logout";
        }
        if (path.endsWith("/login")) {
          events.push("login sent");
          expect(new Headers(init?.headers).get("x-csrf-token")).toBe(
            cookieCsrf,
          );
          cookie = "account-b-session";
          cookieCsrf = "account-b-csrf";
          account = { id: "account-b", email: "b@example.invalid" };
          return Response.json({ user: account });
        }
        return Response.json({});
      },
    );
    render(
      <AuthShell fetcher={fetcher}>
        {(account, transport) => {
          cvTransport = transport;
          return <p>Private {account.email}</p>;
        }}
      </AuthShell>,
    );
    await screen.findByText("Private test@example.invalid");
    const retired = cvTransport;
    let oldRequest: Promise<Response> | undefined;
    if (source !== "cv" && source !== "intelligence") fireEvent.focus(window);
    else
      oldRequest = retired(
        source === "intelligence" ? "/v1/intelligence/imports" : "/v1/base-cv",
      );
    const oldOutcome = Promise.allSettled(oldRequest ? [oldRequest] : []);
    await waitFor(() => expect(events).toEqual(["old request sent"]));
    const queued = Promise.allSettled(
      ["/history", "/save", "/restore"].map((path) =>
        retired(`/v1/base-cv${path}`, {
          method: path === "/history" ? "GET" : "POST",
          body: path === "/history" ? undefined : "{}",
        }),
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Deconectare" }));
    expect(screen.queryByText("Private test@example.invalid")).toBeNull();
    const retiredControl = Promise.allSettled([
      retired("/v1/intelligence/imports/synthetic/cancel", {
        method: "POST",
        body: "{}",
      }),
    ]);
    await act(async () => {});
    expect(events).toEqual(["old request sent"]);
    delayed.resolve();
    if (oldRequest)
      expect((await oldOutcome)[0]).toMatchObject({
        status: "rejected",
        reason: { message: "SESSION_CHANGED" },
      });
    await waitFor(() =>
      expect(
        screen
          .getByRole("button", { name: "Intră în cont" })
          .hasAttribute("disabled"),
      ).toBe(false),
    );
    expect(events).toEqual([
      "old request sent",
      "old cookies applied",
      "logout sent",
    ]);
    expect(cookie).toBeNull();
    expect((await retiredControl)[0]).toMatchObject({
      status: "rejected",
      reason: { message: "SESSION_CHANGED" },
    });
    expect(
      (await queued).every(
        (result) =>
          result.status === "rejected" &&
          result.reason.message === "SESSION_CHANGED",
      ),
    ).toBe(true);
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "b@example.invalid" },
    });
    fireEvent.change(screen.getByLabelText("Parolă"), {
      target: { value: "synthetic-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Intră în cont" }));
    await screen.findByText("Private b@example.invalid");
    await expect(
      retired("/v1/base-cv/save", { method: "POST", body: "{}" }),
    ).rejects.toThrow("SESSION_CHANGED");
    expect(
      fetcher.mock.calls
        .filter(([path]) => String(path).startsWith("/v1/base-cv"))
        .map(([path]) => path),
    ).toEqual(source === "cv" ? ["/v1/base-cv"] : []);
    expect(cookie).toBe("account-b-session");
  },
);

it("finishes recovery cookie responses before password completion clears them", async () => {
  window.history.replaceState(null, "", "/reset-password");
  const delayed = deferred();
  const events: string[] = [];
  let checks = 0,
    cookie = "recovery-session";
  const fetcher = vi.fn(async (input: RequestInfo | URL) => {
    const path = String(input);
    if (path.endsWith("/session")) {
      checks++;
      if (checks === 2) {
        events.push("recovery check sent");
        await delayed.promise;
        cookie = "checked-recovery-session";
        events.push("recovery cookies applied");
      }
      return Response.json(cookie ? { ...signed, recovery: true } : anonymous);
    }
    expect(path).toBe("/v1/auth/password");
    expect(cookie).toBe("checked-recovery-session");
    events.push("password sent");
    cookie = "";
    return Response.json({ message: "Password changed" });
  });
  render(
    <AuthShell fetcher={fetcher}>{() => <p>Private editor</p>}</AuthShell>,
  );
  const password = await screen.findByLabelText("Parolă nouă");
  fireEvent.change(password, { target: { value: "new-password" } });
  fireEvent.focus(window);
  await waitFor(() => expect(events).toEqual(["recovery check sent"]));
  fireEvent.click(screen.getByRole("button", { name: "Salvează parola" }));
  await act(async () => {});
  expect(events).toEqual(["recovery check sent"]);
  delayed.resolve();
  await screen.findByText("Parolă schimbată. Autentifică-te cu parola nouă.");
  expect(cookie).toBe("");
  expect(events).toEqual([
    "recovery check sent",
    "recovery cookies applied",
    "password sent",
  ]);
  expect(screen.queryByText("Private editor")).toBeNull();
  window.history.replaceState(null, "", "/");
});
