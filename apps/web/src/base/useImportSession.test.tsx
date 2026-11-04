import { StrictMode } from "react";
import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useImportSession } from "./useImportSession";
import {
  checkedImportStatus,
  type ImportStatus,
  type IntelligenceClient,
} from "./intelligence";
import type { ImportTimingEvent } from "@resumora/contracts/intelligence/import-timing";
const ready: ImportStatus = {
  id: "operation",
  state: "ready",
  review: {
    id: "source",
    format: "pdf",
    sourceHash: "a".repeat(64),
    parserVersion: "synthetic",
    pages: 1,
    admission: { kind: "cv", reason: "CV", pages: [1] },
    confirmedIds: [],
    extraction: {
      schemaVersion: "cv-extraction/1",
      candidates: [
        {
          id: "name",
          path: "name",
          value: "Fictional Person",
          quote: "Fictional Person",
          page: 1,
          confidence: "high",
        },
      ],
      warnings: [],
      omittedPages: [],
    },
  },
};
function clientWith(read: () => Promise<ImportStatus>) {
  return {
    importStatus: vi.fn(read),
    listImports: vi.fn(async () => []),
    cancelImport: vi.fn(async () => {}),
    importDocument: vi.fn(async (_file, id) => ({
      id,
      state: "uploaded",
      stage: "queued",
    })),
  } as unknown as IntelligenceClient;
}
afterEach(() => vi.useRealTimers());
it("observes ready once in the browser clock after polling, without claiming server duration", async () => {
  vi.useFakeTimers();
  const events: ImportTimingEvent[] = [];
  let status: ImportStatus = {
      id: "operation",
      state: "processing",
      stage: "extracting",
    },
    now = 10;
  const client = clientWith(async () => status);
  const { result } = renderHook(
    () =>
      useImportSession({
        client,
        revision: 0,
        openImportId: "operation",
        timingOptions: {
          now: () => now,
          emit: (e) => {
            events.push(e);
          },
        },
      }),
    { wrapper: StrictMode },
  );
  await act(async () => {});
  expect(events.filter((e) => e.edge === "complete")).toEqual([]);
  status = ready;
  now = 1510;
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1500);
  });
  expect(result.current.status).toEqual(ready);
  expect(
    events
      .filter((e) => e.phase === "browser_discovery" && e.edge === "complete")
      .map((e) => e.durationMs),
  ).toEqual([1500]);
  expect(events.every((e) => e.domain === "browser")).toBe(true);
  expect(JSON.stringify(events)).not.toMatch(
    /sourceHash|candidates|reason|synthetic/,
  );
  await act(async () => {
    await result.current.check();
  });
  expect(events.filter((e) => e.edge === "complete")).toHaveLength(1);
  expect(client.importDocument).not.toHaveBeenCalled();
});
it("a stale recovery response cannot complete the newer operation's discovery timing", async () => {
  const events: ImportTimingEvent[] = [];
  let resolve!: (value: ImportStatus) => void;
  const client = clientWith(
    () =>
      new Promise((yes) => {
        resolve = yes;
      }),
  );
  const { result, rerender } = renderHook(
    ({ id }) =>
      useImportSession({
        client,
        revision: 0,
        openImportId: id,
        timingOptions: {
          emit: (e) => {
            events.push(e);
          },
        },
      }),
    { initialProps: { id: "old-operation" } },
  );
  const oldResponse = resolve;
  rerender({ id: "new-operation" });
  await act(async () => {
    oldResponse(ready);
  });
  expect(result.current.status).toBeNull();
  expect(events.filter((e) => e.edge === "complete")).toEqual([]);
});
it("one selected operation cannot be uploaded twice before React renders busy state", async () => {
  const client = clientWith(async () => ready);
  const { result } = renderHook(() =>
    useImportSession({ client, revision: 0 }),
  );
  await act(async () => {
    result.current.select([
      new File(["%PDF"], "private-name.pdf"),
    ] as unknown as FileList);
  });
  await act(async () => {
    await Promise.all([result.current.upload(), result.current.upload()]);
  });
  expect(client.importDocument).toHaveBeenCalledTimes(1);
});
it("public status validation distinguishes metadata from a usable review and rejects private fields", () => {
  expect(
    checkedImportStatus({ id: "operation", state: "ready" }, false),
  ).toEqual({ id: "operation", state: "ready" });
  for (const value of [
    null,
    { id: "operation", state: "invented" },
    { ...ready, review: { id: "source" } },
    { ...ready, lease: "private" },
    { ...ready, stage: "invented" },
    { id: "operation", state: "ready" },
  ]) {
    expect(() => checkedImportStatus(value)).toThrow(
      "IMPORT_STATUS_UNAVAILABLE",
    );
  }
  expect(checkedImportStatus(ready)).toBe(ready);
});

it("keeps a pending poll alive when the same authenticated transport gets a new client wrapper", async () => {
  const sessionIdentity = {};
  let finish!: (value: ImportStatus) => void;
  const client = clientWith(async () => ({
    id: "operation",
    state: "processing",
    stage: "extracting",
  }));
  client.sessionIdentity = sessionIdentity;
  const { result, rerender } = renderHook(
    ({ current }) =>
      useImportSession({
        client: current,
        revision: 0,
        openImportId: "operation",
      }),
    { initialProps: { current: client } },
  );
  await act(async () => {});
  vi.mocked(client.importStatus).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  let pending!: Promise<void>;
  act(() => {
    pending = result.current.check();
  });
  expect(result.current.busy).toBe(true);
  rerender({ current: { ...client } });
  await act(async () => {
    finish(ready);
    await pending;
  });
  expect(result.current.status).toEqual(ready);
  expect(result.current.busy).toBe(false);
  expect(client.importStatus).toHaveBeenCalledTimes(2);
});
