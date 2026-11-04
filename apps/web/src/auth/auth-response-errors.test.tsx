import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthShell } from "./AuthShell";

const anonymous = { user: null, csrfToken: "browser-csrf", recovery: false };
const signed = {
  ...anonymous,
  user: { id: "account", email: "test@example.invalid" },
};
const unavailable =
  "Autentificarea nu este disponibilă momentan. Reîncearcă conexiunea.";
const invalid =
  "Răspunsul serviciului de autentificare nu a putut fi verificat. Reîncearcă conexiunea.";
afterEach(() => window.history.replaceState(null, "", "/"));
function mount(fetcher: typeof fetch) {
  render(
    <AuthShell fetcher={fetcher}>{() => <p>Private editor</p>}</AuthShell>,
  );
}
function fill(mode: string) {
  if (mode !== "password")
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: signed.user.email },
    });
  if (mode !== "recovery")
    fireEvent.change(
      screen.getByLabelText(mode === "password" ? "Parolă nouă" : "Parolă"),
      { target: { value: "keep-this-password" } },
    );
}
function submit() {
  fireEvent.submit(document.querySelector("form")!);
}

describe("auth response failures", () => {
  it.each([
    ["empty proxy error", () => new Response("", { status: 502 }), unavailable],
    [
      "HTML proxy error",
      () => new Response("<html>Bad gateway</html>", { status: 502 }),
      unavailable,
    ],
    [
      "network failure",
      () => {
        throw new TypeError("Failed to fetch internal host");
      },
      "Nu am putut contacta serviciul de autentificare. Verifică conexiunea și reîncearcă.",
    ],
    ["empty success", () => new Response(""), invalid],
    ["HTML success", () => new Response("<html>app</html>"), invalid],
    ["malformed JSON", () => new Response('{"user":'), invalid],
    [
      "invalid session",
      () => Response.json({ user: signed.user, csrfToken: "" }),
      invalid,
    ],
    [
      "invalid anonymous recovery",
      () => Response.json({ ...anonymous, recovery: true }),
      invalid,
    ],
  ] as const)(
    "handles %s and recovers with explicit retry",
    async (_, response, message) => {
      let healthy = false;
      mount(
        vi.fn(async () => (healthy ? Response.json(anonymous) : response())),
      );
      expect((await screen.findByRole("alert")).textContent).toBe(message);
      expect(screen.queryByText("Private editor")).toBeNull();
      expect(
        screen
          .getByRole("button", { name: "Intră în cont" })
          .hasAttribute("disabled"),
      ).toBe(true);
      fill("login");
      healthy = true;
      fireEvent.click(
        screen.getByRole("button", { name: "Reîncearcă conexiunea" }),
      );
      await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
      expect((screen.getByLabelText("Email") as HTMLInputElement).value).toBe(
        signed.user.email,
      );
      expect((screen.getByLabelText("Parolă") as HTMLInputElement).value).toBe(
        "keep-this-password",
      );
      expect(
        screen
          .getByRole("button", { name: "Intră în cont" })
          .hasAttribute("disabled"),
      ).toBe(false);
    },
  );

  it.each(["login", "signup", "recovery", "password"])(
    "preserves %s inputs after an empty 502 without replaying the POST",
    async (mode) => {
      if (mode === "password")
        window.history.replaceState(null, "", "/reset-password");
      const fetcher = vi.fn(async (input: RequestInfo | URL) =>
        String(input).endsWith("/session")
          ? Response.json(
              mode === "password" ? { ...signed, recovery: true } : anonymous,
            )
          : new Response("", { status: 502 }),
      );
      mount(fetcher);
      await screen.findByRole("heading");
      if (mode === "signup")
        fireEvent.click(screen.getByRole("button", { name: "Creează cont" }));
      if (mode === "recovery")
        fireEvent.click(
          screen.getByRole("button", { name: "Ai uitat parola?" }),
        );
      fill(mode);
      submit();
      expect((await screen.findByRole("alert")).textContent).toBe(unavailable);
      await waitFor(() =>
        expect(
          document.querySelector("form button")?.hasAttribute("disabled"),
        ).toBe(false),
      );
      if (mode !== "password")
        expect((screen.getByLabelText("Email") as HTMLInputElement).value).toBe(
          signed.user.email,
        );
      if (mode !== "recovery")
        expect(
          (
            screen.getByLabelText(
              mode === "password" ? "Parolă nouă" : "Parolă",
            ) as HTMLInputElement
          ).value,
        ).toBe("keep-this-password");
      expect(
        fetcher.mock.calls.filter(
          ([path]) => !String(path).endsWith("/session"),
        ),
      ).toHaveLength(1);
      expect(screen.queryByRole("status")).toBeNull();
    },
  );

  it.each(["login", "signup", "recovery", "password"])(
    "does not accept malformed %s success",
    async (mode) => {
      if (mode === "password")
        window.history.replaceState(null, "", "/reset-password");
      mount(
        vi.fn(async (input: RequestInfo | URL) =>
          String(input).endsWith("/session")
            ? Response.json(
                mode === "password" ? { ...signed, recovery: true } : anonymous,
              )
            : Response.json({}),
        ),
      );
      await screen.findByRole("heading");
      if (mode === "signup")
        fireEvent.click(screen.getByRole("button", { name: "Creează cont" }));
      if (mode === "recovery")
        fireEvent.click(
          screen.getByRole("button", { name: "Ai uitat parola?" }),
        );
      fill(mode);
      submit();
      expect((await screen.findByRole("alert")).textContent).toBe(invalid);
      expect(screen.queryByRole("status")).toBeNull();
      expect(screen.queryByText("Private editor")).toBeNull();
    },
  );

  it.each([
    [401, "INVALID_CREDENTIALS", "Emailul sau parola sunt incorecte."],
    [
      403,
      "EMAIL_NOT_CONFIRMED",
      "Confirmă adresa de email folosind linkul primit, apoi autentifică-te.",
    ],
    [
      429,
      "RATE_LIMITED",
      "Prea multe încercări. Așteaptă puțin înainte să reîncerci.",
    ],
    [503, "AUTH_UNCONFIGURED", unavailable],
  ])(
    "maps %s %s without displaying server diagnostics",
    async (status, code, message) => {
      mount(
        vi.fn(async (input: RequestInfo | URL) =>
          String(input).endsWith("/session")
            ? Response.json(anonymous)
            : Response.json(
                {
                  error: { code, message: "Configure Worker AUTH_COOKIE_KEY." },
                },
                { status: Number(status) },
              ),
        ),
      );
      await screen.findByRole("heading");
      fill("login");
      submit();
      expect((await screen.findByRole("alert")).textContent).toBe(message);
    },
  );

  it("blocks stale anonymous context after a failed focus check until explicit retry", async () => {
    let healthy = true;
    const fetcher = vi.fn(async (input: RequestInfo | URL) =>
      String(input).endsWith("/session")
        ? healthy
          ? Response.json(anonymous)
          : new Response("", { status: 502 })
        : Response.json({ user: signed.user }),
    );
    mount(fetcher);
    await screen.findByRole("heading");
    fill("login");
    healthy = false;
    fireEvent.focus(window);
    await screen.findByRole("alert");
    expect(
      screen
        .getByRole("button", { name: "Intră în cont" })
        .hasAttribute("disabled"),
    ).toBe(true);
    submit();
    await screen.findByRole("alert");
    await waitFor(() =>
      expect(
        fetcher.mock.calls.filter(([path]) => String(path).endsWith("/login")),
      ).toHaveLength(0),
    );
    healthy = true;
    fireEvent.click(
      screen.getByRole("button", { name: "Reîncearcă conexiunea" }),
    );
    await waitFor(() =>
      expect(
        screen
          .getByRole("button", { name: "Intră în cont" })
          .hasAttribute("disabled"),
      ).toBe(false),
    );
  });
});

