import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AuthShell } from "./AuthShell";
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

it("fences retired account transports and ignores their late401 after a replacement session", async () => {
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
    csrfToken: "account-b-csrf",
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
});
