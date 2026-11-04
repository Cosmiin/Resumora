import test from "node:test";
import assert from "node:assert/strict";
import {
  devOrigin,
  serviceUnit,
  devAiSummary,
  importWorkerEnabled,
  localProcessEnvironment,
} from "./dev-config.mjs";

const fullAi = {
  AI_PAID_INFERENCE: "on",
  AI_WORKER_SECRET: "s".repeat(32),
  OPENAI_API_KEY: "synthetic",
  OPENROUTER_API_KEY: "synthetic",
  AI_PROCESSING_POLICY: "local",
  OPENAI_MODEL: "model",
  OPENROUTER_MODEL: "provider/model",
  OPENROUTER_ENDPOINT: "provider/region",
  OPENAI_CV_ADMISSION_MODEL: "small",
  OPENAI_CV_EXTRACTION_MODEL: "large",
  OPENROUTER_CV_ADMISSION_MODEL: "provider/small",
  OPENROUTER_CV_EXTRACTION_MODEL: "provider/large",
  SUPABASE_URL: "https://synthetic.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_synthetic",
};
test("one configuration enables the import worker only with complete explicitly enabled AI", () => {
  assert.equal(importWorkerEnabled({}), false);
  assert.equal(
    importWorkerEnabled({ ...fullAi, AI_PAID_INFERENCE: "off" }),
    false,
  );
  assert.equal(importWorkerEnabled(fullAi), true);
  for (const key of [
    "AI_WORKER_SECRET",
    "OPENAI_CV_EXTRACTION_MODEL",
    "OPENROUTER_API_KEY",
    "SUPABASE_URL",
  ]) {
    const incomplete = { ...fullAi };
    delete incomplete[key];
    assert.throws(
      () => importWorkerEnabled(incomplete),
      (e) => e.message.includes(key) && !e.message.includes("synthetic"),
    );
  }
  assert.throws(
    () => importWorkerEnabled({ ...fullAi, AI_REASONING_EFFORT: "invalid" }),
    /AI_REASONING_EFFORT/,
  );
  assert.throws(
    () => importWorkerEnabled({ AI_PAID_INFERENCE: "yes" }),
    /AI_PAID_INFERENCE/,
  );
});
test("ambient provider credentials cannot override the configured worker or reach Vite", () => {
  const ambient = {
    PATH: "/node/bin",
    OPENAI_API_KEY: "wrong-account",
    SUPABASE_URL: "https://wrong.supabase.co",
    VITE_OPENAI_API_KEY: "leak",
    AUTH_COOKIE_KEY: "ambient",
    CAPTURE_WORKER_SECRET: "ambient-capture-secret",
    UNRELATED: "kept",
  };
  const web = localProcessEnvironment(ambient);
  assert.equal(web.PATH, ambient.PATH);
  assert.equal(web.UNRELATED, "kept");
  for (const key of [
    "OPENAI_API_KEY",
    "SUPABASE_URL",
    "VITE_OPENAI_API_KEY",
    "AUTH_COOKIE_KEY",
    "CAPTURE_WORKER_SECRET",
  ])
    assert.equal(web[key], undefined);
  const worker = localProcessEnvironment(ambient, fullAi);
  assert.equal(worker.OPENAI_API_KEY, fullAi.OPENAI_API_KEY);
  assert.equal(worker.SUPABASE_URL, fullAi.SUPABASE_URL);
  assert.equal(worker.AUTH_COOKIE_KEY, undefined);
});

test("service readiness distinguishes disabled, incomplete, and configured AI without exposing values", () => {
  assert.match(devAiSummary(""), /AI: disabled/);
  const incomplete = devAiSummary(
    "AI_PAID_INFERENCE=on\nOPENAI_API_KEY=private-key",
  );
  assert.match(incomplete, /AI: incomplete/);
  assert.match(incomplete, /AI_WORKER_SECRET/);
  assert.doesNotMatch(incomplete, /private-key/);
  const configured = [
    "AI_PAID_INFERENCE=on",
    "AI_WORKER_SECRET=" + "s".repeat(32),
    "OPENAI_API_KEY=private-key",
    "OPENROUTER_API_KEY=private-key",
    "AI_PROCESSING_POLICY=local",
    "OPENAI_MODEL=model",
    "OPENROUTER_MODEL=provider/model",
    "OPENROUTER_ENDPOINT=provider/region",
  ].join("\n");
  assert.match(devAiSummary(configured), /AI: enabled locally/);
  assert.match(devAiSummary(configured), /connectivity not checked/);
  assert.match(
    devAiSummary(
      configured.replace(
        "AI_PROCESSING_POLICY=local",
        "AI_PROCESSING_POLICY=invalid value",
      ),
    ),
    /AI: incomplete/,
  );
});

test("default dev origin remains loopback and existing auth config selects the browser port", () => {
  assert.equal(devOrigin(""), "http://127.0.0.1:5173");
  assert.equal(
    devOrigin(
      'APP_ORIGIN="http://127.0.0.1:15173"\nAPI_ORIGIN="http://127.0.0.1:15173"\nAUTH_COOKIE_KEY="private"',
    ),
    "http://127.0.0.1:15173",
  );
});
test("startup rejects mismatched or non-loopback origins without revealing private configuration", () => {
  for (const source of [
    'APP_ORIGIN="http://127.0.0.1:15173"\nAPI_ORIGIN="http://127.0.0.1:5173"',
    'APP_ORIGIN="https://example.com"',
    'APP_ORIGIN="http://localhost:15173"',
    'APP_ORIGIN="http://127.0.0.1:15173/path"',
    'APP_ORIGIN="http://private@127.0.0.1:15173"',
    'APP_ORIGIN="http://127.0.0.1:8787"',
  ])
    assert.throws(
      () => devOrigin(source),
      (e) => /APP_ORIGIN/.test(e.message) && !e.message.includes("private"),
    );
});
test("persistent service runs the paired launcher with bounded automatic recovery", () => {
  const unit = serviceUnit("/work/Resume Project", "/node/bin/node");
  assert.match(unit, /WorkingDirectory=\/work\/Resume Project\n/);
  assert.match(
    unit,
    /ExecStart="\/node\/bin\/node" "\/work\/Resume Project\/scripts\/dev.mjs"/,
  );
  assert.match(unit, /Restart=on-failure/);
  assert.match(unit, /KillMode=control-group/);
  assert.match(unit, /TimeoutStopSec=450/);
  assert.match(unit, /StartLimitBurst=5/);
  assert.doesNotMatch(unit, /SUPABASE|AUTH_COOKIE_KEY/);
});
test("systemd paths escape percent expansion and reject newlines", () => {
  assert.match(serviceUnit("/work/100%ready", "/node/bin/node"), /100%%ready/);
  assert.throws(() => serviceUnit("/work\nInjected=1", "/node/bin/node"));
});
