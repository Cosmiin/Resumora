import test from "node:test";
import assert from "node:assert/strict";
import { isWorkspacePath, workspaceRoute } from "../src/workspace/routes.ts";
const id = "11111111-1111-4111-8111-111111111111";
test("private workspace dispatch retains operation reads and draft recovery", () => {
  assert.ok(isWorkspacePath("/v1/workspace-drafts/resume/" + id));
  assert.ok(isWorkspacePath("/v1/intelligence/operations/" + id));
  assert.equal(isWorkspacePath("/other"), false);
});
test("draft saving rejects open shapes and retains the profile-generation fence", async () => {
  let saved;
  const gateway = {
    saveWorkspaceDraft: async (i) => (
      (saved = i),
      { id: i.id, kind: i.kind, revision: 1, value: i.value }
    ),
  };
  const request = (value, extra = {}) =>
    new Request("https://app.invalid/v1/workspace-drafts/resume/" + id, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        requestId: id,
        expectedRevision: 0,
        value,
        ...extra,
      }),
    });
  const response = await workspaceRoute(
    request({ route: "#/profile" }),
    {},
    gateway,
    "owner",
  );
  assert.equal(response.status, 200);
  assert.equal(saved.value.route, "#/profile");
  assert.equal(
    (
      await workspaceRoute(
        request({ route: "#/profile", execute: "untrusted" }),
        {},
        gateway,
        "owner",
      )
    ).status,
    400,
  );
});
