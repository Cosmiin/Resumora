import nodeTest from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "node:net";

// The persistent service CLI intentionally supports Linux/WSL systemd only.
const test = process.platform === "linux" ? nodeTest : nodeTest.skip;

function fixture(t) {
  const directory = mkdtempSync(path.join(tmpdir(), "resumora-service-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const root = path.join(directory, "workspace"),
    home = path.join(directory, "home");
  mkdirSync(path.join(root, "apps/api"), { recursive: true });
  mkdirSync(home);
  const vars = path.join(root, "apps/api/.dev.vars");
  writeFileSync(
    vars,
    'APP_ORIGIN="http://127.0.0.1:15173"\nAPI_ORIGIN="http://127.0.0.1:15173"',
  );
  return { directory, root, home, vars };
}

test("stop disables the owned service even when application origins are invalid", async (t) => {
  const f = await runner(t);
  writeFileSync(f.vars, 'APP_ORIGIN="invalid"');
  const calls = [];
  f.options.control = (args) => calls.push(args);
  const result = await f.runService("stop", f.options);
  assert.equal(result, "Resumora stopped; automatic startup disabled.");
  assert.deepEqual(calls, [["disable", "--now", "resumora-dev.service"]]);
  assert.deepEqual(f.events, []);
});

async function runner(t) {
  const f = fixture(t);
  const { runService } = await import("./dev-service.mjs");
  const events = [];
  const options = {
    root: f.root,
    home: f.home,
    node: process.execPath,
    control(args) {
      events.push(args[0]);
      return args[0] === "is-active" ? "active" : "";
    },
    async checkPort(port) {
      events.push(`port:${port}`);
    },
    async checkReady(origin) {
      events.push(`ready:${origin}`);
    },
  };
  return { ...f, events, options, runService };
}

test("incomplete enabled AI is rejected before stopping a healthy service", async (t) => {
  const f = await runner(t);
  writeFileSync(f.vars, 'APP_ORIGIN="http://127.0.0.1:15173"\nAI_PAID_INFERENCE=on');
  await assert.rejects(f.runService("start",f.options), /Incomplete local AI configuration/);
  assert.deepEqual(f.events, []);
});

test("explicit start reconciles changed origins even when the unit contents are unchanged", async (t) => {
  const f = await runner(t);
  await f.runService("start", f.options);
  f.events.length = 0;
  writeFileSync(
    f.vars,
    'APP_ORIGIN="http://127.0.0.1:16173"\nAPI_ORIGIN="http://127.0.0.1:16173"',
  );
  await f.runService("start", f.options);
  assert.deepEqual(f.events, [
    "daemon-reload",
    "stop",
    "port:16173",
    "port:8787",
    "enable",
    "reset-failed",
    "start",
    "ready:http://127.0.0.1:16173",
    "is-active",
  ]);
});

for (const occupied of [15173, 8787]) {
  test(`occupied port ${occupied} cannot satisfy managed-service readiness`, async (t) => {
    const f = await runner(t);
    f.options.checkPort = async (port) => {
      f.events.push(`port:${port}`);
      if (port === occupied) throw new Error(`Port ${port} is already in use`);
    };
    await assert.rejects(f.runService("start", f.options), /already in use/);
    assert.ok(f.events.includes("stop"));
    assert.ok(!f.events.includes("start"));
    assert.ok(!f.events.some((event) => event.startsWith("ready:")));
  });
}

test("a healthy endpoint cannot hide a failed service after readiness", async (t) => {
  const f = await runner(t);
  f.options.control = (args) => {
    f.events.push(args[0]);
    return args[0] === "is-active" ? "failed" : "";
  };
  await assert.rejects(f.runService("start", f.options), /not active/);
  assert.ok(f.events.includes("ready:http://127.0.0.1:15173"));
});

test("refuses to manage a service owned by another workspace before stopping or probing ports", async (t) => {
  const f = await runner(t);
  const directory = path.join(f.home, ".config/systemd/user");
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    path.join(directory, "resumora-dev.service"),
    "# Workspace: /someone/else\n",
  );
  await assert.rejects(f.runService("start", f.options), /another workspace/);
  assert.deepEqual(f.events, []);
});

test("port availability rejects a real listener without terminating it and releases its own probe", async (t) => {
  const { assertPortFree } = await import("./dev-service.mjs");
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => {
    if (server.listening) server.close();
  });
  const port = server.address().port;
  await assert.rejects(
    assertPortFree(port),
    new RegExp(`Port ${port} is already in use`),
  );
  assert.equal(server.listening, true);
  await new Promise((resolve) => server.close(resolve));
  await assertPortFree(port);
  // The check must not retain a listener and steal the port from the actual service.
  await new Promise((resolve, reject) =>
    server.once("error", reject).listen(port, "127.0.0.1", resolve),
  );
});