it("keeps login details if the follow-up session check fails and recovers without resending login", async () => {
  let loggedIn = false;
  let healthy = true;
  const fetcher = vi.fn(async (input: RequestInfo | URL) => {
    if (String(input).endsWith("/session")) {
      if (!healthy) return new Response("", { status: 502 });
      return Response.json(loggedIn ? signed : anonymous);
    }
    loggedIn = true;
    healthy = false;
    return Response.json({ user: signed.user });
  });
  mount(fetcher);
  await screen.findByRole("heading");
  fill("login");
  submit();
  expect((await screen.findByRole("alert")).textContent).toBe(unavailable);
  expect(screen.queryByText("Private editor")).toBeNull();
  expect((screen.getByLabelText("Parolă") as HTMLInputElement).value).toBe(
    "keep-this-password",
  );
  healthy = true;
  fireEvent.click(
    screen.getByRole("button", { name: "Reîncearcă conexiunea" }),
  );
  await screen.findByText("Private editor");
  expect(
    fetcher.mock.calls.filter(([path]) => String(path).endsWith("/login")),
  ).toHaveLength(1);
});

it.each([
  [
    "HTML",
    () => new Response("<html>Unavailable</html>", { status: 503 }),
    unavailable,
  ],
  ["broken JSON", () => new Response('{"user":'), invalid],
  [
    "network",
    () => {
      throw new TypeError("Failed to fetch internal host");
    },
    "Nu am putut contacta serviciul de autentificare. Verifică conexiunea și reîncearcă.",
  ],
] as const)(
  "keeps login usable after a %s POST failure",
  async (_, failure, message) => {
    let healthy = false;
    let loggedIn = false;
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith("/session"))
        return Response.json(loggedIn ? signed : anonymous);
      if (!healthy) return failure();
      loggedIn = true;
      return Response.json({ user: signed.user });
    });
    mount(fetcher);
    await screen.findByRole("heading");
    fill("login");
    submit();
    expect((await screen.findByRole("alert")).textContent).toBe(message);
    expect((screen.getByLabelText("Parolă") as HTMLInputElement).value).toBe(
      "keep-this-password",
    );
    expect(
      fetcher.mock.calls.filter(([path]) => String(path).endsWith("/login")),
    ).toHaveLength(1);
    healthy = true;
    submit();
    await screen.findByText("Private editor");
  },
);

