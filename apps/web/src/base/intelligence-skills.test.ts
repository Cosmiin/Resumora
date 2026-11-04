import { expect, it, vi } from "vitest";
import { httpIntelligence } from "./intelligence";
import { blankDraft, fact } from "./model";
import { getSkillInventory } from "@resumora/contracts/intelligence/skills-improvement";
it("stops receipt polling when the skills attempt is aborted", async () => {
  vi.useFakeTimers();
  try {
    const abort = new AbortController();
    const transport = vi.fn(async (_path: string, _init?: RequestInit) => {
      throw Error("offline");
    });
    const client = httpIntelligence(transport);
    const pending = expect(
      client.improveSkills!(
        {
          snapshotId: "saved",
          revision: 1,
          targetId: "profile",
          operationId: "old",
          fingerprint: "a".repeat(64),
        },
        false,
        abort.signal,
      ),
    ).rejects.toThrow("SKILLS_TIMEOUT");
    await vi.advanceTimersByTimeAsync(1);
    abort.abort();
    await vi.advanceTimersByTimeAsync(10000);
    await pending;
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport.mock.calls[0][1]?.signal?.aborted).toBe(true);
  } finally {
    vi.useRealTimers();
  }
});
it("recovers the same improvement via GET and rejects unrelated receipts and malformed inventories", async () => {
  const context = {
    snapshotId: crypto.randomUUID(),
    revision: 1,
    targetId: "profile",
    operationId: crypto.randomUUID(),
    fingerprint: "a".repeat(64),
  };
  const inventory = getSkillInventory(blankDraft());
  inventory.technicalSkills = [fact("SQL")];
  const result = {
    schemaVersion: "skills-improvement/1",
    fingerprint: context.fingerprint,
    inventory,
    removed: [],
  };
  const methods: string[] = [];
  const client = httpIntelligence(async (path, init) => {
    methods.push(init?.method ?? "GET");
    return Response.json(
      init?.method === "POST"
        ? result
        : {
            kind: "rewrite",
            input: { ...context, skillsImprovement: true },
            state: "ready",
            result,
          },
    );
  });
  expect(await client.improveSkills!(context)).toEqual(result);
  expect(await client.improveSkills!(context, true)).toEqual(result);
  expect(methods).toEqual(["POST", "GET"]);
  const bad = httpIntelligence(async () =>
    Response.json({ ...result, fingerprint: "b".repeat(64) }),
  );
  await expect(bad.improveSkills!(context)).rejects.toThrow(
    "AI_OUTPUT_INVALID",
  );
  const foreign = httpIntelligence(async () =>
    Response.json({
      kind: "rewrite",
      input: { ...context, targetId: "another", skillsImprovement: true },
      state: "ready",
      result,
    }),
  );
  await expect(foreign.improveSkills!(context, true)).rejects.toThrow(
    "IDEMPOTENCY_BODY_MISMATCH",
  );
  for (const [state, code] of [["failed", "AI_OUTPUT_INVALID"]]) {
    const recovering = httpIntelligence(async (_, init) => {
      expect(init?.method).toBe("GET");
      return Response.json({
        kind: "rewrite",
        input: { ...context, skillsImprovement: true },
        state,
      });
    });
    await expect(recovering.improveSkills!(context, true)).rejects.toThrow(
      code,
    );
  }
});
it("automatically recovers a lost improvement response without another paid request", async () => {
  const context = {
    snapshotId: "saved",
    revision: 1,
    targetId: "profile",
    operationId: "operation",
    fingerprint: "a".repeat(64),
  };
  const result = {
    schemaVersion: "skills-improvement/1",
    fingerprint: context.fingerprint,
    inventory: getSkillInventory(blankDraft()),
    removed: [],
  };
  const methods: string[] = [];
  const client = httpIntelligence(async (_, init) => {
    methods.push(init?.method ?? "GET");
    if (init?.method === "POST") throw Error("offline");
    return Response.json({
      kind: "rewrite",
      input: { ...context, skillsImprovement: true },
      state: "ready",
      result,
    });
  });
  vi.useFakeTimers();
  try {
    const pending = client.improveSkills!(context);
    await vi.advanceTimersByTimeAsync(8000);
    expect(await pending).toEqual(result);
    expect(methods).toEqual(["POST", "GET"]);
  } finally {
    vi.useRealTimers();
  }
});
it("bounds automatic receipt retries and keeps unknown operations from generating again", async () => {
  const context = {
    snapshotId: "saved",
    revision: 1,
    targetId: "profile",
    operationId: "operation",
    fingerprint: "a".repeat(64),
  };
  const methods: string[] = [];
  const client = httpIntelligence(async (_, init) => {
    methods.push(init?.method ?? "GET");
    return Response.json({
      kind: "rewrite",
      input: { ...context, skillsImprovement: true },
      state: "unknown",
    });
  });
  vi.useFakeTimers();
  try {
    const pending = expect(
      client.improveSkills!(context, true),
    ).rejects.toThrow("AI_RESULT_UNAVAILABLE");
    await vi.advanceTimersByTimeAsync(8000);
    await pending;
    expect(methods).toEqual(["GET", "GET", "GET", "GET"]);
  } finally {
    vi.useRealTimers();
  }
});
it("resends the identical request once only after the receipt is missing", async () => {
  const context = {
    snapshotId: "saved",
    revision: 1,
    targetId: "profile",
    operationId: "operation",
    fingerprint: "a".repeat(64),
  };
  const bodies: string[] = [];
  let posts = 0;
  const result = {
    schemaVersion: "skills-improvement/1",
    fingerprint: context.fingerprint,
    inventory: getSkillInventory(blankDraft()),
    removed: [],
  };
  const client = httpIntelligence(async (_, init) => {
    if (init?.method === "POST") {
      bodies.push(String(init.body));
      if (++posts === 1) throw Error("disconnected before submission");
      return Response.json(result);
    }
    return Response.json({ error: { code: "MISSING" } }, { status: 404 });
  });
  vi.useFakeTimers();
  try {
    const pending = client.improveSkills!(context);
    await vi.advanceTimersByTimeAsync(8000);
    expect(await pending).toEqual(result);
    expect(bodies).toHaveLength(2);
    expect(bodies[0]).toBe(bodies[1]);
  } finally {
    vi.useRealTimers();
  }
});
