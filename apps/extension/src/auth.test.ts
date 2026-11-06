// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAuth } from "./auth";
import { environmentsFrom, type EnvId } from "./environments";
import { memoryStorage } from "./storage";

const email = "a@example.test";
const password = "test-only-password";
const environments = environmentsFrom({
  VITE_LOCAL_SUPABASE_ANON_KEY: "public-local-key",
  VITE_HOSTED_API_URL: "https://api.example.test",
  VITE_HOSTED_WEB_URL: "https://app.example.test",
  VITE_HOSTED_SUPABASE_URL: "https://db.example.test",
  VITE_HOSTED_SUPABASE_ANON_KEY: "public-hosted-key",
});

function session(env: EnvId, expired = false, refreshed = false) {
  const expiresAt = Math.floor(Date.now() / 1000) + (expired ? -60 : 3600);
  const payload = Buffer.from(JSON.stringify({ sub: env, exp: expiresAt })).toString("base64url");
  return {
    access_token: `eyJhbGciOiJIUzI1NiJ9.${payload}.signature`,
    refresh_token: `${env}-${refreshed ? "new" : "old"}-refresh-token`,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: expiresAt,
    user: { id: env, email, app_metadata: {}, user_metadata: {}, aud: "authenticated" },
  };
}

function setup(options: {
  signInError?: string;
  signInStatus?: number;
  refreshError?: string;
  offline?: boolean;
  logoutError?: boolean;
} = {}) {
  const storage = memoryStorage();
  const fetch = vi.fn<typeof globalThis.fetch>(async (input) => {
    if (options.offline) throw new TypeError("Network unavailable");
    const url = new URL(input instanceof Request ? input.url : String(input));
    const env = url.hostname === "127.0.0.1" ? "local" : "hosted";
    const errorReply = (code: string, status = 400) => Response.json({ code, msg: "Private server details" }, {
      status,
      headers: { "X-Supabase-Api-Version": "2024-01-01" },
    });
    if (url.pathname === "/auth/v1/token") {
      const grant = url.searchParams.get("grant_type");
      if (grant === "password") {
        return options.signInError
          ? errorReply(options.signInError, options.signInStatus)
          : Response.json(session(env));
      }
      if (grant === "refresh_token") {
        return options.refreshError
          ? errorReply(options.refreshError)
          : Response.json(session(env, false, true));
      }
    }
    if (url.pathname === "/auth/v1/logout") {
      return options.logoutError
        ? errorReply("unexpected_failure")
        : new Response(null, { status: 204 });
    }
    throw new Error(`Unexpected test request: ${url.pathname}`);
  });
  return { storage, fetch, auth: createAuth({ storage, environments, fetch }) };
}

afterEach(() => vi.restoreAllMocks());

