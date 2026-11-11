import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RouterProvider, createMemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Preferences } from "@resumora/shared";

const auth = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  signInWithPassword: vi.fn(),
  updateUser: vi.fn(),
  signOut: vi.fn(),
}));
const api = vi.hoisted(() => ({ getPreferences: vi.fn(), savePreferences: vi.fn(), exportAccount: vi.fn(), deleteAccount: vi.fn() }));
const jobs = vi.hoisted(() => ({ listJobs: vi.fn() }));
vi.mock("../lib/supabase.ts", () => ({ supabase: { auth } }));
vi.mock("./account-api.ts", () => ({ PREFERENCES_KEY: ["account", "preferences"], ...api }));
vi.mock("../jobs/jobs-api.ts", () => jobs);
vi.mock("../cv/CvPage.tsx", () => ({ CvPage: () => <h1>My CV</h1> }));
vi.mock("../jobs/JobsPage.tsx", () => ({ JobsPage: () => <h1>Jobs</h1> }));
vi.mock("../jobs/JobPage.tsx", () => ({ JobPage: () => <h1>Job</h1> }));
vi.mock("../tailor/TailorFlow.tsx", () => ({ TailorFlow: () => null }));
vi.mock("../tailor/TailoredCvPage.tsx", () => ({ TailoredCvPage: () => null }));

import { AuthProvider } from "../auth/AuthProvider.tsx";
import { routes } from "../router.tsx";
import { getLanguage, setLanguage } from "../i18n/language.ts";
import { setUnsavedChanges } from "../cv/unsaved.ts";

const DEFAULTS: Preferences = { displayName: null, defaultTemplate: "classic", tailoringLanguage: "job" };
const session = { access_token: "t", user: { id: "u1", email: "ana@example.com", user_metadata: { name: "Ana Popescu" } } };

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>,
  );
  return router;
}

beforeEach(() => {
  vi.resetAllMocks();
  auth.getSession.mockResolvedValue({ data: { session }, error: null });
  auth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
  auth.signOut.mockResolvedValue({ error: null });
  api.getPreferences.mockResolvedValue(DEFAULTS);
  jobs.listJobs.mockResolvedValue({ items: [], nextCursor: null });
  setUnsavedChanges(false);
  setLanguage("en");
});

describe("account area", () => {
  it("opens on the profile and lists the four sections", async () => {
    const router = renderAt("/account");
    expect(await screen.findByRole("heading", { level: 1, name: "Your account" })).toBeInTheDocument();
    await waitFor(() => expect(router.state.location.pathname).toBe("/account/profile"));
    const nav = within(screen.getByRole("navigation", { name: "Account sections" }));
    await waitFor(() => expect(nav.getByRole("link", { name: "Profile and password" })).toHaveAttribute("aria-current", "page"));
    expect(nav.getAllByRole("link").map((link) => link.textContent)).toEqual(["Profile and password", "Preferences", "Your data", "Browser extension"]);
    expect(screen.getByRole("link", { name: "Account" })).toHaveAttribute("aria-current", "page");
  });
});

