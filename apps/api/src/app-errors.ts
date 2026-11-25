import { createClient } from "@supabase/supabase-js";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "./app.ts";
import type { AuthUser, SupabaseEnv } from "./env.ts";
import { ApiError } from "./errors.ts";

/**
 * What the browser saw go wrong (`app_errors`): a red message shown, a failed request, or a failed step of preparing
 * Enrich changes. No status means the request never came back. Diagnostics only.
 */
export const AppErrorSchema = z.object({
  kind: z.enum(["message", "request", "step"]),
  page: z.string().max(200).optional(),
  step: z.string().max(40).optional(),
  roleId: z.string().max(100).optional(),
  path: z.string().max(200).optional(),
  status: z.number().int().optional(),
  code: z.string().max(100).optional(),
  message: z.string().max(500).optional(),
  requestId: z.string().max(100).optional(),
});
export type AppError = z.infer<typeof AppErrorSchema>;
export type AppErrorLog = (error: AppError) => Promise<void>;

/** POST /v1/errors: records one error as the signed-in user. */
export function appErrorRoutes(logFor: (user: AuthUser) => AppErrorLog) {
  const app = new Hono<AppEnv>();
  app.post("/", async (c) => {
    const body = AppErrorSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) throw new ApiError(400, "invalid_request", "Send a kind.");
    await logFor(c.get("user"))(body.data);
    return c.body(null, 204);
  });
  return app;
}

/** Writes `app_errors` rows as the signed-in user, so RLS applies. */
export function supabaseAppErrorLog(env: SupabaseEnv, user: AuthUser): AppErrorLog {
  const db = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${user.token}` } },
  });
  return async (e) => {
    const { error } = await db.from("app_errors").insert({
      kind: e.kind, page: e.page ?? null, step: e.step ?? null, role_id: e.roleId ?? null, path: e.path ?? null,
      status: e.status ?? null, code: e.code ?? null, message: e.message ?? null, request_id: e.requestId ?? null,
    });
    if (error) throw new Error(`app_errors insert failed: ${error.message}`);
  };
}
