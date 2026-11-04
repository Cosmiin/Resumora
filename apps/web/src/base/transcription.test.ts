import { expect, it, vi } from "vitest";
import { httpIntelligence } from "./intelligence";
const context = {
  snapshotId: crypto.randomUUID(),
  operationId: crypto.randomUUID(),
  revision: 3,
  targetId: "role-one",
};
it("sends bounded audio through the authenticated transport with stable request identity", async () => {
  const audio = new Blob(["synthetic-audio"], { type: "audio/webm" });
  const controller = new AbortController();
  const transport = vi.fn(async (_path: string, _init?: RequestInit) =>
    Response.json({ text: "Transcript" }),
  );
  expect(
    await httpIntelligence(transport).transcribe!(
      context,
      audio,
      controller.signal,
    ),
  ).toBe("Transcript");
  const [path, init] = transport.mock.calls[0];
  expect(path).toBe("/v1/intelligence/transcriptions");
  expect(init?.body).toBe(audio);
  expect(new Headers(init?.headers).get("X-Operation-Id")).toBe(
    context.operationId,
  );
  expect(new Headers(init?.headers).get("X-Snapshot-Revision")).toBe("3");
  expect(init?.cache).toBe("no-store");
  controller.abort();
  expect(init?.signal?.aborted).toBe(true);
});
it("does not automatically retry an unknown paid transcription", async () => {
  const transport = vi.fn(async () =>
    Response.json(
      { error: { code: "VOICE_OUTCOME_UNKNOWN" } },
      { status: 502 },
    ),
  );
  await expect(
    httpIntelligence(transport).transcribe!(
      context,
      new Blob(["audio"]),
      new AbortController().signal,
    ),
  ).rejects.toMatchObject({ code: "VOICE_OUTCOME_UNKNOWN" });
  expect(transport).toHaveBeenCalledTimes(1);
});
