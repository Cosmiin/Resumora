import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { AuthRetryableFetchError } from "@supabase/supabase-js";

const auth = vi.hoisted(() => ({
  getSession: vi.fn(),
  refreshSession: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock("./supabase.ts", () => ({ supabase: { auth } }));

import { ApiClientError, apiFetch } from "./api.ts";

const Ok = z.object({ ok: z.boolean() });
const session = (token: string) => ({ data: { session: { access_token: token } }, error: null });
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.resetAllMocks();
  auth.getSession.mockResolvedValue(session("token-1"));
  auth.refreshSession.mockResolvedValue(session("token-2"));
  auth.signOut.mockResolvedValue({ error: null });
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

const authHeader = (call: number) =>
  new Headers((fetchMock.mock.calls[call]?.[1] as RequestInit).headers).get("authorization");

describe("apiFetch", () => {
  it("adds bearer token", async () => {
    fetchMock.mockResolvedValue(json(200, { ok: true }));
    await expect(apiFetch("/v1/cv", { schema: Ok })).resolves.toEqual({ ok: true });
    expect(authHeader(0)).toBe("Bearer token-1");
  });

  it("retries once after refresh", async () => {
    fetchMock
      .mockResolvedValueOnce(json(401, { error: { code: "unauthorized", message: "", requestId: "r" } }))
      .mockResolvedValueOnce(json(200, { ok: true }));
    await expect(apiFetch("/v1/cv", { schema: Ok })).resolves.toEqual({ ok: true });
    expect(auth.refreshSession).toHaveBeenCalledTimes(1);
    expect(authHeader(1)).toBe("Bearer token-2");
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it("signs out after second 401", async () => {
    fetchMock.mockResolvedValue(json(401, { error: { code: "unauthorized", message: "", requestId: "r" } }));
    await expect(apiFetch("/v1/cv", { schema: Ok })).rejects.toMatchObject({ status: 401, code: "unauthorized" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(auth.signOut).toHaveBeenCalledTimes(1);
  });

  it("keeps the session when the refresh can't reach Supabase", async () => {
    fetchMock.mockResolvedValue(json(401, { error: { code: "unauthorized", message: "", requestId: "r" } }));
    auth.refreshSession.mockResolvedValue({ data: { session: null }, error: new AuthRetryableFetchError("fetch failed", 0) });
    await expect(apiFetch("/v1/cv", { schema: Ok })).rejects.toMatchObject({ status: 0, code: "network" });
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it("maps error body", async () => {
    const body = {
      error: { code: "version_conflict", message: "Saved elsewhere", requestId: "r-9" },
      current: { version: 3, updatedAt: "2026-11-04T10:00:00Z" },
    };
    fetchMock.mockResolvedValue(json(409, body));
    const err = await apiFetch("/v1/cv", { method: "PUT", schema: Ok }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiClientError);
    expect(err).toMatchObject({ status: 409, code: "version_conflict", message: "Saved elsewhere", body });
  });

  it("reports network failures", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(apiFetch("/v1/cv", { schema: Ok })).rejects.toMatchObject({ status: 0, code: "network" });
  });
});