describe("environment sign-in", () => {
  it("starts signed out without making requests", async () => {
    const { auth, fetch } = setup();
    expect(await auth.email("local")).toBeNull();
    expect(await auth.accessToken("local")).toBeNull();
    expect(await auth.refresh("local")).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("signs in on Local while Hosted remains signed out", async () => {
    const { auth, storage } = setup();
    expect(await auth.signIn("local", email, password)).toEqual({ ok: true, email });
    expect(await auth.email("local")).toBe(email);
    const saved = JSON.parse((await storage.get("resumora-auth-local"))!);
    expect(await auth.accessToken("local")).toEqual({ token: saved.access_token });
    expect(await auth.email("hosted")).toBeNull();
    expect(await auth.accessToken("hosted")).toBeNull();
    expect(await storage.get("resumora-auth-local")).not.toBeNull();
    expect(await storage.get("resumora-auth-hosted")).toBeNull();
  });

  it("stores two sessions under separate keys without storing the password", async () => {
    const { auth, storage } = setup();
    const writes = vi.spyOn(storage, "set");
    await auth.signIn("local", email, password);
    await auth.signIn("hosted", email, password);
    for (const env of ["local", "hosted"] as const) {
      expect(JSON.parse((await storage.get(`resumora-auth-${env}`))!)).toMatchObject({
        refresh_token: `${env}-old-refresh-token`, user: { email },
      });
      expect(await auth.email(env)).toBe(email);
    }
    for (const [, value] of writes.mock.calls) {
      expect(value).not.toContain(password);
      expect(value).not.toContain('"password"');
    }
  });

  it("signs out locally and keeps the Hosted session and email", async () => {
    const { auth, storage, fetch } = setup();
    await auth.signIn("local", email, password);
    await auth.signIn("hosted", email, password);
    const hostedSession = await storage.get("resumora-auth-hosted");
    await auth.signOut("local");
    expect(await auth.email("local")).toBeNull();
    expect(await auth.accessToken("local")).toBeNull();
    expect(await storage.get("resumora-auth-local")).toBeNull();
    expect(await auth.email("hosted")).toBe(email);
    expect(await storage.get("resumora-auth-hosted")).toBe(hostedSession);
    expect(fetch.mock.calls.some(([url]) => String(url).endsWith("/auth/v1/logout?scope=local")))
      .toBe(true);
  });

  it("clears the local session even if logout returns an error", async () => {
    const { auth, storage } = setup({ logoutError: true });
    await auth.signIn("local", email, password);
    await auth.signOut("local");
    expect(await storage.get("resumora-auth-local")).toBeNull();
    expect(await auth.email("local")).toBeNull();
  });

  it.each([
    ["invalid_credentials", "Wrong email or password."],
    ["email_not_confirmed", "Confirm your email first, then sign in."],
    ["unexpected_failure", "Something went wrong. Try again."],
  ])("maps %s to safe popup copy", async (signInError, message) => {
    const { auth } = setup({ signInError });
    expect(await auth.signIn("local", email, password)).toEqual({ ok: false, message });
  });

  it("maps other server failures to the generic error", async () => {
    const { auth } = setup({ signInError: "unexpected_failure", signInStatus: 500 });
    expect(await auth.signIn("local", email, password)).toEqual({
      ok: false, message: "Something went wrong. Try again.",
    });
  });

  it.each([
    ["local", "Can't reach Resumora. Is the app running?"],
    ["hosted", "Can't reach Resumora. Check your connection."],
  ] as const)("uses the %s connection message for rejected fetch", async (env, message) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { auth } = setup({ offline: true });
    expect(await auth.signIn(env, email, password)).toEqual({ ok: false, message });
  });

  it("shows unconfigured environments as signed out without making requests", async () => {
    const storage = memoryStorage();
    const fetch = vi.fn<typeof globalThis.fetch>();
    const auth = createAuth({ storage, environments: environmentsFrom({}), fetch });
    expect(await auth.email("local")).toBeNull();
    expect(await auth.email("hosted")).toBeNull();
    expect(await auth.signIn("hosted", email, password)).toEqual({
      ok: false, message: "Something went wrong. Try again.",
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("session refresh", () => {
  it("restores and refreshes an expired stored session when getting its access token", async () => {
    const { auth, storage, fetch } = setup();
    const expiredSession = session("local", true);
    await storage.set("resumora-auth-local", JSON.stringify(expiredSession));
    const result = await auth.accessToken("local");
    const saved = JSON.parse((await storage.get("resumora-auth-local"))!);
    expect(result).toEqual({ token: saved.access_token });
    expect(saved.access_token).not.toBe(expiredSession.access_token);
    expect(saved.refresh_token).toBe("local-new-refresh-token");
    expect(fetch.mock.calls.some(([url]) => String(url).includes("grant_type=refresh_token")))
      .toBe(true);
  });

  it("reports a rejected refresh as expired and clears only that environment", async () => {
    const { auth, storage, fetch } = setup({ refreshError: "refresh_token_not_found" });
    await storage.set("resumora-auth-local", JSON.stringify(session("local", true)));
    const hostedSession = JSON.stringify(session("hosted"));
    await storage.set("resumora-auth-hosted", hostedSession);
    expect(await auth.email("local")).toBe(email);
    expect(fetch).not.toHaveBeenCalled();
    expect(await auth.accessToken("local")).toEqual({ expired: true });
    expect(await storage.get("resumora-auth-local")).toBeNull();
    expect(await storage.get("resumora-auth-hosted")).toBe(hostedSession);
    expect(await auth.email("hosted")).toBe(email);
    expect(await auth.accessToken("local")).toBeNull();
  });

  it("reports offline and keeps the stored session when refresh fetch is rejected", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const { auth, storage } = setup({ offline: true });
      const storedSession = JSON.stringify(session("local", true));
      await storage.set("resumora-auth-local", storedSession);
      const result = auth.accessToken("local");
      await vi.runAllTimersAsync();
      expect(await result).toEqual({ offline: true });
      expect(await storage.get("resumora-auth-local")).toBe(storedSession);
    } finally {
      vi.useRealTimers();
    }
  });

  it("explicitly refreshes a signed-in session", async () => {
    const { auth, storage } = setup();
    await auth.signIn("local", email, password);
    const token = await auth.refresh("local");
    const saved = JSON.parse((await storage.get("resumora-auth-local"))!);
    expect(token).toEqual(expect.any(String));
    expect(token).toBe(saved.access_token);
    expect(saved.refresh_token).toBe("local-new-refresh-token");
  });

  it("returns null when an explicit refresh fails", async () => {
    const { auth } = setup({ refreshError: "refresh_token_not_found" });
    await auth.signIn("local", email, password);
    expect(await auth.refresh("local")).toBeNull();
  });
});
