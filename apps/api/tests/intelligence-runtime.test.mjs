import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import {
  Miniflare,
  Response as RuntimeResponse,
  convertV4MiniflareOptions,
} from "miniflare";
import { saveSession, authHeaders } from "../src/auth/session.ts";
test("mounted native Worker keeps auth/CSRF on raw import and rejects paid-off before storage/AI", async () => {
  const env = {
    APP_ENV: "development",
    APP_ORIGIN: "http://127.0.0.1:5173",
    API_ORIGIN: "http://127.0.0.1:5173",
    SUPABASE_URL: "https://synthetic.supabase.co",
    SUPABASE_PUBLISHABLE_KEY: "sb_publishable_synthetic",
    AUTH_COOKIE_KEY: Buffer.alloc(32, 9).toString("base64"),
    AI_PAID_INFERENCE: "off",
    OPENAI_API_KEY: "synthetic-unused",
    OPENROUTER_API_KEY: "synthetic-unused",
  };
  const user = {
      id: crypto.randomUUID(),
      email: "synthetic@example.invalid",
      email_confirmed_at: "2026-01-01T00:00:00Z",
    },
    csrf = crypto.randomUUID();
  const token =
    "eyJhbGciOiJIUzI1NiJ9." +
    Buffer.from(
      JSON.stringify({
        sub: user.id,
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    ).toString("base64url") +
    ".synthetic";
  const headers = authHeaders();
  await saveSession(
    headers,
    env,
    {
      access_token: token,
      refresh_token: "synthetic-refresh",
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user,
    },
    false,
    csrf,
  );
  const cookie = headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  const bundle = await build({
    entryPoints: [fileURLToPath(new URL("../src/index.ts", import.meta.url))],
    bundle: true,
    write: false,
    format: "esm",
    platform: "browser",
  });
  const calls = [];
  const runtime = new Miniflare(
    convertV4MiniflareOptions({
      script: bundle.outputFiles[0].text,
      modules: true,
      compatibilityDate: "2026-10-25",
      host: "127.0.0.1",
      port: 0,
      unsafeRegisterWorker: false,
      bindings: env,
      outboundService: async (r) => {
        calls.push(r.url);
        assert.equal(
          r.url,
          env.SUPABASE_URL + "/auth/v1/user",
          "No DB/Storage/provider call allowed",
        );
        assert.equal(r.headers.get("Authorization"), "Bearer " + token);
        return RuntimeResponse.json(user);
      },
    }),
  );
  try {
    const origin = (await runtime.ready).origin;
    const post = async (path, extra = {}, signed = true) =>
      fetch(origin + path, {
        method: "POST",
        headers: {
          "Content-Type": path.endsWith("/imports")
            ? "application/octet-stream"
            : "application/json",
          Origin: env.APP_ORIGIN,
          ...(signed ? { Cookie: cookie } : {}),
          ...extra,
        },
        body: path.endsWith("/imports") ? "%PDF-1.7 synthetic" : "{}",
      });
    for (const path of [
      "/v1/intelligence/imports",
      "/v1/intelligence/questions",
      "/v1/intelligence/rewrite",
    ])
      assert.equal((await post(path, {}, false)).status, 401);
    assert.equal(calls.length, 0);
    assert.equal((await post("/v1/intelligence/imports")).status, 403);
    assert.equal(
      (
        await post("/v1/intelligence/imports", {
          "X-CSRF-Token": csrf,
          Origin: "https://foreign.invalid",
        })
      ).status,
      403,
    );
    const off = await post("/v1/intelligence/imports", {
      "X-CSRF-Token": csrf,
    });
    assert.equal(off.status, 503);
    assert.equal((await off.json()).error.code, "AI_DISABLED");
    assert.equal(
      (await post("/v1/intelligence/questions", { "X-CSRF-Token": csrf }))
        .status,
      503,
    );
    assert.ok(calls.every((url) => url.endsWith("/auth/v1/user")));
  } finally {
    await runtime.dispose();
  }
});
