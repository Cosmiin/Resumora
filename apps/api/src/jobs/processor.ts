import { contentLocale } from '@resumora/contracts/editor/content-language';
import { jobDocumentLocale, requireJobContentLanguage } from './locale.ts';
import {
  withJobAnswers,
  type JobAnswer,
} from "@resumora/contracts/editor/workspace";
import { retrieveJobUrl } from "./url.ts";
import type { DatabaseConfig } from "../db/supabase.ts";
import { boundedJson } from "../ai/http.ts";
import {
  configuredStructuredRunner,
  type IntelligenceConfig,
} from "../intelligence/configured.ts";
import type {
  UsageLedger,
  Attempt,
  AttemptStart,
  AttemptResult,
} from "../ai/ledger.ts";
import { jobOperations } from "./operations.ts";
import {
  decodeDraft,
  type EditorWireEnvelope,
} from "@resumora/contracts/editor/transport";
import {
  projectCvEvidence,
  eligibleEvidence,
  type WorkflowOperation,
  type Vacancy,
  type MatchResult,
} from "@resumora/contracts/jobs/workflow";
import type { CurrentJobDocument } from "@resumora/contracts/jobs/current-document";
export type ClaimedJob = {
  jobAnswers?: JobAnswer[];
  operation: WorkflowOperation;
  lease: string;
  jobId: string;
  userId: string;
  text: string;
  sourceUrl?: string;
  vacancy: Vacancy | null;
  base: EditorWireEnvelope | null;
  document: CurrentJobDocument | null;
  targetDocument?: CurrentJobDocument | null;
  match: MatchResult | null;
  targetId: string | null;
  actions: unknown;
};
export interface JobWorkerStore {
  claim(): Promise<ClaimedJob | null>;
  finish(
    lease: string,
    result: unknown,
    error: string | null,
  ): Promise<unknown>;
  ledger(lease: string): UsageLedger;
}
export function jobWorkerStore(
  env: IntelligenceConfig & DatabaseConfig,
  transport: typeof fetch = fetch,
): JobWorkerStore {
  const url = new URL(env.SUPABASE_URL ?? "");
  if (
    url.protocol !== "https:" ||
    !url.hostname.match(/^[a-z0-9]+\.supabase\.co$/) ||
    url.username ||
    url.password ||
    url.port ||
    url.search ||
    url.hash ||
    url.pathname !== "/" ||
    !env.SUPABASE_PUBLISHABLE_KEY ||
    !env.AI_WORKER_SECRET ||
    env.AI_WORKER_SECRET.length < 32
  )
    throw new Error("AI_UNCONFIGURED");
  async function rpc<T>(name: string, args: unknown): Promise<T> {
    const r = await transport(`${url.origin}/rest/v1/rpc/${name}`, {
      method: "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(10000),
      headers: {
        apikey: env.SUPABASE_PUBLISHABLE_KEY!,
        Authorization: `Bearer ${env.SUPABASE_PUBLISHABLE_KEY!}`,
        "Content-Type": "application/json",
        "Content-Profile": "app",
        "Accept-Profile": "app",
      },
      body: JSON.stringify({
        p_secret: env.AI_WORKER_SECRET,
        ...(args as object),
      }),
    });
    const v = await boundedJson(r, 2 * 1048576);
    if (!r.ok) throw new Error("WORKFLOW_STORE_UNAVAILABLE");
    return v as T;
  }
  return {
    claim: () =>
      rpc("claim_job_workflow", {
        p_fetch_only: env.AI_PAID_INFERENCE !== "on",
      }),
    finish: (lease, result, error) =>
      rpc("finish_job_workflow", {
        p_lease: lease,
        p_result: result,
        p_error: error,
      }),
    ledger: (lease) => ({
      durability: "durable",
      begin: (start: AttemptStart) =>
        rpc<{ created: boolean; attempt: Attempt }>("job_workflow_attempt", {
          p_lease: lease,
          p_start: start,
          p_attempt: null,
          p_result: null,
        }),
      finish: (id: string, result: AttemptResult) =>
        rpc<Attempt>("job_workflow_attempt", {
          p_lease: lease,
          p_start: null,
          p_attempt: id,
          p_result: result,
        }),
      report: async () => {
        throw Error("REPORT_UNCONNECTED");
      },
    }),
  };
}
/** No browser/session data or persisted bearer tokens. One claim => one bounded
 * operation. HTTP delivery/navigation cannot cancel an accepted durable source. */
