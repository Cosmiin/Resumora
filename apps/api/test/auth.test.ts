import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthApiError, AuthRetryableFetchError } from "@supabase/supabase-js";

const getClaims = vi.hoisted(() => vi.fn());
vi.mock("@supabase/supabase-js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@supabase/supabase-js")>()),
  createClient: () => ({ auth: { getClaims } }),
}));

import { supabaseVerifier } from "../src/auth.ts";

const env = { SUPABASE_URL: "http://127.0.0.1:54321", SUPABASE_ANON_KEY: "key", APP_ORIGIN: "" };

beforeEach(() => getClaims.mockReset());

describe("supabaseVerifier", () => {
  it("returns the user for a valid token", async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: "user-1" } }, error: null });
    await expect(supabaseVerifier(env)("tok")).resolves.toEqual({ id: "user-1", token: "tok" });
  });

  it("returns null for an invalid or expired token", async () => {
    getClaims.mockResolvedValue({ data: null, error: new AuthApiError("invalid JWT", 401, "bad_jwt") });
    await expect(supabaseVerifier(env)("tok")).resolves.toBeNull();
  });

  it("throws when Supabase can't be reached, so users aren't signed out", async () => {
    getClaims.mockResolvedValue({ data: null, error: new AuthRetryableFetchError("fetch failed", 0) });
    await expect(supabaseVerifier(env)("tok")).rejects.toThrow(/Supabase/);
  });

  it("throws on a Supabase server error", async () => {
    getClaims.mockResolvedValue({ data: null, error: new AuthApiError("upstream", 503, "unexpected_failure") });
    await expect(supabaseVerifier(env)("tok")).rejects.toThrow(/Supabase/);
  });
});