describe("profile", () => {
  it("starts with the name given at sign-up and saves it", async () => {
    api.savePreferences.mockResolvedValue({ ...DEFAULTS, displayName: "Ana P." });
    renderAt("/account/profile");
    const name = await screen.findByLabelText("Name");
    expect(name).toHaveValue("Ana Popescu");
    await userEvent.clear(name);
    await userEvent.type(name, "Ana P.");
    await userEvent.click(screen.getByRole("button", { name: "Save profile" }));
    expect(api.savePreferences).toHaveBeenCalledWith({ displayName: "Ana P." });
    expect(await screen.findByText("Profile saved.")).toBeInTheDocument();
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it("asks to confirm a new email address", async () => {
    api.savePreferences.mockResolvedValue({ ...DEFAULTS, displayName: "Ana Popescu" });
    auth.updateUser.mockResolvedValue({ data: {}, error: null });
    renderAt("/account/profile");
    const email = await screen.findByLabelText(/^Email/);
    await userEvent.clear(email);
    await userEvent.type(email, "ana.new@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Save profile" }));
    expect(auth.updateUser).toHaveBeenCalledWith({ email: "ana.new@example.com" });
    expect(await screen.findByText(/Open the confirmation link we sent to ana.new@example.com/)).toBeInTheDocument();
  });

  it("says nothing was changed when saving fails", async () => {
    api.savePreferences.mockRejectedValue(new Error("down"));
    renderAt("/account/profile");
    await userEvent.click(await screen.findByRole("button", { name: "Save profile" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn’t save your profile. Nothing was changed. Try again.");
  });

  it("offers to try again when the account can't be loaded", async () => {
    api.getPreferences.mockRejectedValueOnce(new Error("down"));
    renderAt("/account/profile");
    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn’t load this part of your account.");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByLabelText("Name")).toBeInTheDocument();
  });
});

describe("password", () => {
  async function change() {
    await userEvent.type(await screen.findByLabelText("Current password"), "old-password");
    await userEvent.type(screen.getByLabelText(/^New password/), "new-password");
    await userEvent.click(screen.getByRole("button", { name: "Change password" }));
  }

  it("checks the current password, then changes it", async () => {
    auth.signInWithPassword.mockResolvedValue({ data: { session }, error: null });
    auth.updateUser.mockResolvedValue({ data: {}, error: null });
    renderAt("/account/profile");
    await change();
    expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: "ana@example.com", password: "old-password" });
    expect(auth.updateUser).toHaveBeenCalledWith({ password: "new-password" });
    expect(await screen.findByText("Password changed.")).toBeInTheDocument();
    expect(screen.getByLabelText("Current password")).toHaveValue("");
  });

  it("keeps the old password when the current one is wrong", async () => {
    auth.signInWithPassword.mockResolvedValue({ data: { session: null }, error: { message: "Invalid login credentials" } });
    renderAt("/account/profile");
    await change();
    expect(await screen.findByRole("alert")).toHaveTextContent("The current password isn’t right.");
    expect(auth.updateUser).not.toHaveBeenCalled();
  });
});

describe("sign out", () => {
  it("signs out straight away when everything is saved", async () => {
    const confirm = vi.spyOn(window, "confirm");
    renderAt("/account/profile");
    await userEvent.click(await screen.findByRole("button", { name: "Sign out" }));
    expect(confirm).not.toHaveBeenCalled();
    expect(auth.signOut).toHaveBeenCalledTimes(1);
    confirm.mockRestore();
  });

  it("asks first when there are unsaved changes", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderAt("/account/profile");
    const button = await screen.findByRole("button", { name: "Sign out" });
    setUnsavedChanges(true);
    await userEvent.click(button);
    expect(confirm).toHaveBeenCalledWith("You have unsaved changes. Sign out anyway?");
    expect(auth.signOut).not.toHaveBeenCalled();
    confirm.mockRestore();
  });
});