export async function processJobWorkflow(
  env: IntelligenceConfig & DatabaseConfig,
  options: {
    store?: JobWorkerStore;
    run?: import("../intelligence/operations.ts").StructuredRunner;
    transport?: typeof fetch;
  } = {},
) {
  if (
    !options.store &&
    (!env.AI_WORKER_SECRET || env.AI_WORKER_SECRET.length < 32)
  )
    return { processed: 0, disabled: true };
  const store = options.store ?? jobWorkerStore(env, options.transport),
    task = await store.claim();
  if (!task) return { processed: 0 };
  try {
    if (task.operation.kind === "fetch") {
      const text = await retrieveJobUrl(task.sourceUrl, options.transport);
      await store.finish(task.lease, { text }, null);
      return { processed: 1 };
    }
    if (env.AI_PAID_INFERENCE !== "on") throw Error("AI_DISABLED");
    if (task.operation.kind !== 'extract' && !task.document && task.base) await requireJobContentLanguage(decodeDraft(task.base));
    const run =
        options.run ??
        configuredStructuredRunner(
          env,
          task.userId,
          store.ledger(task.lease),
          AbortSignal.timeout(120000),
          options.transport,
        ),
      operations = jobOperations(run);
    const common = { operationId: task.operation.id, userId: task.userId };
    let result: unknown;
    if (task.operation.kind === "extract")
      result = await operations.extract({ ...common, text: task.text, locale: task.document ? contentLocale(decodeDraft(task.document.payload)) : task.operation.targetLocale ?? "ro" });
    else {
      if (!task.base || !task.vacancy) throw Error("INVALID_WORKFLOW_OUTPUT");
      const draft = withJobAnswers(
          decodeDraft(task.base),
          task.jobId,
          task.jobAnswers ?? [],
        ),
        target = task.targetDocument
          ? decodeDraft(task.targetDocument.payload)
          : task.document &&
              task.document.locale === task.operation.targetLocale
            ? decodeDraft(task.document.payload)
            : structuredClone(draft);
      if (task.operation.targetLocale)
        jobDocumentLocale(target, task.operation.targetLocale);
      const evidence = projectCvEvidence(
        eligibleEvidence(draft),
        task.document ? decodeDraft(task.document.payload) : draft,
      );
      result =
        task.operation.kind === "match"
          ? await operations.match({
              ...common,
              draft: task.document ? decodeDraft(task.document.payload) : draft,
              vacancy: task.vacancy,
              evidence,
            })
          : await operations.tailor({
              ...common,
              draft: target,
              evidence,
              vacancy: task.vacancy,
              match: task.match!,
              ...(task.targetId ? { onlyTarget: task.targetId } : {}),
              actions: (task.match?.suggestions ?? []).map((s) => ({
                ...s,
                state:
                  (task.actions as Record<string, string>)?.[s.id] ?? s.state,
              })),
            });
    }
    await store.finish(task.lease, result, null);
  } catch (error) {
    await store.finish(
      task.lease,
      null,
      error instanceof Error &&
        [
          "CONTENT_LANGUAGE_REQUIRED",
          "CONTENT_LANGUAGE_UNAVAILABLE",
          "INVALID_WORKFLOW_OUTPUT",
          "AI_OUTPUT_INVALID",
          "AI_OUTPUT_TRUNCATED",
        ].includes(error.message)
        ? ["CONTENT_LANGUAGE_REQUIRED","CONTENT_LANGUAGE_UNAVAILABLE"].includes(error.message) ? error.message : "OUTPUT_INVALID"
        : error instanceof Error && error.message === "WORKFLOW_INPUT_TOO_LARGE"
          ? "INPUT_TOO_LARGE"
          : "PROVIDER_UNAVAILABLE",
    );
  }
  return { processed: 1 };
}

export async function drainJobWorkflows(
  env: IntelligenceConfig & DatabaseConfig,
) {
  for (let n = 0; n < 3; n++) {
    const result = await processJobWorkflow(env);
    if (!result.processed) return;
  }
}
