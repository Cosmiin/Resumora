import { it, expect, vi } from "vitest";
import { httpIntelligence } from "./intelligence";
it("delivers provisional wording before accepting a matching terminal result", async () => {
  const context = {
    snapshotId: crypto.randomUUID(),
    revision: 1,
    targetId: "role",
    operationId: crypto.randomUUID(),
    experience: { intent: "role" as const, fingerprint: "a".repeat(64) },
  };
  const result = {
    schemaVersion: "experience-assistant/1",
    intent: "role",
    targetId: "role",
    fingerprint: "a".repeat(64),
    text: "Prepared reports.",
    explanation: "Clearer.",
    factIds: ["a"],
  };
  const events = [
    {
      kind: "draft",
      text: "Prepared",
      seq: 0,
      operationId: context.operationId,
    },
    { kind: "ready", result, seq: 1, operationId: context.operationId },
  ];
  const client = httpIntelligence(async (_path, init) => {
    expect(new Headers(init?.headers).get("Accept")).toBe("text/event-stream");
    return new Response(
      events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join(""),
      { headers: { "Content-Type": "text/event-stream" } },
    );
  });
  const seen: string[] = [];
  expect(await client.experience!(context, false, (t) => seen.push(t))).toEqual(
    result,
  );
  expect(seen).toEqual(["Prepared"]);
});
it("does not accept a partial stream or a result from another operation", async () => {
  const context = {
    snapshotId: crypto.randomUUID(),
    revision: 1,
    targetId: "role",
    operationId: crypto.randomUUID(),
    experience: { intent: "role" as const, fingerprint: "a".repeat(64) },
  };
  const client = httpIntelligence(
    async () =>
      new Response(
        `data: ${JSON.stringify({ kind: "draft", text: "Draft", seq: 0, operationId: "another" })}\n\n`,
        { headers: { "Content-Type": "text/event-stream" } },
      ),
  );
  await expect(client.experience!(context, false, () => {})).rejects.toThrow(
    /AI_REQUEST_UNKNOWN|AI_OUTPUT_INVALID/,
  );
});
it("assembles incremental text and clears the primary draft before fallback text", async () => {
  const context = {
    snapshotId: crypto.randomUUID(),
    revision: 1,
    targetId: "role",
    operationId: crypto.randomUUID(),
    experience: { intent: "role" as const, fingerprint: "a".repeat(64) },
  };
  const result = {
    schemaVersion: "experience-assistant/1",
    intent: "role",
    targetId: "role",
    fingerprint: "a".repeat(64),
    text: "New",
    explanation: "Clearer.",
    factIds: ["a"],
  };
  const data = [
    { kind: "draft_delta", text: "Old" },
    { kind: "draft_delta", text: " draft" },
    { kind: "draft_reset", text: "" },
    { kind: "draft_delta", text: "New" },
    { kind: "ready", result },
  ];
  const client = httpIntelligence(
    async () =>
      new Response(
        data
          .map(
            (v, seq) =>
              `data: ${JSON.stringify({ ...v, seq, operationId: context.operationId })}\n\n`,
          )
          .join(""),
        { headers: { "Content-Type": "text/event-stream" } },
      ),
  );
  const seen: string[] = [];
  expect(
    await client.experience!(context, false, (text) => seen.push(text)),
  ).toEqual(result);
  expect(seen).toEqual(["Old", "Old draft", "", "New"]);
});

it("distinguishes a settled unknown receipt from an operation still processing", async () => {
  const context = {
    snapshotId: crypto.randomUUID(),
    revision: 1,
    targetId: "role",
    operationId: crypto.randomUUID(),
    experience: { intent: "questions" as const, fingerprint: "a".repeat(64) },
  };
  for (const [state, code] of [
    ["unknown", "AI_RESULT_UNAVAILABLE"],
    ["processing", "AI_REQUEST_PENDING"],
  ]) {
    const client = httpIntelligence(async (_path, init) => {
      expect(init?.method).toBe("GET");
      return Response.json({
        kind: "questions",
        state,
        input: { experience: context.experience, targetId: "role" },
        result: null,
      });
    });
    await expect(client.experience!(context, true)).rejects.toThrow(code);
  }
});

it("waits for a richer skills result past the former 45-second browser deadline", async () => {
  vi.useFakeTimers();
  const timeout = vi.spyOn(AbortSignal, "timeout").mockImplementation((ms) => {
    const c = new AbortController();
    setTimeout(() => c.abort(), ms);
    return c.signal;
  });
  try {
    const context = {
      snapshotId: crypto.randomUUID(),
      revision: 1,
      targetId: "role",
      operationId: crypto.randomUUID(),
      experience: { intent: "skills" as const, fingerprint: "a".repeat(64) },
    };
    const result = {
      schemaVersion: "experience-assistant/1",
      intent: "skills",
      targetId: "role",
      fingerprint: context.experience.fingerprint,
      skills: [],
    };
    const client = httpIntelligence(
      async (_path, init) =>
        new Promise<Response>((resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(Error("aborted")),
            { once: true },
          );
          setTimeout(() => resolve(Response.json(result)), 46000);
        }),
    );
    const pending = client.experience!(context, false).then(
      (value) => ({ value }),
      (error) => ({ error }),
    );
    await vi.advanceTimersByTimeAsync(46000);
    expect(await pending).toEqual({ value: result });
  } finally {
    timeout.mockRestore();
    vi.useRealTimers();
  }
});
