import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";

const auth = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("../../lib/supabase.ts", () => ({ supabase: { auth } }));

import { brainDump, improveBullet, roleFacts } from "./enrich-api.ts";

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.resetAllMocks();
  auth.getSession.mockResolvedValue({ data: { session: { access_token: "token-1" } }, error: null });
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

describe("focus API", () => {
  const cases = [
    {
      name: "improveBullet",
      call: () => improveBullet({ roleId: "r1", bulletId: "b1", fingerprint: "saved-1" }),
      path: "/v1/enrich/improve-bullet",
      body: { roleId: "r1", bulletId: "b1", fingerprint: "saved-1" },
      answer: { proposal: { bulletId: "b1", text: "Built APIs" }, bulletBefore: 43, bulletAfter: 80, roleBefore: null, roleAfter: 80, cached: true },
      invalid: { needsDetail: false },
    },
    {
      name: "brainDump",
      call: () => brainDump({ roleId: "r1", fingerprint: "saved-1" }),
      path: "/v1/enrich/brain-dump",
      body: { roleId: "r1", fingerprint: "saved-1" },
      answer: { proposals: [{ id: "p1", text: "Built APIs", score: 80 }], roleBefore: null, roleAfterAll: 80 },
      invalid: { proposals: [{ id: "p1", text: "Built APIs", score: "80" }], roleBefore: null, roleAfterAll: 80 },
    },
    {
      name: "roleFacts",
      call: () => roleFacts("r1"),
      path: "/v1/enrich/role-facts",
      body: { roleId: "r1" },
      answer: { facts: ["Built APIs"], fromNotes: "notes-1" },
      invalid: { facts: ["Built APIs"] },
    },
  ];

  for (const c of cases) {
    it(c.name + " posts the expected body as the signed-in user and parses the answer", async () => {
      fetchMock.mockResolvedValue(Response.json(c.answer));
      await expect(c.call()).resolves.toEqual(c.answer);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [path, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(path).toBe(c.path);
      expect(init.method).toBe("POST");
      expect(JSON.parse(init.body as string)).toEqual(c.body);
      expect(new Headers(init.headers).get("authorization")).toBe("Bearer token-1");
    });

    it(c.name + " rejects an answer that fails its schema", async () => {
      fetchMock.mockResolvedValue(Response.json(c.invalid));
      await expect(c.call()).rejects.toBeInstanceOf(ZodError);
    });
  }

  it("improveBullet accepts a request for more detail", async () => {
    fetchMock.mockResolvedValue(Response.json({ needsDetail: true, nextQuestion: null }));
    await expect(improveBullet({ roleId: "r1", bulletId: "b1", fingerprint: "saved-1" })).resolves.toEqual({ needsDetail: true, nextQuestion: null });
  });
});
