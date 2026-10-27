import { expect, it, vi } from "vitest";
import { HttpBaseCvAdapter } from "./http-adapter";
import { blankDraft } from "./model";
import { AdapterError, type Snapshot } from "./adapter";
import { cvRoute, type CvDraftGateway } from "../../../api/src/cv/routes";
import { createDatabaseGateway } from "../../../api/src/db/supabase";

function gatewayAdapter(transport: typeof fetch) {
  const gateway = createDatabaseGateway(
    {
      SUPABASE_URL: "https://synthetic.supabase.co",
      SUPABASE_PUBLISHABLE_KEY: "sb_publishable_synthetic",
    },
    { user: { id: crypto.randomUUID() }, accessToken: "synthetic-user-token" },
    transport,
  ) as CvDraftGateway;
  const responses: Response[] = [];
  const adapter = new HttpBaseCvAdapter(async (path, init) => {
    const response = await cvRoute(
      new Request(`https://resumora.invalid${path}`, init),
      gateway,
    );
    responses.push(response.clone());
    return response;
  });
  return { gateway, adapter, responses };
}

it("preserves a pre-fetch RPC size rejection and permits a corrected save", async () => {
  const remote = vi.fn<typeof fetch>(async (_url, init) => {
    const args = JSON.parse(init!.body as string);
    return Response.json({
      id: crypto.randomUUID(),
      revision: 1,
      parentId: null,
      createdAt: new Date().toISOString(),
      reason: "autosave",
      payload: args.p_payload,
    });
  });
  const { gateway, adapter, responses } = gatewayAdapter(remote);
  const save = vi.spyOn(gateway, "saveDraft");
  const draft = blankDraft();
  draft.answers.push({
    id: "synthetic-answer",
    targetId: "synthetic-role",
    question: "context",
    questionText: "What did you do?",
    text: "",
    status: "draft",
  });
  const input = {
    draft,
    mode: "autosave" as const,
    expectedRevision: 0,
    requestId: crypto.randomUUID(),
  };
  const bytes = (value: unknown) =>
    new TextEncoder().encode(JSON.stringify(value)).length;
  draft.answers[0].text = "x".repeat(1048575 - bytes(input));
  expect(bytes(input)).toBe(1048575);
  await expect(adapter.save(input)).rejects.toMatchObject({ code: "rejected" });
  expect(save).toHaveBeenCalledTimes(1);
  expect(remote).not.toHaveBeenCalled();
  expect(responses[0].status).toBe(413);
  expect(await responses[0].json()).toEqual({
    error: { code: "invalidRequest" },
  });

  const corrected = structuredClone(draft);
  corrected.answers[0].text = "Corrected context";
  const saved = await adapter.save({
    ...input,
    draft: corrected,
    requestId: crypto.randomUUID(),
  });
  expect(saved).toMatchObject({
    revision: 1,
    reason: "autosave",
    draft: corrected,
  });
  expect(remote).toHaveBeenCalledTimes(1);
  expect(responses[1].status).toBe(200);
  expect(JSON.parse(remote.mock.calls[0][1]!.body as string)).toMatchObject({
    p_expected_revision: 0,
    p_mode: "autosave",
    p_payload: { answers: [{ text: "Corrected context" }] },
  });
});

it.each([
  ["network", 0, "", 503, null],
  ["server", 500, "", 503, null],
  ["unavailable", 503, "", 503, null],
  ["unknown rejection", 400, "PGRST_UNKNOWN", 503, null],
  ["expired", 410, "PT410", 410, "expired"],
  ["invalid command", 400, "PT400", 400, "rejected"],
  ["invalid payload", 422, "PT422", 422, "rejected"],
] as const)(
  "translates composed gateway %s without exposing diagnostics",
  async (_label, status, code, expectedStatus, expectedCode) => {
    const remote = vi.fn<typeof fetch>(async () => {
      if (!status) throw new Error("private connection details");
      return Response.json(
        {
          code,
          message:
            status === 410
              ? "REQUEST_EXPIRED_RECOVER_EXISTING_RESOURCE"
              : "private upstream details",
          details: "private user data",
        },
        { status },
      );
    });
    const { adapter, responses } = gatewayAdapter(remote);
    const error = await adapter
      .restore({
        snapshotId: crypto.randomUUID(),
        expectedRevision: 1,
        requestId: crypto.randomUUID(),
      })
      .catch((error) => error);
    expect(remote).toHaveBeenCalledTimes(1);
    expect(responses[0].status).toBe(expectedStatus);
    expect(await responses[0].json()).toEqual({
      error: {
        code:
          expectedStatus === 400 || expectedStatus === 422
            ? "invalidRequest"
            : "unavailable",
      },
    });
    if (expectedCode) {
      expect(error).toBeInstanceOf(AdapterError);
      expect(error.code).toBe(expectedCode);
    } else {
      expect(error).toBeInstanceOf(Error);
      expect(error).not.toBeInstanceOf(AdapterError);
      expect(error.message).toBe("cvRequestFailed");
    }
  },
);