it("does not expose a network exception when logout cannot be confirmed", async () => {
  const fetcher = vi.fn(async (input: RequestInfo | URL) => {
    if (String(input).endsWith("/session")) return Response.json(signed);
    throw new TypeError("Failed to fetch internal host");
  });
  mount(fetcher);
  await screen.findByText("Private editor");
  fireEvent.click(screen.getByRole("button", { name: "Deconectare" }));
  expect((await screen.findByRole("alert")).textContent).toBe(
    "Deconectarea nu este confirmată. Reîncearcă.",
  );
  expect(screen.queryByText("Private editor")).toBeNull();
});

it("explains a weak signup password and retains the entered email and password", async () => {
  mount(
    vi.fn(async (input: RequestInfo | URL) =>
      String(input).endsWith("/session")
        ? Response.json(anonymous)
        : Response.json(
            {
              error: {
                code: "PASSWORD_TOO_WEAK",
                message: "Provider password policy diagnostic",
              },
            },
            { status: 422 },
          ),
    ),
  );
  await screen.findByRole("heading");
  fireEvent.click(screen.getByRole("button", { name: "Creează cont" }));
  fill("signup");
  submit();
  expect((await screen.findByRole("alert")).textContent).toBe(
    "Parola este prea slabă. Alege o parolă mai lungă, cu litere, cifre și simboluri.",
  );
  expect((screen.getByLabelText("Email") as HTMLInputElement).value).toBe(
    signed.user.email,
  );
  expect((screen.getByLabelText("Parolă") as HTMLInputElement).value).toBe(
    "keep-this-password",
  );
  expect(screen.queryByRole("status")).toBeNull();
});
