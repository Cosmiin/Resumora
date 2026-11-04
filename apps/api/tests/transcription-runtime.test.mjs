import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import {
  Miniflare,
  Response as RuntimeResponse,
  convertV4MiniflareOptions,
} from "miniflare";
import { bundleWorker } from "./bundle-worker.mjs";
import { authHeaders, saveSession } from "../src/auth/session.ts";
import { blankDraft, newRole } from "@resumora/contracts/editor/model";
import { encodeDraft } from "@resumora/contracts/editor/transport";

test(
  "mounted transcription endpoint enforces account, Origin and CSRF before paid dispatch",
  { timeout: 45000 },
  async () => {
    const user = {
      id: crypto.randomUUID(),
      email: "voice@synthetic.invalid",
      email_confirmed_at: "2026-01-01T00:00:00Z",
    };
    const snapshotId = crypto.randomUUID();
    const draft = blankDraft(),
      role = newRole();
    draft.roles.push(role);
    const env = {
      APP_ENV: "development",
      APP_ORIGIN: "http://127.0.0.1:5173",
      API_ORIGIN: "http://127.0.0.1:5173",
      SUPABASE_URL: "https://synthetic.supabase.co",
      SUPABASE_PUBLISHABLE_KEY: "sb_publishable_synthetic",
      AUTH_COOKIE_KEY: Buffer.alloc(32, 19).toString("base64"),
      AI_PAID_INFERENCE: "on",
      AI_WORKER_SECRET: "synthetic-worker-secret-at-least-32-characters",
      AI_PROCESSING_POLICY: "synthetic-global",
      OPENAI_API_KEY: "synthetic-key",
    };
    const expires = Math.floor(Date.now() / 1000) + 3600;
    const access =
      "eyJhbGciOiJIUzI1NiJ9." +
      Buffer.from(JSON.stringify({ sub: user.id, exp: expires })).toString(
        "base64url",
      ) +
      ".synthetic";
    const headers = authHeaders();
    await saveSession(
      headers,
      env,
      {
        access_token: access,
        refresh_token: "synthetic-refresh",
        expires_at: expires,
        user,
      },
      false,
      "synthetic-csrf",
    );
    const cookie = headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; ");
    const bundle = await bundleWorker({
      entryPoints: [fileURLToPath(new URL("../src/index.ts", import.meta.url))],
      bundle: true,
      write: false,
      format: "esm",
      platform: "browser",
    });
    let providerCalls = 0,
      reservations = 0,
      finishes = 0;
    const runtime = new Miniflare(
      convertV4MiniflareOptions({
        modules: [
          {
            type: "ESModule",
            path: "entry.mjs",
            contents: bundle.outputFiles[0].text,
          },
          ...bundle.wasm,
        ],
        compatibilityDate: "2026-10-25",
        host: "127.0.0.1",
        port: 0,
        unsafeRegisterWorker: false,
        bindings: env,
        outboundService: async (request) => {
          const url = new URL(request.url);
          if (
            request.url === "https://api.openai.com/v1/audio/transcriptions"
          ) {
            providerCalls++;
            const form = await request.formData();
            assert.equal(form.get("model"), "whisper-1");
            return RuntimeResponse.json({ text: "Synthetic spoken answer" });
          }
          assert.equal(
            url.origin,
            env.SUPABASE_URL,
            "All external traffic must be synthetic",
          );
          if (url.pathname === "/auth/v1/user")
            return RuntimeResponse.json(user);
          const body = await request.json();
          if (url.pathname.endsWith("/load_editor_snapshot"))
            return RuntimeResponse.json({
              id: snapshotId,
              revision: 1,
              payload: encodeDraft(draft),
            });
          if (url.pathname.endsWith("/reserve_enhancement")) {
            reservations++;
            return RuntimeResponse.json({ created: true });
          }
          if (url.pathname.endsWith("/begin_ai_attempt"))
            return RuntimeResponse.json({
              created: true,
              attempt: body.p_start,
            });
          if (url.pathname.endsWith("/finish_ai_attempt")) {
            finishes++;
            return RuntimeResponse.json(body.p_result);
          }
          throw Error(`Unexpected synthetic request ${url.pathname}`);
        },
      }),
    );
    try {
      const origin = (await runtime.ready).origin;
      const validHeaders = {
        Cookie: cookie,
        Origin: env.APP_ORIGIN,
        "X-CSRF-Token": "synthetic-csrf",
        "X-Resumora-Account": user.id,
        "Content-Type": "audio/webm",
        "X-Operation-Id": crypto.randomUUID(),
        "X-Snapshot-Id": snapshotId,
        "X-Snapshot-Revision": "1",
        "X-Target-Id": role.id,
      };
      for (const [changed, expected] of [
        [{ Cookie: "" }, 401],
        [{ "X-Resumora-Account": "wrong" }, 401],
        [{ Origin: "https://wrong.invalid" }, 403],
        [{ "X-CSRF-Token": "wrong" }, 403],
        [{ "Content-Type": "text/plain" }, 403],
      ]) {
        const response = await fetch(
          origin + "/v1/intelligence/transcriptions",
          {
            method: "POST",
            headers: { ...validHeaders, ...changed },
            body: "synthetic-audio",
          },
        );
        assert.equal(response.status, expected);
      }
      assert.equal(providerCalls, 0);
      assert.equal(reservations, 0);
      const response = await fetch(origin + "/v1/intelligence/transcriptions", {
        method: "POST",
        headers: validHeaders,
        body: "synthetic-audio",
      });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), {
        text: "Synthetic spoken answer",
      });
      assert.equal(providerCalls, 1);
      assert.equal(reservations, 1);
      assert.equal(finishes, 1);
    } finally {
      await runtime.dispose();
    }
  },
);
