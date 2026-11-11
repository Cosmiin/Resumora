import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RouterProvider, createMemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const auth = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  resend: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  updateUser: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock("../lib/supabase.ts", () => ({ supabase: { auth } }));
vi.mock("../cv/cv-api.ts", () => ({ getCv: () => new Promise(() => {}) })); // editor stays loading
// Check the auth redirect before JobsPage consumes the add parameter.
vi.mock("../jobs/JobsPage.tsx", () => ({ JobsPage: () => <h1>Jobs</h1> }));

import { AuthProvider } from "./AuthProvider.tsx";
import { routes } from "../router.tsx";
import { setLanguage } from "../i18n/language.ts";
import { setUnsavedChanges } from "../cv/unsaved.ts";

const signedIn = { data: { session: { access_token: "t", user: { id: "u1", email: "ana@example.com" } } }, error: null };

function renderAt(path: string | { pathname: string; state: unknown }) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>,
  );
  return router;
}

beforeEach(() => {
  vi.resetAllMocks();
  auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
  auth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
  setUnsavedChanges(false);
  setLanguage("en");
});

describe("homepage", () => {
  it("tells a signed-out visitor what the product does and how to start", async () => {
    renderAt("/");
    expect(await screen.findByRole("heading", { level: 1, name: "Answer a few questions. Get a CV that fits the job." })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Create an account" })[0]).toHaveAttribute("href", "/signup");
    expect(screen.getByRole("link", { name: "I already have an account" })).toHaveAttribute("href", "/login");
    expect(screen.getByRole("link", { name: "Download the extension" })).toHaveAttribute("href", "/downloads/resumora-extension.zip");
  });

  it("switches the whole page to Romanian from the header", async () => {
    renderAt("/");
    await userEvent.click(await screen.findByRole("button", { name: "Romanian" }));
    expect(screen.getByRole("heading", { level: 1, name: "Răspunzi la câteva întrebări. Primești un CV potrivit pentru job." })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Română" })).toHaveAttribute("aria-pressed", "true");
  });

  it("sends a signed-in visitor to their CV", async () => {
    auth.getSession.mockResolvedValue(signedIn);
    const router = renderAt("/");
    await waitFor(() => expect(router.state.location.pathname).toBe("/cv"));
  });

  it("sends an unknown address to the homepage", async () => {
    const router = renderAt("/nothing-here");
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
  });
});

describe("log in", () => {
  it("redirects to log in when a signed-out visitor opens the app", async () => {
    const router = renderAt("/cv");
    expect(await screen.findByRole("heading", { level: 2, name: "Log in" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/login");
  });

  it.each([
    {
      name: "the requested jobs page with its query string",
      entry: "/jobs?add=https%3A%2F%2Fexample.com%2Fjob%2F1",
      pathname: "/jobs",
      search: "?add=https%3A%2F%2Fexample.com%2Fjob%2F1",
    },
    { name: "My CV when log in is opened directly", entry: "/login", pathname: "/cv", search: "" },
    {
      name: "My CV when router state contains an external destination",
      entry: { pathname: "/login", state: { from: { pathname: "//evil.example" } } },
      pathname: "/cv",
      search: "",
    },
  ])("logging in returns to $name", async ({ entry, pathname, search }) => {
    auth.signInWithPassword.mockImplementation(async () => {
      auth.onAuthStateChange.mock.calls[0]?.[0]("SIGNED_IN", signedIn.data.session);
      return signedIn;
    });
    const router = renderAt(entry);
    await userEvent.type(await screen.findByLabelText("Email"), "ana@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "a-good-password");
    await userEvent.click(screen.getByRole("button", { name: "Log in" }));
    expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: "ana@example.com", password: "a-good-password" });
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(pathname);
      expect(router.state.location.search).toBe(search);
    });
  });

  it("says what to do when the email and password don't match", async () => {
    auth.signInWithPassword.mockResolvedValue({ data: { session: null }, error: { message: "Invalid login credentials" } });
    renderAt("/login");
    await userEvent.type(await screen.findByLabelText("Email"), "ana@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "wrong-password");
    await userEvent.click(screen.getByRole("button", { name: "Log in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That email and password don’t match. Check both, or reset your password.");
  });

  it("links to sign up and to the password reset", async () => {
    renderAt("/login");
    expect(await screen.findByRole("link", { name: "Forgot your password?" })).toHaveAttribute("href", "/forgot-password");
    expect(screen.getAllByRole("link", { name: "Create an account" }).at(-1)).toHaveAttribute("href", "/signup");
  });
});

describe("sign up", () => {
  async function fill() {
    await userEvent.type(await screen.findByLabelText("Name"), "Ana Popescu");
    await userEvent.type(screen.getByLabelText("Email"), "ana@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "a-good-password");
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));
  }

  it("sends the name with the new login and says where the confirmation link went", async () => {
    auth.signUp.mockResolvedValue({ data: { session: null, user: { email: "ana@example.com" } }, error: null });
    renderAt("/signup");
    await fill();
    expect(auth.signUp).toHaveBeenCalledWith({ email: "ana@example.com", password: "a-good-password", options: { data: { name: "Ana Popescu" } } });
    expect(await screen.findByRole("heading", { name: "Check your email" })).toBeInTheDocument();
    expect(screen.getByText("We sent a confirmation link to ana@example.com. Open it, then log in.")).toBeInTheDocument();
  });

  it("sends the confirmation link again on request", async () => {
    auth.signUp.mockResolvedValue({ data: { session: null, user: { email: "ana@example.com" } }, error: null });
    auth.resend.mockResolvedValue({ data: {}, error: null });
    renderAt("/signup");
    await fill();
    await userEvent.click(await screen.findByRole("button", { name: "Send the link again" }));
    expect(auth.resend).toHaveBeenCalledWith({ type: "signup", email: "ana@example.com" });
    expect(await screen.findByText("Sent again.")).toBeInTheDocument();
  });

  it("goes straight to the app when no confirmation is needed", async () => {
    auth.signUp.mockImplementation(async () => {
      auth.onAuthStateChange.mock.calls[0]?.[0]("SIGNED_IN", signedIn.data.session);
      return signedIn;
    });
    const router = renderAt("/signup");
    await fill();
    await waitFor(() => expect(router.state.location.pathname).toBe("/cv"));
    expect(screen.queryByText(/check your email/i)).not.toBeInTheDocument();
  });

  it("says so when the email already has an account", async () => {
    auth.signUp.mockResolvedValue({ data: { session: null, user: null }, error: { message: "User already registered" } });
    renderAt("/signup");
    await fill();
    expect(await screen.findByRole("alert")).toHaveTextContent("There is already an account with this email.");
  });
});

describe("password reset", () => {
  it("asks for the email and confirms without saying whether the account exists", async () => {
    auth.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
    renderAt("/forgot-password");
    await userEvent.type(await screen.findByLabelText("Email"), "ana@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Send me the link" }));
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith("ana@example.com", { redirectTo: `${window.location.origin}/reset-password` });
    expect(await screen.findByText("If there is an account for that address, the link is on its way.")).toBeInTheDocument();
  });

  it("saves the new password and opens the app", async () => {
    auth.getSession.mockResolvedValue(signedIn);
    auth.updateUser.mockResolvedValue({ data: {}, error: null });
    const router = renderAt("/reset-password");
    await userEvent.type(await screen.findByLabelText(/New password/), "a-new-password");
    await userEvent.click(screen.getByRole("button", { name: "Save and log in" }));
    expect(auth.updateUser).toHaveBeenCalledWith({ password: "a-new-password" });
    await waitFor(() => expect(router.state.location.pathname).toBe("/cv"));
  });

  it("offers a new link when the link no longer works", async () => {
    renderAt("/reset-password");
    expect(await screen.findByRole("alert")).toHaveTextContent("This link has expired or was already used. Ask for a new one.");
    expect(screen.getByRole("link", { name: "Send me a new link" })).toHaveAttribute("href", "/forgot-password");
  });
});

describe("top bar", () => {
  it("shows where you are and links to the account", async () => {
    auth.getSession.mockResolvedValue(signedIn);
    renderAt("/cv");
    expect(await screen.findByRole("link", { name: "My CV" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Jobs" })).toHaveAttribute("href", "/jobs");
    expect(screen.getByRole("link", { name: "Account" })).toHaveAttribute("href", "/account");
  });

  it("asks before leaving unsaved changes", async () => {
    auth.getSession.mockResolvedValue(signedIn);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const router = renderAt("/cv");
    await screen.findByRole("link", { name: "Jobs" });
    setUnsavedChanges(true);
    await userEvent.click(screen.getByRole("link", { name: "Jobs" }));
    expect(confirm).toHaveBeenCalledWith("You have unsaved changes. Leave this page anyway?");
    expect(router.state.location.pathname).toBe("/cv");
    confirm.mockRestore();
  });
});
