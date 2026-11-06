import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderView, type View, type ViewActions } from "./view";
import type { PopupState, Request, SaveResult } from "../messages";

const state: PopupState = {
  env: "local", email: null,
  environments: [
    { id: "local", label: "Local", configured: true },
    { id: "hosted", label: "Hosted", configured: false },
  ],
};
let root: HTMLElement;
let actions: ViewActions;
beforeEach(() => {
  root = document.createElement("main");
  actions = { signIn: vi.fn(), setEnvironment: vi.fn(), signOut: vi.fn(), openTab: vi.fn(), retry: vi.fn() };
});

describe("popup views", () => {
  it.each<[View, string, string | null, string | null]>([
    [{ kind: "saved", openUrl: "https://resumora.test/jobs/id" }, "Saved",
      "Resumora is reading the ad. Title and requirements appear in a few seconds.", "Open in Resumora"],
    [{ kind: "existing", openUrl: "https://resumora.test/jobs/id" }, "Already in Resumora",
      "You saved this job earlier. Nothing new was added.", "Open it"],
    [{ kind: "couldntRead", pasteUrl: "https://resumora.test/jobs?add=url" }, "Couldn't read this ad",
      "The page shows too little text. It may need a sign-in, or it isn't a job ad.", "Paste it in Resumora"],
    [{ kind: "cantRead" }, "Resumora can't read this kind of page.", null, null],
    [{ kind: "error", message: "Something went wrong. Try again.", requestId: null }, "Not saved",
      "Something went wrong. Try again.", "Try again"],
    [{ kind: "saving", where: "jobs.example.test/job/1" }, "Saving this job…", "jobs.example.test/job/1", null],
    [{ kind: "ready", state }, "You're signed in", "Open a job ad and click the Resumora icon to save it.", null],
  ])("renders $kind with its exact copy and action", (view, title, text, button) => {
    renderView(root, view, actions);
    expect(root.querySelector("h2")?.textContent).toBe(title);
    expect(root.querySelector("p")?.textContent ?? null).toBe(text);
    expect(root.querySelectorAll("button")).toHaveLength(button ? 1 : 0);
    expect(root.querySelector("button")?.textContent ?? null).toBe(button);
    expect(root.textContent).not.toMatch(/Error:|\bat \w+.*:\d+/);
    if (view.kind === "saving") expect(root.querySelector('[role="status"]')).not.toBeNull();
    root.querySelector("button")?.click();
    if ("openUrl" in view) expect(actions.openTab).toHaveBeenCalledExactlyOnceWith(view.openUrl);
    if ("pasteUrl" in view) expect(actions.openTab).toHaveBeenCalledExactlyOnceWith(view.pasteUrl);
    if (view.kind === "error") expect(actions.retry).toHaveBeenCalledTimes(1);
  });

  it.each([null, "abc-123"])("shows the request id only when present (%s)", (requestId) => {
    renderView(root, { kind: "error", message: "Try again later.", requestId }, actions);
    expect(root.querySelector("small")?.textContent ?? null).toBe(requestId ? "Request id: abc-123" : null);
  });

  it("renders labelled sign-in fields, message, error, environment and login links", () => {
    renderView(root, {
      kind: "signedOut", state, message: "Your sign-in expired. Sign in again.", error: "Wrong email or password.",
    }, actions);
    expect(root.querySelector("h2")?.textContent).toBe("Sign in to Resumora");
    expect(root.querySelector("form")?.previousElementSibling?.textContent).toBe("Your sign-in expired. Sign in again.");
    expect(root.querySelector("form")?.nextElementSibling?.textContent).toBe("Wrong email or password.");
    const email = root.querySelector<HTMLInputElement>('input[type="email"]')!;
    const password = root.querySelector<HTMLInputElement>('input[type="password"]')!;
    expect(email.parentElement?.firstChild?.textContent).toBe("Email");
    expect(password.parentElement?.firstChild?.textContent).toBe("Password");
    expect(email.autocomplete).toBe("email");
    expect(password.autocomplete).toBe("current-password");
    expect(root.querySelector("button")?.textContent).toBe("Sign in");
    email.value = "user@example.test";
    password.value = "test-password";
    root.querySelector("form")!.dispatchEvent(new Event("submit", { cancelable: true }));
    expect(actions.signIn).toHaveBeenCalledExactlyOnceWith("user@example.test", "test-password");
    const select = root.querySelector("select")!;
    expect(select.parentElement?.firstChild?.textContent).toBe("Connect to");
    expect(select.options[1]!.disabled).toBe(true);
    expect(select.options[1]!.textContent).toBe("Hosted (not set up in this build)");
    expect(Array.from(root.querySelectorAll("a"), (link) => link.textContent)).toEqual(["Create an account", "Forgot password"]);
    for (const link of Array.from(root.querySelectorAll("a"))) {
      expect(link.href).toBe("http://127.0.0.1:5173/login");
      link.click();
    }
    expect(actions.openTab).toHaveBeenNthCalledWith(1, "http://127.0.0.1:5173/login");
    expect(actions.openTab).toHaveBeenNthCalledWith(2, "http://127.0.0.1:5173/login");
    expect(root.textContent).not.toContain("Error:");
  });

  it("enables configured Hosted and changes the environment", () => {
    renderView(root, { kind: "signedOut", state: {
      ...state, environments: state.environments.map((env) => ({ ...env, configured: true })),
    }, message: null, error: null }, actions);
    const select = root.querySelector("select")!;
    expect(select.options[1]!.disabled).toBe(false);
    select.value = "hosted";
    select.dispatchEvent(new Event("change"));
    expect(actions.setEnvironment).toHaveBeenCalledExactlyOnceWith("hosted");
    expect(root.querySelector('[role="alert"]')).toBeNull();
  });

  it("replaces previous content and treats displayed content as text", () => {
    renderView(root, { kind: "error", message: "<img src=x>", requestId: null }, actions);
    expect(root.querySelector("img")).toBeNull();
    renderView(root, { kind: "cantRead" }, actions);
    expect(root.querySelectorAll("h2")).toHaveLength(1);
    expect(root.querySelector("button")).toBeNull();
  });
});

