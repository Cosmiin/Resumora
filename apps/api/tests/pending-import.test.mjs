import test from "node:test";
import assert from "node:assert/strict";
import { importWorkflow } from "../src/intelligence/import-workflow.ts";
import {
  intelligenceRoute,
  isIntelligencePath,
} from "../src/intelligence/routes.ts";
import { configuredIntelligenceRoute } from "../src/intelligence/configured.ts";
import { createDatabaseGateway } from "../src/db/supabase.ts";
const id = crypto.randomUUID();
const row = {
  id: crypto.randomUUID(),
  operationId: id,
  state: "ready",
  format: "pdf",
  sourceHash: "a".repeat(64),
  objectKey: "private/not-public",
  review: null,
  error: null,
};
test("empty pending import crosses the real database adapter as a successful null result", async () => {
  const gateway = createDatabaseGateway(
    { SUPABASE_URL: "https://synthetic.supabase.co", SUPABASE_PUBLISHABLE_KEY: "sb_publishable_synthetic" },
    { user: { id }, accessToken: "synthetic-token" },
    async (url) => {
      assert.ok(url.endsWith("/rpc/get_pending_cv_import"));
      return Response.json(null);
    },
  );
  const result = await configuredIntelligenceRoute(
    new Request("http://local/v1/intelligence/imports/pending"),
    { AI_PAID_INFERENCE: "off" }, gateway, id,
    async () => { throw Error("provider forbidden"); },
  );
  assert.equal(result.status, 200);
  assert.equal(await result.json(), null);
});
test("pending review metadata is an authenticated intelligence read, without inference or source contents", async () => {
  let reads = 0;
  const workflow = importWorkflow({
    store: {
      pending: async () => {
        reads++;
        return row;
      },
    },
    operations: {},
    aiEnabled: false,
    userId: "synthetic",
    processor: async () => {
      throw Error("must not parse");
    },
  });
  assert.equal(isIntelligencePath("/v1/intelligence/imports/pending"), true);
  const response = await intelligenceRoute(
    new Request("http://local/v1/intelligence/imports/pending"),
    {
      workflow,
      enabled: false,
      userId: "synthetic",
      operations: {},
      gateway: {},
    },
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  assert.deepEqual(await response.json(), {
    id,
    state: "ready",
    format: "pdf",
  });
  assert.equal(reads, 1);
  const wrong = await intelligenceRoute(
    new Request("http://local/v1/intelligence/imports/pending", {
      method: "POST",
    }),
    {
      workflow,
      enabled: false,
      userId: "synthetic",
      operations: {},
      gateway: {},
    },
  );
  assert.equal(wrong.status, 405);
  assert.equal(reads, 1);
});
test("fresh accounts without a workspace have no pending import", async () => {
  const workflow = importWorkflow({
    store: {
      pending: async () => {
        throw { code: "ACTIVE_WORKSPACE_REQUIRED" };
      },
    },
    operations: {},
    aiEnabled: false,
    userId: "synthetic",
  });
  assert.equal(await workflow.pending(), null);
});
test("configured pending-review discovery works when AI is switched off and does not invoke the provider", async () => {
  const gateway = { createImportStore: () => ({ pending: async () => row }) };
  const result = await configuredIntelligenceRoute(
    new Request("http://local/v1/intelligence/imports/pending"),
    { AI_PAID_INFERENCE: "off" },
    gateway,
    "synthetic",
    async () => {
      throw Error("provider forbidden");
    },
  );
  assert.equal(result.status, 200);
  assert.equal((await result.json()).id, id);
});
