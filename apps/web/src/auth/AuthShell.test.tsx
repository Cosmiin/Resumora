import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AuthShell, type AuthTransport } from "./AuthShell";
import { ConnectedApp } from "./ConnectedApp";
import { blankDraft } from "../base/model";
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
  it("displays actionable unavailable configuration and does not open the editor", async () => {
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
      "Configure Worker AUTH_COOKIE_KEY",
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
  fireEvent.click(screen.getByRole("button", { name: "Deconectare" }));
  await screen.findByRole("heading", { name: "Autentificare" });
  await act(async () => {
    resolveOld(Response.json(signed));
  });
  expect(screen.queryByText("Private editor")).toBeNull();
});

it.each(["changed", "same"])(
  "fences retired account transports and ignores their late401 with %s CSRF after a replacement session",
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
    current = {
      ...signed,
      csrfToken: token === "same" ? "account-a-csrf" : "account-b-csrf",
      user: { id: "account-b", email: "b@example.invalid" },
    };
    fireEvent.focus(window);
    await screen.findByText("Private b@example.invalid");
    const count = fetcher.mock.calls.length;
    await expect(
      retired("/v1/base-cv/save", { method: "POST", body: "{}" }),
    ).rejects.toThrow("SESSION_CHANGED");
    expect(fetcher.mock.calls.length).toBe(count);
    await act(async () => {
      resolveOld(
        Response.json({ error: { code: "unauthorized" } }, { status: 401 }),
      );
      await pending;
    });
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
    expect((await cvTransport("/v1/base-cv")).status).toBe(503);
  });
  const calls = fetcher.mock.calls.length;
  await expect(
    cvTransport("/v1/base-cv/save", { method: "POST" }),
  ).rejects.toThrow("SESSION_UNVERIFIED");
  expect(fetcher.mock.calls.length).toBe(calls);
  fireEvent.focus(window);
  await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  expect(screen.getByLabelText("Draft")).toBe(input);
  expect((await cvTransport("/v1/base-cv")).status).toBe(503);
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
