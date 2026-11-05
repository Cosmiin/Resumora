import type { JobMessage } from "./jobs/repo.ts";

export type Env = {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  /** Used only by the import queue consumer and the ai_calls log. Never sent to the browser. */
  SUPABASE_SERVICE_ROLE_KEY: string;
  APP_ORIGIN: string;
  OPENROUTER_API_KEY: string;
  OPENROUTER_MODEL: string;
  OPENAI_API_KEY: string;
  OPENAI_MODEL: string;
  /** Queue of imports to process (Cloudflare Queues; simulated locally by wrangler dev). */
  IMPORTS: Queue<{ importId: string; userId: string }>;
  JOBS: Queue<JobMessage>;
};

/** The signed-in user making the request. `token` is their Supabase access token. */
export type AuthUser = { id: string; token: string };

/** What code acting as the signed-in user needs. */
export type SupabaseEnv = Pick<Env, "SUPABASE_URL" | "SUPABASE_ANON_KEY">;
