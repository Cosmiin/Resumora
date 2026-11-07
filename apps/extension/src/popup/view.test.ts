import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
    [{ kind: "capture", where: "jobs.example.test/job/1", busy: false },
      "Capture this job", "jobs.example.test/job/1", "Capture"],
    [{ kind: "capture", where: "jobs.example.test/job/1", busy: true },
      "Capture this job", "jobs.example.test/job/1", "Capturing…"],
  ])("renders $kind with its exact copy and action", (view, title, text, button) => {
    renderView(root, view, actions);
    expect(root.querySelector("h2")?.textContent).toBe(title);
    expect(root.querySelector("p")?.textContent ?? null).toBe(text);
    expect(root.querySelectorAll("button")).toHaveLength(button ? 1 : 0);
    expect(root.querySelector("button")?.textContent ?? null).toBe(button);
    expect(root.textContent).not.toMatch(/Error:|\bat \w+.*:\d+/);
    root.querySelector("button")?.click();
    if ("openUrl" in view) expect(actions.openTab).toHaveBeenCalledExactlyOnceWith(view.openUrl);
    if ("pasteUrl" in view) expect(actions.openTab).toHaveBeenCalledExactlyOnceWith(view.pasteUrl);
    if (view.kind === "error" || (view.kind === "capture" && !view.busy)) expect(actions.retry).toHaveBeenCalledTimes(1);
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

async function popup(signedIn = true, url = "https://www.linkedin.com/jobs/view/123/") {
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
      query: vi.fn(async () => [{ url }]),
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

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

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
    },
  );

  it.each(["signOut", "setEnvironment", "signIn", "saveActiveTab"] as const)(
    "preserves the current environment after an invalid %s reply", async (request) => {
      vi.useFakeTimers();
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
      if (request === "saveActiveTab") document.querySelector<HTMLButtonElement>("main button")!.click();
      await vi.advanceTimersByTimeAsync(500);
      expect(document.querySelector("main h2")?.textContent).toBe("Not saved");
      expect(document.querySelector("main p")?.textContent).toBe("Something went wrong. Try again.");
      expect(document.getElementById("environment-badge")?.textContent).toBe("Local");
      if (request === "signIn") expect(document.querySelector("footer")?.textContent).toBe("");
      else expect(document.querySelector("footer")?.textContent).toContain("user@example.test");
    },
  );

  it.each([
    ["https://www.linkedin.com/jobs/view/123/", "www.linkedin.com/jobs/view/123/"],
    ["http://jobs.example.test/job/1?secret=value#fragment", "jobs.example.test/job/1"],
    ["chrome://extensions/", null], ["file:///job.html", null], ["", null],
  ])("opens %s without saving", async (url, where) => {
    const p = await popup(true, url);
    await p.start();
    expect(p.chromeApi.tabs.query).toHaveBeenCalledWith({ active: true, currentWindow: true });
    expect(document.querySelector("main h2")?.textContent).toBe(
      where ? "Capture this job" : "Resumora can't read this kind of page.");
    expect(document.querySelector("main p")?.textContent ?? null).toBe(where);
    const button = document.querySelector<HTMLButtonElement>("main button");
    if (where) { expect(button?.textContent).toBe("Capture"); expect(button?.disabled).toBe(false); }
    else expect(button).toBeNull();
    expect(p.sendMessage.mock.calls.map(([request]) => request.type)).toEqual(["getState"]);
    expect(document.getElementById("environment-badge")?.textContent).toBe("Local");
    expect(document.querySelector("footer")?.textContent).toContain("user@example.test");
  });

  it.each([50, 800])("keeps capture busy until both 500 ms and a %i ms reply", async (replyTime) => {
    vi.useFakeTimers();
    const p = await popup();
    p.sendMessage.mockImplementation(() => new Promise((resolve) => {
      setTimeout(() => resolve({ kind: "saved", openUrl: "https://resumora.test/jobs/id" }), replyTime);
    }));
    const button = document.querySelector<HTMLButtonElement>("main button")!;
    button.click();
    const busy = document.querySelector<HTMLButtonElement>("main button")!;
    expect(busy.disabled).toBe(true);
    expect(busy.getAttribute("aria-busy")).toBe("true");
    expect(busy.querySelector(".spinner")).not.toBeNull();
    expect(busy.textContent).toBe("Capturing…");
    expect(document.querySelector("main p")?.textContent).toBe("www.linkedin.com/jobs/view/123/");
    busy.click(); button.click();
    expect(p.sendMessage).toHaveBeenCalledExactlyOnceWith({ type: "saveActiveTab" });
    await vi.advanceTimersByTimeAsync(499);
    expect(document.querySelector("main button")?.textContent).toBe("Capturing…");
    await vi.advanceTimersByTimeAsync(1);
    if (replyTime > 500) {
      expect(document.querySelector("main button")?.textContent).toBe("Capturing…");
      await vi.advanceTimersByTimeAsync(replyTime - 500);
    }
    expect(document.querySelector("main h2")?.textContent).toBe("Saved");
    expect(document.querySelector("main button")?.textContent).toBe("Open in Resumora");
    document.querySelector<HTMLButtonElement>("main button")!.click();
    expect(p.chromeApi.tabs.create).toHaveBeenCalledExactlyOnceWith({ url: "https://resumora.test/jobs/id" });
  });

  it.each(["error", "invalid", "rejected"])("retries capture after an %s response", async (failure) => {
    vi.useFakeTimers();
    const p = await popup();
    if (failure === "rejected") p.sendMessage.mockRejectedValueOnce(new Error("Private detail"));
    else p.sendMessage.mockResolvedValueOnce(failure === "error"
      ? { kind: "error", message: "Try again later.", requestId: "id" } : { kind: "unknown" });
    document.querySelector<HTMLButtonElement>("main button")!.click();
    await vi.advanceTimersByTimeAsync(499);
    expect(document.querySelector("main button")?.textContent).toBe("Capturing…");
    await vi.advanceTimersByTimeAsync(1);
    expect(document.querySelector("main h2")?.textContent).toBe("Not saved");
    expect(document.querySelector("main button")?.textContent).toBe("Try again");
    expect(document.querySelector("main p")?.textContent).toBe(
      failure === "error" ? "Try again later." : "Something went wrong. Try again.");
    document.querySelector<HTMLButtonElement>("main button")!.click();
    expect(document.querySelector<HTMLButtonElement>("main button")?.disabled).toBe(true);
    expect(document.querySelector("main button")?.getAttribute("aria-busy")).toBe("true");
    expect(document.querySelector("main button .spinner")).not.toBeNull();
    expect(document.querySelector("main button")?.textContent).toBe("Capturing…");
    expect(p.sendMessage.mock.calls.map(([request]) => request.type)).toEqual(["saveActiveTab", "saveActiveTab"]);
    await vi.advanceTimersByTimeAsync(500);
    expect(document.querySelector("main h2")?.textContent).toBe("Saved");
  });

  it("ignores Capture until a pending environment switch is applied", async () => {
    vi.useFakeTimers();
    const p = await popup();
    const hosted: PopupState = {
      ...state, env: "hosted", email: "hosted@example.test",
      environments: state.environments.map((env) => ({ ...env, configured: true })),
    };
    p.sendMessage.mockResolvedValueOnce({ ...hosted, env: "local", email: "user@example.test" });
    await p.start();
    p.sendMessage.mockClear();
    let finish!: (next: PopupState) => void;
    p.sendMessage.mockReturnValueOnce(new Promise<PopupState>((resolve) => { finish = resolve; }));
    const select = document.querySelector<HTMLSelectElement>("footer select")!;
    select.value = "hosted";
    select.dispatchEvent(new Event("change"));
    document.querySelector<HTMLButtonElement>("main button")!.click();
    expect(p.sendMessage.mock.calls.map(([request]) => request.type)).toEqual(["setEnvironment"]);
    finish(hosted);
    await vi.advanceTimersByTimeAsync(0);
    expect(document.getElementById("environment-badge")?.textContent).toBe("Hosted");
    expect(document.querySelector("footer")?.textContent).toContain("hosted@example.test");
    expect(document.querySelector("main h2")?.textContent).toBe("Capture this job");
    expect(document.querySelector<HTMLButtonElement>("main button")?.disabled).toBe(false);
    document.querySelector<HTMLButtonElement>("main button")!.click();
    expect(p.sendMessage.mock.calls.map(([request]) => request.type)).toEqual(["setEnvironment", "saveActiveTab"]);
    await vi.advanceTimersByTimeAsync(500);
    expect(document.querySelector("main h2")?.textContent).toBe("Saved");
    expect(document.getElementById("environment-badge")?.textContent).toBe("Hosted");
  });
  it("captures after switching environments while an older sign-in is still pending", async () => {
    vi.useFakeTimers();
    const p = await popup(false);
    const hosted: PopupState = {
      ...state, env: "hosted", email: "hosted@example.test",
      environments: state.environments.map((env) => ({ ...env, configured: true })),
    };
    p.sendMessage.mockResolvedValueOnce({ ...hosted, env: "local", email: null });
    await p.start();
    p.sendMessage.mockClear();
    let finish!: () => void;
    p.sendMessage.mockImplementationOnce(() => new Promise((resolve) => {
      finish = () => resolve({ ok: true, state: { ...state, email: "late@example.test" } });
    }));
    document.querySelector<HTMLInputElement>('input[type="email"]')!.value = "late@example.test";
    document.querySelector<HTMLInputElement>('input[type="password"]')!.value = "test-password";
    document.querySelector("form")!.dispatchEvent(new Event("submit", { cancelable: true }));
    p.sendMessage.mockResolvedValueOnce(hosted);
    const select = document.querySelector<HTMLSelectElement>("main select")!;
    select.value = "hosted";
    select.dispatchEvent(new Event("change"));
    await vi.advanceTimersByTimeAsync(0);
    expect(document.getElementById("environment-badge")?.textContent).toBe("Hosted");
    expect(document.querySelector("footer")?.textContent).toContain("hosted@example.test");
    document.querySelector<HTMLButtonElement>("main button")!.click();
    expect(p.sendMessage.mock.calls.map(([request]) => request.type)).toEqual([
      "signIn", "setEnvironment", "saveActiveTab",
    ]);
    await vi.advanceTimersByTimeAsync(499);
    expect(document.querySelector("main button")?.textContent).toBe("Capturing…");
    await vi.advanceTimersByTimeAsync(1);
    expect(document.querySelector("main h2")?.textContent).toBe("Saved");
    const displayed = document.body.innerHTML;
    finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(document.body.innerHTML).toBe(displayed);
    expect(p.sendMessage.mock.calls.filter(([request]) => request.type === "saveActiveTab")).toHaveLength(1);
  });
  it("ignores a capture reply after signing out", async () => {
    vi.useFakeTimers();
    const p = await popup();
    let finish!: (result: SaveResult) => void;
    p.sendMessage.mockImplementation(async (request) => request.type === "signOut"
      ? state : new Promise<SaveResult>((resolve) => { finish = resolve; }));
    document.querySelector<HTMLButtonElement>("main button")!.click();
    document.querySelector<HTMLButtonElement>("footer button")!.click();
    await vi.advanceTimersByTimeAsync(500);
    finish({ kind: "saved", openUrl: "https://resumora.test/jobs/id" });
    await vi.advanceTimersByTimeAsync(0);
    expect(document.querySelector("main h2")?.textContent).toBe("Sign in to Resumora");
  });

  it.each([
    ["https://jobs.example.test/job/1", "Capture this job"],
    ["chrome://extensions/", "Resumora can't read this kind of page."],
  ])("signs in on %s without saving, switches environments, and signs out", async (url, title) => {
    const p = await popup(false, url);
    await p.start();
    document.querySelector<HTMLInputElement>('input[type="email"]')!.value = "user@example.test";
    document.querySelector<HTMLInputElement>('input[type="password"]')!.value = "test-password";
    document.querySelector("form")!.dispatchEvent(new Event("submit", { cancelable: true }));
    await vi.waitFor(() => expect(document.querySelector("h2")?.textContent).toBe(title));
    expect(p.sendMessage.mock.calls.some(([request]) => request.type === "saveActiveTab")).toBe(false);
    const select = document.querySelector("footer select") as HTMLSelectElement;
    select.value = "hosted";
    select.dispatchEvent(new Event("change"));
    await vi.waitFor(() => expect(document.getElementById("environment-badge")?.textContent).toBe("Hosted"));
    expect(document.querySelector("h2")?.textContent).toBe("Sign in to Resumora");
    p.sendMessage.mockResolvedValue({ ok: true, state: { ...state, env: "hosted", email: "hosted@example.test" } });
    document.querySelector("form")!.dispatchEvent(new Event("submit", { cancelable: true }));
    await vi.waitFor(() => expect(document.querySelector("h2")?.textContent).toBe(title));
    p.sendMessage.mockResolvedValue({ ...state, env: "hosted" });
    document.querySelector<HTMLButtonElement>("footer button")!.click();
    await vi.waitFor(() => expect(document.querySelector("h2")?.textContent).toBe("Sign in to Resumora"));
    expect(document.querySelector("footer")?.textContent).toBe("");
  });

  it("shows expired sign-in results as the form with its message", async () => {
    vi.useFakeTimers();
    const p = await popup();
    p.sendMessage.mockImplementation(async (request) => request.type === "getState"
      ? { ...state, email: "user@example.test" }
      : { kind: "signedOut", message: "Your sign-in expired. Sign in again." });
    await p.start();
    document.querySelector<HTMLButtonElement>("main button")!.click();
    await vi.advanceTimersByTimeAsync(500);
    expect(document.querySelector("h2")?.textContent).toBe("Sign in to Resumora");
    expect(document.querySelector("main p")?.textContent).toBe("Your sign-in expired. Sign in again.");
    expect(document.querySelector("footer")?.textContent).toBe("");
  });
});
