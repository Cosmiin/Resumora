import test from "node:test";
import assert from "node:assert/strict";
import {
  transcriptionRoute,
  maxVoiceBytes,
} from "../src/intelligence/transcription.ts";
import { blankDraft, newRole } from "@resumora/contracts/editor/model";
import { encodeDraft } from "@resumora/contracts/editor/transport";
const env = {
  AI_PAID_INFERENCE: "on",
  AI_WORKER_SECRET: "synthetic-secret-for-tests-at-least-32",
  AI_PROCESSING_POLICY: "synthetic-global-policy",
  OPENAI_API_KEY: "synthetic-key",
};
const snapshotId = crypto.randomUUID(),
  userId = crypto.randomUUID();
const draft = blankDraft(),
  role = newRole();
draft.roles.push(role);
function request(
  operationId = crypto.randomUUID(),
  body = "synthetic-audio",
  overrides = {},
) {
  return new Request("https://local.test/v1/intelligence/transcriptions", {
    method: "POST",
    headers: {
      "Content-Type": "audio/webm;codecs=opus",
      "X-Operation-Id": operationId,
      "X-Snapshot-Id": snapshotId,
      "X-Snapshot-Revision": "2",
      "X-Target-Id": role.id,
      ...overrides,
    },
    body,
  });
}
function setup() {
  const ids = new Set(),
    starts = [],
    finishes = [];
  return {
    starts,
    finishes,
    gateway: {
      loadSnapshot: async () => ({
        id: snapshotId,
        revision: 2,
        payload: encodeDraft(draft),
      }),
      reserveEnhancement: async (input) => {
        const created = !ids.has(input.operationId);
        ids.add(input.operationId);
        return { created };
      },
      beginAttempt: async (start) => {
        starts.push(start);
        return { created: true, attempt: start };
      },
      finishAttempt: async (id, result) => {
        finishes.push(result);
        return { attemptId: id, result };
      },
    },
  };
}
test("paid switch and required configuration fail closed before any accounting or network", async () => {
  const { gateway, starts } = setup();
  const network = () => {
    throw Error("NETWORK_DENIED");
  };
  for (const changed of [
    { AI_PAID_INFERENCE: "off" },
    { OPENAI_API_KEY: "" },
    { AI_PROCESSING_POLICY: "" },
    { AI_WORKER_SECRET: "" },
  ]) {
    const result = await transcriptionRoute(
      request(),
      { ...env, ...changed },
      gateway,
      userId,
      network,
    );
    assert.equal(result.status, 503);
  }
  assert.equal(starts.length, 0);
});
test("bounded upload and owned snapshot validation happen before provider dispatch", async () => {
  const { gateway, starts } = setup();
  const network = () => {
    throw Error("NETWORK_DENIED");
  };
  for (const req of [
    request(undefined, ""),
    request(undefined, new Uint8Array(maxVoiceBytes + 1)),
    request(undefined, "x", { "Content-Length": String(maxVoiceBytes + 1) }),
    request(undefined, "x", { "Content-Type": "text/plain" }),
  ]) {
    assert.ok(
      (await transcriptionRoute(req, env, gateway, userId, network)).status >=
        400,
    );
  }
  assert.equal(
    (
      await transcriptionRoute(
        request(undefined, "audio", { "X-Target-Id": "arbitrary-target" }),
        env,
        gateway,
        userId,
        network,
      )
    ).status,
    422,
  );
  gateway.loadSnapshot = async () => null;
  assert.equal(
    (await transcriptionRoute(request(), env, gateway, userId, network)).status,
    409,
  );
  assert.equal(starts.length, 0);
});
test("one direct Whisper dispatch, private transcript, metadata-only accounting and no replay", async () => {
  const { gateway, starts, finishes } = setup();
  const id = crypto.randomUUID();
  let calls = 0;
  const network = async (url, init) => {
    calls++;
    assert.equal(url, "https://api.openai.com/v1/audio/transcriptions");
    assert.equal(init.redirect, "manual");
    assert.equal(init.body.get("model"), "whisper-1");
    assert.equal(init.body.get("file").name, "answer.webm");
    assert.equal(await init.body.get("file").text(), "synthetic-audio");
    assert.equal(init.body.has("store"), false);
    return Response.json(
      { text: "  A private transcript.  " },
      { headers: { "x-request-id": "req_test" } },
    );
  };
  const response = await transcriptionRoute(
    request(id),
    env,
    gateway,
    userId,
    network,
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { text: "A private transcript." });
  assert.match(response.headers.get("cache-control"), /no-store/);
  assert.equal(starts[0].operation, "voice_transcription");
  assert.match(starts[0].requestFingerprint, /^[a-f0-9]{64}$/);
  assert.equal(finishes[0].usage.state, "missing");
  assert.equal(finishes[0].estimatedNanoUsd, null);
  assert.equal(finishes[0].status, "completed");
  assert.equal(
    JSON.stringify({ starts, finishes }).includes("private transcript"),
    false,
  );
  assert.equal(
    JSON.stringify({ starts, finishes }).includes("synthetic-audio"),
    false,
  );
  assert.equal(
    (
      await transcriptionRoute(
        request(id, "different-audio"),
        env,
        gateway,
        userId,
        network,
      )
    ).status,
    409,
  );
  assert.equal(calls, 1);
});
test("unknown outcomes are durably recorded and never retried", async () => {
  const { gateway, finishes } = setup();
  const id = crypto.randomUUID();
  let calls = 0;
  const network = async () => {
    calls++;
    throw Error("network disappeared");
  };
  const response = await transcriptionRoute(
    request(id),
    env,
    gateway,
    userId,
    network,
  );
  assert.equal((await response.json()).error.code, "VOICE_OUTCOME_UNKNOWN");
  assert.equal(finishes[0].status, "unknown");
  await transcriptionRoute(request(id), env, gateway, userId, network);
  assert.equal(calls, 1);
});
test("provider errors and oversized output are not exposed as a transcript", async () => {
  for (const provider of [
    () => Response.json({ secret: "provider-internal" }, { status: 401 }),
    () => Response.json({ text: "x".repeat(12001) }),
    () => Response.json({ text: "" }),
  ]) {
    const { gateway } = setup();
    const response = await transcriptionRoute(
      request(),
      env,
      gateway,
      userId,
      async () => provider(),
    );
    assert.ok(response.status >= 400);
    assert.equal((await response.text()).includes("provider-internal"), false);
  }
});
