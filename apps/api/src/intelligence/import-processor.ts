import {
  createImportTiming,
  type ImportTimingOptions,
} from "@resumora/contracts/intelligence/import-timing";
import { cvImportLimits } from "@resumora/contracts/intelligence/import-limits";
import { Buffer } from "node:buffer";
import { boundedJson } from "../ai/http.ts";
import type {
  UsageLedger,
  Attempt,
  AttemptStart,
  AttemptResult,
} from "../ai/ledger.ts";
import type { DatabaseConfig } from "../db/supabase.ts";
import {
  configuredStructuredRunner,
  type IntelligenceConfig,
} from "./configured.ts";
import { intelligenceOperations, type StructuredRunner } from "./operations.ts";
import { preflightPdf } from "./pdf-preflight.ts";
import { preflightWord } from "./word-preflight.ts";
import type { ImportRecord, ImportState } from "./import-workflow.ts";
import {
  documentLimits,
  validatePages,
  type ImportReview,
  type ProcessedDocument,
} from "@resumora/contracts/intelligence/model";

export type DocumentProcessor = (input: {
  format: string;
  bytes: Uint8Array;
  signal: AbortSignal;
}) => Promise<ProcessedDocument>;
export type ClaimedImport = {
  lease: string;
  userId: string;
  record: ImportRecord;
  base64: string;
};
export interface ImportWorkerStore {
  sweep?(): Promise<unknown>;
  claim(): Promise<ClaimedImport | null>;
  finish(
    lease: string,
    state: ImportState,
    review: ImportReview | null,
    error: string | null,
  ): Promise<unknown>;
  reserve(
    lease: string,
    input: {
      operationId: string;
      importId: string;
      stage: string;
      policy: string;
      secret: string;
    },
  ): Promise<{ created: boolean }>;
  ledger(lease: string): UsageLedger;
}
/** A narrowly scoped worker capability; never stores or impersonates browser sessions. */
export function importWorkerStore(
  env: IntelligenceConfig & DatabaseConfig,
  transport: typeof fetch = fetch,
): ImportWorkerStore {
  const url = new URL(env.SUPABASE_URL ?? "");
  if (
    url.protocol !== "https:" ||
    !/^[a-z0-9]+\.supabase\.co$/.test(url.hostname) ||
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
    throw Error("AI_UNCONFIGURED");
  async function rpc<T>(
    name: string,
    args: Record<string, unknown>,
    maxBytes = 1048576,
  ): Promise<T> {
    const response = await transport(`${url.origin}/rest/v1/rpc/${name}`, {
      method: "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(15000),
      headers: {
        apikey: env.SUPABASE_PUBLISHABLE_KEY!,
        Authorization: `Bearer ${env.SUPABASE_PUBLISHABLE_KEY!}`,
        "Content-Type": "application/json",
        "Content-Profile": "app",
        "Accept-Profile": "app",
      },
      body: JSON.stringify({ p_secret: env.AI_WORKER_SECRET, ...args }),
    });
    const value = await boundedJson(response, maxBytes);
    if (!response.ok) throw Error("IMPORT_WORKER_STORE_UNAVAILABLE");
    return value as T;
  }
  return {
    sweep: () => rpc("expire_cv_import_tasks", {}),
    claim: () => rpc("claim_cv_import_task", {}, 16 * 1048576),
    finish: (lease, state, review, error) =>
      rpc("finish_cv_import_task", {
        p_lease: lease,
        p_state: state,
        p_review: review,
        p_error: error,
      }),
    reserve: (lease, input) =>
      rpc("reserve_cv_import_task_stage", {
        p_lease: lease,
        p_operation: input.operationId,
        p_import: input.importId,
        p_stage: input.stage,
        p_policy: input.policy,
      }),
    ledger: (lease) => ({
      durability: "durable",
      begin: (start: AttemptStart) =>
        rpc<{ created: boolean; attempt: Attempt }>("cv_import_task_attempt", {
          p_lease: lease,
          p_start: start,
          p_attempt: null,
          p_result: null,
        }),
      finish: (id: string, result: AttemptResult) =>
        rpc<Attempt>("cv_import_task_attempt", {
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
const definite = new Set([
  "AI_DISABLED",
  "AI_UNCONFIGURED",
  "AI_OUTPUT_INVALID",
  "AI_OUTPUT_TRUNCATED",
  "AI_PROVIDER_REJECTED",
  "SOURCE_MISMATCH",
  "PROCESSOR_UNAVAILABLE",
  "PROCESSOR_TIMEOUT",
  "WORD_CONVERTER_UNAVAILABLE",
  "ACTIVE_DOCUMENT_CONTENT",
]);
// The existing finish RPC returns null when cancellation/expiry has already
// retired the task. Diagnostics must not mistake an HTTP 200 for publication.
function acknowledgedFinish(
  value: unknown,
  record: ImportRecord,
  state: ImportState,
) {
  try {
    const receipt = value as ImportRecord | null;
    return (
      receipt?.id === record.id &&
      receipt.operationId === record.operationId &&
      receipt.state === state
    );
  } catch {
    return false;
  }
}
/** A single durable claim owns a single execution. Interrupted/unknown work is never re-queued. */
export async function processCvImport(
  env: IntelligenceConfig & DatabaseConfig,
  options: {
    timing?: ImportTimingOptions;
    store?: ImportWorkerStore;
    run?: StructuredRunner;
    processor?: DocumentProcessor;
    transport?: typeof fetch;
  } = {},
) {
  if (env.AI_PAID_INFERENCE !== "on") return { processed: 0, disabled: true };
  const store = options.store ?? importWorkerStore(env, options.transport),
    task = await store.claim();
  if (!task) return { processed: 0 };
  const timing = createImportTiming(
    "server",
    task.record.operationId,
    options.timing,
  );
  timing.mark("queue_claim");
  const preflightDone = timing.span("preflight");
  let processingSignal: AbortSignal | undefined;
  try {
    if (task.base64.length > Math.ceil(documentLimits.bytes / 3) * 4)
      throw Error("DOCUMENT_SIZE");
    const bytes = new Uint8Array(Buffer.from(task.base64, "base64"));
    if (!bytes.length || bytes.length > documentLimits.bytes)
      throw Error("DOCUMENT_SIZE");
    const hash = Buffer.from(
      await crypto.subtle.digest("SHA-256", bytes),
    ).toString("hex");
    if (hash !== task.record.sourceHash) throw Error("SOURCE_MISMATCH");
    const processor =
      options.processor ??
      (({ format, bytes }) =>
        format === "pdf"
          ? preflightPdf(bytes)
          : preflightWord(format as "doc" | "docx", bytes));
    const document = validatePages(
      await processor({
        format: task.record.format,
        bytes,
        signal: AbortSignal.timeout(15000),
      }),
    );
    if (document.sha256 !== hash || document.format !== task.record.format)
      throw Error("SOURCE_MISMATCH");
    preflightDone();
    // Upload/queue time does not consume the bounded AI processing window.
    processingSignal = AbortSignal.timeout(cvImportLimits.processingMs);
    const run =
      options.run ??
      configuredStructuredRunner(
        env,
        task.userId,
        store.ledger(task.lease),
        processingSignal,
        options.transport,
        (input) => store.reserve(task.lease, input),
        undefined,
        timing,
      );
    const result = await intelligenceOperations(run).extract({
      operationId: task.record.operationId,
      userId: task.userId,
      document,
      importId: task.record.id,
    });
    if (processingSignal.aborted) throw Error("AI_TIMEOUT_UNKNOWN");
    const review: ImportReview | null = result.extraction
      ? {
          id: task.record.id,
          format: task.record.format,
          sourceHash: hash,
          parserVersion: document.parserVersion,
          pages: document.format === "pdf" ? document.pages.length : null,
          admission: result.admission,
          extraction: result.extraction,
          confirmedIds: [],
        }
      : null;
    const finalState = review
      ? "ready"
      : result.admission.kind === "not_cv"
        ? "not_cv"
        : "uncertain";
    const publicationDone = timing.span(
      review ? "review_publication" : "terminal_settlement",
    );
    try {
      const receipt = await store.finish(
        task.lease,
        finalState,
        review,
        review
          ? null
          : result.admission.kind === "not_cv"
            ? "NOT_CV"
            : "ADMISSION_UNCERTAIN",
      );
      publicationDone(
        acknowledgedFinish(receipt, task.record, finalState)
          ? "complete"
          : "unknown",
      );
    } catch (error) {
      publicationDone("unknown");
      throw error;
    }
  } catch (error) {
    preflightDone("unknown");
    const raw = processingSignal?.aborted
      ? "AI_TIMEOUT_UNKNOWN"
      : error instanceof Error
        ? error.message
        : "UNKNOWN";
    const known = definite.has(raw) || /^DOCUMENT_[A-Z_]+$/.test(raw);
    const code =
      known || ["AI_TIMEOUT_UNKNOWN", "AI_REQUEST_UNKNOWN"].includes(raw)
        ? raw
        : "PROCESSING_OUTCOME_UNKNOWN";
    const settlementDone = timing.span("terminal_settlement");
    try {
      const receipt = await store.finish(
        task.lease,
        known ? "failed" : "unknown",
        null,
        code,
      );
      settlementDone(
        acknowledgedFinish(receipt, task.record, known ? "failed" : "unknown")
          ? "complete"
          : "unknown",
      );
    } catch (error) {
      settlementDone("unknown");
      throw error;
    }
    console.warn("cv-import-worker-outcome", {
      state: known ? "failed" : "unknown",
      code,
    });
  }
  return { processed: 1 };
}
export async function drainCvImports(env: IntelligenceConfig & DatabaseConfig) {
  if (
    !env.AI_WORKER_SECRET ||
    !env.SUPABASE_URL ||
    !env.SUPABASE_PUBLISHABLE_KEY
  )
    return;
  await importWorkerStore(env).sweep?.();
  // Existing sequential drain bound; this is not an aggregate capacity guarantee.
  for (let i = 0; i < 2; i++)
    if (!(await processCvImport(env)).processed) break;
}
