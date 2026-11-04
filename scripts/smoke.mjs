import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { readDevOrigin } from "./dev-config.mjs";

const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== "--origin"))
  throw Error("Usage: npm run smoke -- [--origin http://127.0.0.1:PORT]");
const origin =
  args[1] ?? readDevOrigin(fileURLToPath(new URL("../", import.meta.url)));
const url = new URL(origin);
if (
  url.protocol !== "http:" ||
  url.hostname !== "127.0.0.1" ||
  url.origin !== origin
)
  throw Error("Smoke requires the managed local loopback origin.");
const get = (path, method = "GET") =>
  fetch(origin + path, {
    method,
    redirect: "manual",
    signal: AbortSignal.timeout(5000),
  });
const shell = await get("/");
assert.equal(shell.status, 200);
assert.match(await shell.text(), /Resumora/);
const response = await get("/v1/health");
assert.equal(response.status, 200);
assert.match(response.headers.get("cache-control"), /no-store/);
assert.equal(response.headers.get("set-cookie"), null);
const health = await response.json();
assert.equal(health.service, "resumora-api");
assert.equal(health.environment, "development");
assert.match(health.requestId, /^[0-9a-f-]{36}$/);
const wrong = await get("/v1/health", "POST");
assert.equal(wrong.status, 405);
assert.equal(wrong.headers.get("allow"), "GET");
const session = await get("/v1/auth/session");
assert.equal(session.status, 200);
assert.match(session.headers.get("cache-control"), /no-store/);
const identity = await session.json();
assert.equal(identity.user, null);
assert.equal(typeof identity.csrfToken, "string");
for (const path of ["/v1/base-cv", "/v1/admin/ai/usage"]) {
  const denied = await get(path);
  assert.equal(denied.status, 401);
  assert.match(denied.headers.get("cache-control"), /no-store/);
}
const missing = await get("/v1/does-not-exist");
assert.equal(missing.status, 404);
console.log(
  "PASS: managed frontend, API proxy, health/methods, anonymous session and authenticated-resource protection. Providers and signed-in CV flows were not exercised.",
);
