import { expect, it, vi } from "vitest";
import { HttpBaseCvAdapter } from "./http-adapter";
import { blankDraft } from "./model";
import { AdapterError, type Snapshot } from "./adapter";

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
