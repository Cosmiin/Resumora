import { createApp, type AppDeps } from "./app.ts";
import { supabaseVerifier } from "./auth.ts";
import { providersFromEnv } from "./ai/call-model.ts";
import { supabaseCvRepo } from "./cv/supabase-repo.ts";
import { handleImportMessage, sweepStaleImports } from "./imports/consumer.ts";
import type { ImportMessage } from "./imports/repo.ts";
import { supabaseImportAdmin, supabaseImportRepo } from "./imports/supabase-repo.ts";
import type { Env } from "./env.ts";

const log = (entry: Record<string, unknown>) => console.error(JSON.stringify(entry));

function realDeps(env: Env): AppDeps {
  return {
    appOrigin: env.APP_ORIGIN,
    verifyToken: supabaseVerifier(env),
    cvRepo: (user) => supabaseCvRepo(env, user),
    importRepo: (user) => supabaseImportRepo(env, user),
    queue: { send: async (message) => void (await env.IMPORTS.send(message)) },
    log,
  };
}

export default {
  fetch(request, env, ctx) {
    return createApp(realDeps(env)).fetch(request, env, ctx);
  },

  /** Import processing. Batches have one message (see wrangler.jsonc). */
  /** Every 5 minutes (wrangler.jsonc): fail imports that never finished and delete their files. */
  async scheduled(_controller, env) {
    await sweepStaleImports({ admin: supabaseImportAdmin(env), now: () => new Date(), log });
  },

  async queue(batch, env) {
    const admin = supabaseImportAdmin(env);
    const model = { providers: providersFromEnv(env), fetch: (...args: Parameters<typeof fetch>) => fetch(...args), logCall: admin.logCall };
    for (const msg of batch.messages) await handleImportMessage({ admin, model, log }, msg);
  },
} satisfies ExportedHandler<Env, ImportMessage>;