describe("preferences", () => {
  it("changes the interface language on this device without saving to the account", async () => {
    renderAt("/account/preferences");
    await userEvent.click(await screen.findByRole("radio", { name: "Română" }));
    expect(getLanguage()).toBe("ro");
    expect(screen.getByRole("heading", { name: "Limba interfeței" })).toBeInTheDocument();
    expect(api.savePreferences).not.toHaveBeenCalled();
  });

  it("saves the tailoring language and the template as soon as they are chosen", async () => {
    api.savePreferences.mockImplementation(async (patch: Partial<Preferences>) => ({ ...DEFAULTS, ...patch }));
    renderAt("/account/preferences");
    await userEvent.selectOptions(await screen.findByLabelText("Start each job with"), "Romanian");
    expect(api.savePreferences.mock.calls[0]?.[0]).toEqual({ tailoringLanguage: "ro" });
    await userEvent.click(screen.getByRole("radio", { name: "Modern" }));
    expect(api.savePreferences.mock.calls[1]?.[0]).toEqual({ defaultTemplate: "modern" });
    await waitFor(() => expect(screen.getByRole("radio", { name: "Modern" })).toBeChecked());
  });

  it("puts the earlier choice back when saving fails", async () => {
    api.savePreferences.mockRejectedValue(new Error("down"));
    renderAt("/account/preferences");
    await userEvent.click(await screen.findByRole("radio", { name: "Compact" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn’t save that change. Your earlier choice is still in place.");
    expect(screen.getByRole("radio", { name: "Classic" })).toBeChecked();
  });
});

describe("your data", () => {
  it("prepares the export, then offers the file", async () => {
    api.exportAccount.mockResolvedValue({ file: new Blob(["{}"]), fileName: "resumora-data-2026-11-11.json" });
    const createObjectURL = vi.fn(() => "blob:export");
    Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() });
    renderAt("/account/data");
    await userEvent.click(await screen.findByRole("button", { name: "Prepare my data" }));
    expect(await screen.findByText("Your data is ready.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Download the file" }));
    expect(createObjectURL).toHaveBeenCalledTimes(1);
  });

  it("says nothing was lost when the export fails", async () => {
    api.exportAccount.mockRejectedValue(new Error("down"));
    renderAt("/account/data");
    await userEvent.click(await screen.findByRole("button", { name: "Prepare my data" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn’t prepare the file. Nothing was lost.");
    expect(screen.getByRole("button", { name: "Prepare my data" })).toBeEnabled();
  });

  it("deletes the account only after a second, explicit confirmation", async () => {
    api.deleteAccount.mockResolvedValue(undefined);
    // Signing out clears the session, as the real client does.
    auth.signOut.mockImplementation(async () => {
      auth.onAuthStateChange.mock.calls[0]?.[0]("SIGNED_OUT", null);
      return { error: null };
    });
    const router = renderAt("/account/data");
    await userEvent.click(await screen.findByRole("button", { name: "Delete my account" }));
    expect(api.deleteAccount).not.toHaveBeenCalled();
    const dialog = within(screen.getByRole("dialog", { name: "Delete your account?" }));
    expect(dialog.getByText("Your CVs, jobs and answers will be removed. This can’t be undone.")).toBeInTheDocument();
    await userEvent.click(dialog.getByRole("button", { name: "Delete everything" }));
    expect(api.deleteAccount).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
  });

  it("keeps the account when the person backs out", async () => {
    renderAt("/account/data");
    await userEvent.click(await screen.findByRole("button", { name: "Delete my account" }));
    await userEvent.click(screen.getByRole("button", { name: "Keep my account" }));
    expect(api.deleteAccount).not.toHaveBeenCalled();
    expect(screen.queryByText("Your CVs, jobs and answers will be removed. This can’t be undone.")).not.toBeInTheDocument();
  });

  it("says nothing was removed when deleting fails", async () => {
    api.deleteAccount.mockRejectedValue(new Error("down"));
    renderAt("/account/data");
    await userEvent.click(await screen.findByRole("button", { name: "Delete my account" }));
    await userEvent.click(screen.getByRole("button", { name: "Delete everything" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn’t delete your account. Nothing was removed.");
    expect(auth.signOut).not.toHaveBeenCalled();
  });
});

describe("browser extension", () => {
  const job = { id: "job-1", status: "ready", errorCode: null, title: "Automation Developer", company: "Flowbridge", location: null, url: "https://example.test/1", createdAt: "2026-11-10T08:00:00Z" };

  it("shows how to install it and the newest job it saved", async () => {
    jobs.listJobs.mockResolvedValue({ items: [{ ...job, id: "job-2", source: "link", title: "Added by hand" }, { ...job, source: "extension" }], nextCursor: null });
    renderAt("/account/extension");
    expect(await screen.findByRole("link", { name: "Automation Developer, Flowbridge" })).toHaveAttribute("href", "/jobs/job-1");
    expect(screen.getByRole("link", { name: "Download the extension" })).toHaveAttribute("href", "/downloads/resumora-extension.zip");
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
    expect(screen.getByText("To disconnect the extension, sign out inside the extension itself.")).toBeInTheDocument();
  });

  it("says so when the extension hasn't saved a job yet", async () => {
    jobs.listJobs.mockResolvedValue({ items: [{ ...job, source: "link" }], nextCursor: null });
    renderAt("/account/extension");
    expect(await screen.findByText("No job has been saved from the extension yet.")).toBeInTheDocument();
  });
});
