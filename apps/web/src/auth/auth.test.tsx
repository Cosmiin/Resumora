import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RouterProvider, createMemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const auth = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock("../lib/supabase.ts", () => ({ supabase: { auth } }));
vi.mock("../cv/cv-api.ts", () => ({ getCv: () => new Promise(() => {}) })); // editor stays loading

import { AuthProvider } from "./AuthProvider.tsx";
import { routes } from "../router.tsx";
import { setUnsavedChanges } from "../cv/unsaved.ts";

function renderAt(path: string) {
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
});

describe("authentication", () => {
  it("redirects to login when signed out", async () => {
    const router = renderAt("/cv");
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/login");
  });

  it("shows readable error on wrong password", async () => {
    auth.signInWithPassword.mockResolvedValue({
      data: { session: null },
      error: { message: "Invalid login credentials" },
    });
    renderAt("/login");
    await userEvent.type(await screen.findByLabelText("Email"), "ana@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "wrong-password");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Wrong email or password.");
  });

  it("sign-up without email confirmation does not ask to check email", async () => {
    auth.signUp.mockResolvedValue({ data: { session: { user: { email: "ana@example.com" } } }, error: null });
    renderAt("/login");
    await userEvent.click(await screen.findByRole("button", { name: /create one/i }));
    await userEvent.type(screen.getByLabelText("Email"), "ana@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "a-good-password");
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(auth.signUp).toHaveBeenCalled();
    expect(screen.queryByText(/check your email/i)).not.toBeInTheDocument();
  });

  it("sign-up that needs confirmation says where the link went", async () => {
    auth.signUp.mockResolvedValue({ data: { session: null, user: { email: "ana@example.com" } }, error: null });
    renderAt("/login");
    await userEvent.click(await screen.findByRole("button", { name: /create one/i }));
    await userEvent.type(screen.getByLabelText("Email"), "ana@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "a-good-password");
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByText(/we sent a confirmation link to ana@example.com/i)).toBeInTheDocument();
  });

  it("signed-in user sees the app", async () => {
    auth.getSession.mockResolvedValue({
      data: { session: { access_token: "t", user: { id: "u1", email: "ana@example.com" } } },
      error: null,
    });
    renderAt("/");
    expect(await screen.findByRole("button", { name: "Account: ana@example.com" })).toBeInTheDocument();
  });
});

const signedIn = { data: { session: { access_token: "t", user: { id: "u1", email: "ana@example.com" } } }, error: null };

async function openAccountMenu() {
  await userEvent.click(await screen.findByRole("button", { name: "Account: ana@example.com" }));
}

describe("top bar", () => {
  it("shows My CV and the account menu signs out", async () => {
    auth.getSession.mockResolvedValue(signedIn);
    auth.signOut.mockResolvedValue({ error: null });
    renderAt("/cv");
    expect(await screen.findByRole("link", { name: "My CV" })).toHaveAttribute("aria-current", "page");
    await openAccountMenu();
    expect(screen.getByText("ana@example.com")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(auth.signOut).toHaveBeenCalledTimes(1);
  });
});

describe("sign out", () => {
  it("asks first when there are unsaved changes", async () => {
    auth.getSession.mockResolvedValue(signedIn);
    auth.signOut.mockResolvedValue({ error: null });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderAt("/cv");
    setUnsavedChanges(true);

    await openAccountMenu();
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(confirm).toHaveBeenCalledWith("You have unsaved changes. Sign out anyway?");
    expect(auth.signOut).not.toHaveBeenCalled();

    confirm.mockReturnValue(true);
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(auth.signOut).toHaveBeenCalledTimes(1);
    confirm.mockRestore();
  });

  it("signs out straight away when everything is saved", async () => {
    auth.getSession.mockResolvedValue(signedIn);
    auth.signOut.mockResolvedValue({ error: null });
    const confirm = vi.spyOn(window, "confirm");
    renderAt("/cv");
    await openAccountMenu();
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(confirm).not.toHaveBeenCalled();
    expect(auth.signOut).toHaveBeenCalledTimes(1);
    confirm.mockRestore();
  });
});
