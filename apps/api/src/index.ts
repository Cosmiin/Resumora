import { createApp, type AppDeps } from "./app.ts";
import { supabaseVerifier } from "./auth.ts";
import { providersFromEnv } from "./ai/call-model.ts";
import { supabaseCvRepo } from "./cv/supabase-repo.ts";
import { supabaseAiCallLogger, supabaseInsightsRepo } from "./enrich/supabase-repo.ts";
import { handleImportMessage, sweepStaleImports } from "./imports/consumer.ts";
import type { ImportMessage } from "./imports/repo.ts";
import { supabaseImportAdmin, supabaseImportRepo } from "./imports/supabase-repo.ts";
import { handleJobMessage } from "./jobs/consumer.ts";
import type { JobMessage } from "./jobs/repo.ts";
import { supabaseJobAdmin, supabaseJobRepo } from "./jobs/supabase-repo.ts";
import { supabaseTailorAdmin, supabaseTailorRepo } from "./tailor/supabase-repo.ts";
import type { Env } from "./env.ts";
import type { LogFn } from "./errors.ts";

const log = (entry: Record<string, unknown>) => console.error(JSON.stringify(entry));

export async function dispatchBatch(
  deps: {
    jobs(msg: Message<JobMessage>): Promise<void>;
    imports(msg: Message<ImportMessage>): Promise<void>;
    log: LogFn;
  },
  batch: MessageBatch<ImportMessage | JobMessage>,
): Promise<void> {
  if (batch.queue === "resumora-jobs") {
    for (const msg of batch.messages) await deps.jobs(msg as Message<JobMessage>);
  } else if (batch.queue === "resumora-imports") {
    for (const msg of batch.messages) await deps.imports(msg as Message<ImportMessage>);
  } else {
    deps.log({ msg: "unknown queue", queue: batch.queue });
    batch.ackAll();
  }
}

function realDeps(env: Env): AppDeps {
  return {
    appOrigin: env.APP_ORIGIN,
    verifyToken: supabaseVerifier(env),
    cvRepo: (user) => supabaseCvRepo(env, user),
    importRepo: (user) => supabaseImportRepo(env, user),
    jobRepo: (user) => supabaseJobRepo(env, user),
    tailorRepo: (user) => supabaseTailorRepo(env, user),
    insightsRepo: (user) => supabaseInsightsRepo(env, user),
    model: (user) => ({
      providers: providersFromEnv(env),
      fetch: (...args: Parameters<typeof fetch>) => fetch(...args),
      logCall: supabaseAiCallLogger(env, user),
    }),
    voice: (user) => ({
      fetch: (...args: Parameters<typeof fetch>) => fetch(...args),
      apiKey: env.OPENAI_API_KEY,
      logCall: supabaseAiCallLogger(env, user),
    }),
    queue: { send: async (message) => void (await env.IMPORTS.send(message)) },
    jobQueue: { send: async (message) => void (await env.JOBS.send(message)) },
    log,
  };
}

export default {
  fetch(request, env, ctx) {
    return createApp(realDeps(env)).fetch(request, env, ctx);
  },

  /** Every 5 minutes (wrangler.jsonc): fail imports that never finished and delete their files. */
  async scheduled(_controller, env) {
    await sweepStaleImports({ admin: supabaseImportAdmin(env), now: () => new Date(), log });
  },

  async queue(batch, env) {
    await dispatchBatch({
      async jobs(msg) {
        const admin = supabaseJobAdmin(env);
        const model = { providers: providersFromEnv(env), fetch: (...args: Parameters<typeof fetch>) => fetch(...args), logCall: admin.logCall };
        await handleJobMessage({ admin, model, log, ...supabaseTailorAdmin(env) }, msg);
      },
      async imports(msg) {
        const admin = supabaseImportAdmin(env);
        const model = { providers: providersFromEnv(env), fetch: (...args: Parameters<typeof fetch>) => fetch(...args), logCall: admin.logCall };
        await handleImportMessage({ admin, model, log }, msg);
      },
      log,
    }, batch);
  },
} satisfies ExportedHandler<Env, ImportMessage | JobMessage>;