it("uses authenticated transport for every operation and keeps request IDs across retries", async () => {
  const draft = blankDraft();
  const snapshot: Snapshot = {
    id: crypto.randomUUID(),
    revision: 1,
    parentId: null,
    createdAt: new Date().toISOString(),
    reason: "autosave",
    draft,
  };
  const transport = vi.fn(async (path: string, init?: RequestInit) => {
    if (path.endsWith("/history")) return Response.json([snapshot]);
    if (init?.method === "POST") return Response.json(snapshot);
    return Response.json(snapshot);
  });
  const adapter = new HttpBaseCvAdapter(transport);
  const input = {
    draft,
    mode: "autosave" as const,
    expectedRevision: 0,
    requestId: crypto.randomUUID(),
  };
  expect(adapter.capability).toBe("durable");
  expect(await adapter.save(input)).toEqual(snapshot);
  expect(await adapter.save(input)).toEqual(snapshot);
  expect(transport.mock.calls[0]).toEqual(transport.mock.calls[1]);
  const reopened = new HttpBaseCvAdapter(transport);
  expect(await reopened.load()).toEqual(snapshot);
  expect(await reopened.history()).toEqual([snapshot]);
  await reopened.restore({
    snapshotId: snapshot.id,
    expectedRevision: 1,
    requestId: crypto.randomUUID(),
  });
  expect(transport.mock.calls.map(([path]) => path)).toEqual([
    "/v1/base-cv/save",
    "/v1/base-cv/save",
    "/v1/base-cv",
    "/v1/base-cv/history",
    "/v1/base-cv/restore",
  ]);
  const posted = JSON.parse(transport.mock.calls[0][1]!.body as string);
  expect(posted).toEqual(input);
  expect(
    transport.mock.calls.every(([, init]) => init?.cache === "no-store"),
  ).toBe(true);
});
it("maps known CV errors and never falls back to a previously loaded snapshot after logout", async () => {
  let status = 401;
  const transport = vi.fn(async () =>
    Response.json({ error: { code: "unauthorized" } }, { status }),
  );
  const adapter = new HttpBaseCvAdapter(transport);
  await expect(adapter.load()).rejects.toThrow("unauthenticated");
  status = 503;
  await expect(adapter.history()).rejects.toThrow("cvRequestFailed");
  const failed = new HttpBaseCvAdapter(async () =>
    Response.json({ error: { code: "conflict" } }, { status: 409 }),
  );
  await expect(
    failed.save({
      draft: blankDraft(),
      expectedRevision: 0,
      requestId: crypto.randomUUID(),
    }),
  ).rejects.toMatchObject({ code: "conflict" });
  expect(transport).toHaveBeenCalledTimes(2);
});
it("loads every bounded history page and rejects non-progressing cursors", async () => {
  const rows: Snapshot[] = Array.from({ length: 21 }, (_, i) => ({
    id: `snapshot-${21 - i}`,
    revision: 21 - i,
    parentId: null,
    reason: "autosave",
    createdAt: new Date().toISOString(),
    draft: blankDraft(),
  }));
  const transport = vi.fn(async (path: string) =>
    Response.json(
      path.includes("beforeRevision") ? rows.slice(20) : rows.slice(0, 20),
    ),
  );
  expect(await new HttpBaseCvAdapter(transport).history()).toEqual(rows);
  expect(transport.mock.calls.map(([path]) => path)).toEqual([
    "/v1/base-cv/history",
    "/v1/base-cv/history?beforeRevision=2",
  ]);
  const stalled = new HttpBaseCvAdapter(async () =>
    Response.json(rows.slice(0, 20)),
  );
  await expect(stalled.history()).rejects.toThrow("invalidHistoryPage");
});

it.each([400, 401, 403, 404, 405, 410, 413, 415, 422])(
  "classifies HTTP %s for both save and restore recovery",
  async (status) => {
    const adapter = new HttpBaseCvAdapter(async () =>
      Response.json(
        { error: { code: status === 410 ? "unavailable" : "invalidRequest" } },
        { status },
      ),
    );
    const code =
      status === 410
        ? "expired"
        : status === 401
          ? "unauthenticated"
          : status === 403
            ? "forbidden"
            : "rejected";
    const input = { expectedRevision: 0, requestId: crypto.randomUUID() };
    await expect(
      adapter.save({ ...input, draft: blankDraft() }),
    ).rejects.toMatchObject({ code });
    await expect(
      adapter.restore({ ...input, snapshotId: crypto.randomUUID() }),
    ).rejects.toMatchObject({ code });
  },
);

it.each([408, 409, 429, 500, 503])(
  "keeps HTTP %s uncertain without a known rejection contract",
  async (status) => {
    const adapter = new HttpBaseCvAdapter(async () =>
      Response.json(
        { error: { code: status === 500 ? "conflict" : "unavailable" } },
        { status },
      ),
    );
    const error = await adapter
      .save({
        draft: blankDraft(),
        expectedRevision: 0,
        requestId: crypto.randomUUID(),
      })
      .catch((error) => error);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(AdapterError);
  },
);
