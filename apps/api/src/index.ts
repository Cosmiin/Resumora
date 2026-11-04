import { createApp, type AppDeps } from "./app.ts";
import { supabaseVerifier } from "./auth.ts";
import { ApiError } from "./errors.ts";
import type { Env } from "./env.ts";

function realDeps(env: Env): AppDeps {
  return {
    appOrigin: env.APP_ORIGIN,
    verifyToken: supabaseVerifier(env),
    cvRepo: () => {
      throw new ApiError(501, "not_implemented", "CV storage is not available yet.");
    },
    log: (entry) => console.error(JSON.stringify(entry)),
  };
}

export default {
  fetch(request, env, ctx) {
    return createApp(realDeps(env)).fetch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