async function popup(signedIn = true) {
  document.body.innerHTML = '<header><span id="environment-badge"></span></header><main></main><footer></footer>';
  const signedInState = { ...state, email: "user@example.test" };
  const sendMessage = vi.fn(async (request: Request): Promise<unknown> => {
    if (request.type === "getState") return signedIn ? signedInState : state;
    if (request.type === "signIn") return { ok: true, state: signedInState };
    if (request.type === "signOut") return state;
    if (request.type === "setEnvironment") return { ...state, env: "hosted" };
    return { kind: "saved", openUrl: "https://resumora.test/jobs/id" };
  });
  const chromeApi = {
    runtime: { sendMessage },
    tabs: {
      query: vi.fn(async () => [{ url: "https://jobs.example.test/job/1?secret=value#fragment" }]),
      create: vi.fn(async () => ({})),
    },
  };
  // The entry point also starts once when loaded, as it does in Chrome.
  vi.stubGlobal("chrome", chromeApi);
  const { startPopup } = await import("./popup");
  await startPopup(chromeApi, document);
  sendMessage.mockClear();
  chromeApi.tabs.create.mockClear();
  return { chromeApi, sendMessage, start: () => startPopup(chromeApi, document) };
}

describe("popup interactions", () => {
  it("retries getState after startup fails and then shows the sign-in form", async () => {
    const p = await popup(false);
    p.sendMessage.mockRejectedValueOnce(new Error("Private detail"));
    p.sendMessage.mockImplementation(async (request) => request.type === "getState"
      ? state : { kind: "signedOut", message: null });
    await p.start();
    expect(document.querySelector("main h2")?.textContent).toBe("Not saved");
    p.sendMessage.mockClear();
    document.querySelector<HTMLButtonElement>("main button")!.click();
    await vi.waitFor(() => expect(document.querySelector("main h2")?.textContent).toBe("Sign in to Resumora"));
    expect(document.querySelector("form")).not.toBeNull();
    expect(p.sendMessage.mock.calls.map(([request]) => request.type)).toEqual(["getState"]);
    vi.unstubAllGlobals();
  });

  it.each(["error reply", "undefined reply", "rejected request"])(
    "shows a safe error without throwing when getState returns %s", async (failure) => {
      const p = await popup(false);
      if (failure === "rejected request") p.sendMessage.mockRejectedValue(new Error("Private detail"));
      else p.sendMessage.mockResolvedValue(failure === "error reply"
        ? { kind: "error", message: "x", requestId: null } : undefined);
      await expect(p.start()).resolves.toBeUndefined();
      expect(document.querySelector("main h2")?.textContent).toBe("Not saved");
      expect(document.querySelector("main p")?.textContent).toBe("Something went wrong. Try again.");
      expect(document.getElementById("environment-badge")?.textContent).toBe("");
      expect(document.querySelector("footer")?.textContent).toBe("");
      vi.unstubAllGlobals();
    },
  );

  it.each(["signOut", "setEnvironment", "signIn", "saveActiveTab"] as const)(
    "preserves the current environment after an invalid %s reply", async (request) => {
      const p = await popup(request !== "signIn");
      await p.start();
      p.sendMessage.mockResolvedValue(undefined);
      if (request === "signOut") document.querySelector<HTMLButtonElement>("footer button")!.click();
      if (request === "setEnvironment") {
        const select = document.querySelector<HTMLSelectElement>("footer select")!;
        select.value = "hosted";
        select.dispatchEvent(new Event("change"));
      }
      if (request === "signIn") document.querySelector("form")!.dispatchEvent(new Event("submit", { cancelable: true }));
      if (request === "saveActiveTab") {
        p.sendMessage.mockImplementation(async (message) => message.type === "getState"
          ? { ...state, email: "user@example.test" } : { kind: "unknown" });
        await p.start();
      }
      await vi.waitFor(() => expect(document.querySelector("main h2")?.textContent).toBe("Not saved"));
      expect(document.querySelector("main p")?.textContent).toBe("Something went wrong. Try again.");
      expect(document.getElementById("environment-badge")?.textContent).toBe("Local");
      if (request === "signIn") expect(document.querySelector("footer")?.textContent).toBe("");
      else expect(document.querySelector("footer")?.textContent).toContain("user@example.test");
      vi.unstubAllGlobals();
    },
  );

  it("opens signed in by saving, then opens the result in a tab", async () => {
    const p = await popup();
    await p.start();
    expect(p.sendMessage.mock.calls.map(([request]) => request.type)).toEqual(["getState", "saveActiveTab"]);
    expect(document.getElementById("environment-badge")?.textContent).toBe("Local");
    expect(document.querySelector("footer")?.textContent).toContain("user@example.test");
    document.querySelector<HTMLButtonElement>("main button")!.click();
    expect(p.chromeApi.tabs.create).toHaveBeenCalledWith({ url: "https://resumora.test/jobs/id" });
    vi.unstubAllGlobals();
  });

  it("shows the host and path while saving and retries after an error", async () => {
    const p = await popup();
    let finish!: (result: SaveResult) => void;
    p.sendMessage.mockImplementation(async (request) => request.type === "getState"
      ? { ...state, email: "user@example.test" }
      : new Promise<SaveResult>((resolve) => { finish = resolve; }));
    const pending = p.start();
    await vi.waitFor(() => expect(document.querySelector("main p")?.textContent).toBe("jobs.example.test/job/1"));
    finish({ kind: "error", message: "Try again later.", requestId: "id" });
    await pending;
    p.sendMessage.mockResolvedValue({ kind: "saved", openUrl: "https://resumora.test/jobs/id" });
    document.querySelector<HTMLButtonElement>("main button")!.click();
    await vi.waitFor(() => expect(document.querySelector("main h2")?.textContent).toBe("Saved"));
    expect(p.sendMessage).toHaveBeenLastCalledWith({ type: "saveActiveTab" });
    vi.unstubAllGlobals();
  });

  it("signs in to Ready without saving, switches environments, and signs out", async () => {
    const p = await popup(false);
    await p.start();
    document.querySelector<HTMLInputElement>('input[type="email"]')!.value = "user@example.test";
    document.querySelector<HTMLInputElement>('input[type="password"]')!.value = "test-password";
    document.querySelector("form")!.dispatchEvent(new Event("submit", { cancelable: true }));
    await vi.waitFor(() => expect(document.querySelector("h2")?.textContent).toBe("You're signed in"));
    expect(p.sendMessage.mock.calls.some(([request]) => request.type === "saveActiveTab")).toBe(false);
    const select = document.querySelector("footer select") as HTMLSelectElement;
    select.value = "hosted";
    select.dispatchEvent(new Event("change"));
    await vi.waitFor(() => expect(document.getElementById("environment-badge")?.textContent).toBe("Hosted"));
    expect(document.querySelector("h2")?.textContent).toBe("Sign in to Resumora");
    p.sendMessage.mockResolvedValue({ ok: true, state: { ...state, env: "hosted", email: "hosted@example.test" } });
    document.querySelector("form")!.dispatchEvent(new Event("submit", { cancelable: true }));
    await vi.waitFor(() => expect(document.querySelector("h2")?.textContent).toBe("You're signed in"));
    p.sendMessage.mockResolvedValue({ ...state, env: "hosted" });
    document.querySelector<HTMLButtonElement>("footer button")!.click();
    await vi.waitFor(() => expect(document.querySelector("h2")?.textContent).toBe("Sign in to Resumora"));
    expect(document.querySelector("footer")?.textContent).toBe("");
    vi.unstubAllGlobals();
  });

  it("shows expired sign-in results as the form with its message", async () => {
    const p = await popup();
    p.sendMessage.mockImplementation(async (request) => request.type === "getState"
      ? { ...state, email: "user@example.test" }
      : { kind: "signedOut", message: "Your sign-in expired. Sign in again." });
    await p.start();
    expect(document.querySelector("h2")?.textContent).toBe("Sign in to Resumora");
    expect(document.querySelector("main p")?.textContent).toBe("Your sign-in expired. Sign in again.");
    expect(document.querySelector("footer")?.textContent).toBe("");
    vi.unstubAllGlobals();
  });
});
