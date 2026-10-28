import {
  prepareEnhancement,
  validateReasoningEffort,
  type ReasoningEffort,
} from "../ai/enhancement.ts";
import { configId, type EnhancementConfig } from "../ai/routes.ts";
import { privateJson } from "../jobs/routes.ts";
import type { UsageLedger } from "../ai/ledger.ts";
import type { createDatabaseGateway } from "../db/supabase.ts";
import { preflightPdf } from "./pdf-preflight.ts";
import { preflightWord } from "./word-preflight.ts";
import { intelligenceOperations, type StructuredRunner } from "./operations.ts";
import { importWorkflow } from "./import-workflow.ts";
import { intelligenceRoute } from "./routes.ts";
export interface IntelligenceConfig extends EnhancementConfig {
  OPENAI_CV_ADMISSION_MODEL?: string;
  OPENAI_CV_EXTRACTION_MODEL?: string;
  OPENROUTER_CV_ADMISSION_MODEL?: string;
  OPENROUTER_CV_EXTRACTION_MODEL?: string;
}
export async function configuredIntelligenceRoute(
  request: Request,
  env: IntelligenceConfig,
  gateway: ReturnType<typeof createDatabaseGateway>,
  userId: string,
  transport: typeof fetch = fetch,
) {
  const path = new URL(request.url).pathname,
    reading = request.method === "GET" || path.endsWith("/cancel");
  const enabled = env.AI_PAID_INFERENCE === "on";
  if (!reading && !enabled)
    return privateJson(
      {
        error: {
          code: "AI_DISABLED",
          message:
            "AI import/questions/rewrite are switched off. Manual editing and saved answers remain available.",
        },
      },
      503,
    );
  if (
    !reading &&
    (!env.AI_WORKER_SECRET ||
      env.AI_WORKER_SECRET.length < 32 ||
      !configId(env.AI_PROCESSING_POLICY))
  )
    return privateJson({ error: { code: "AI_UNCONFIGURED" } }, 503);
  let reasoningEffort: ReasoningEffort | undefined;
  try {
    reasoningEffort = reading
      ? undefined
      : validateReasoningEffort(env.AI_REASONING_EFFORT);
  } catch {
    return privateJson({ error: { code: "AI_UNCONFIGURED" } }, 503);
  }
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(90000)]);
  const secret = env.AI_WORKER_SECRET ?? "",
    policy = env.AI_PROCESSING_POLICY ?? "";
  const ledger: UsageLedger = {
    durability: "durable",
    begin: (s) => gateway.beginAttempt(s, secret),
    finish: (id, result) => gateway.finishAttempt(id, result, secret),
    report: async () => {
      throw new Error("REPORT_UNCONNECTED");
    },
  };
  const run: StructuredRunner = async (task) => {
    if (!enabled) throw new Error("AI_DISABLED");
    const word = task.fileFormat === "doc" || task.fileFormat === "docx";
    const routerModel =
      task.tier === "admission"
        ? env.OPENROUTER_CV_ADMISSION_MODEL
        : task.tier === "extraction"
          ? env.OPENROUTER_CV_EXTRACTION_MODEL
          : env.OPENROUTER_MODEL;
    const directModel =
      task.tier === "admission"
        ? env.OPENAI_CV_ADMISSION_MODEL
        : task.tier === "extraction"
          ? env.OPENAI_CV_EXTRACTION_MODEL
          : env.OPENAI_MODEL;
    if (
      !configId(directModel) ||
      !env.OPENAI_API_KEY ||
      (!word &&
        (!configId(routerModel) ||
          !configId(env.OPENROUTER_ENDPOINT) ||
          !env.OPENROUTER_API_KEY))
    )
      throw new Error("AI_UNCONFIGURED");
    if (task.importId) {
      const reserved = await gateway.reserveDocumentOperation({
        operationId: task.operationId,
        importId: task.importId,
        stage: task.stage!,
        policy,
        secret,
      });
      if (!reserved.created) throw new Error("OPERATION_REPLAY");
    }
    const routes = word
      ? {
          primary: {
            provider: "openai" as const,
            model: directModel!,
            upstreamEndpoint: "openai",
            providerScope: "configured-direct-word",
          },
        }
      : {
          primary: {
            provider: "openrouter" as const,
            model: routerModel!,
            upstreamEndpoint: env.OPENROUTER_ENDPOINT!,
            providerScope: "configured-router",
          },
          fallback: {
            provider: "openai" as const,
            model: directModel!,
            upstreamEndpoint: "openai",
            providerScope: "configured-direct",
          },
        };
    const runner = prepareEnhancement({
      execution: "configured",
      processingPolicy: policy,
      reasoningEffort,
      credentials: {
        openrouter: env.OPENROUTER_API_KEY ?? "",
        openai: env.OPENAI_API_KEY,
      },
      ledger,
      transport,
      ...routes,
      totalTimeoutMs: 30000,
      attemptTimeoutMs: task.tier === "admission" ? 8000 : 25000,
      structured: {
        request: {
          ...task,
          input: structuredClone(task.input),
          schema: structuredClone(task.schema),
        },
        validate: task.validateOutput ?? ((value) => value),
      },
    });
    const result = await runner.propose({
      operationId: task.operationId,
      userId,
      context: {
        targetId: task.operationId,
        locale: "ro",
        facts: [
          {
            id: task.operationId,
            text: "Owned operation context",
            sourceId: task.operationId,
          },
        ],
      },
      signal,
    });
    if (result.output === undefined)
      throw new Error("PROVIDER_OUTPUT_UNAVAILABLE");
    return result.output;
  };
  const operations = intelligenceOperations(run),
    store = gateway.createImportStore(secret);
  const workflow = importWorkflow({
    userId,
    store,
    operations,
    aiEnabled: enabled,
    processor: ({ format, bytes }) =>
      format === "pdf"
        ? preflightPdf(bytes)
        : preflightWord(format as "doc" | "docx", bytes),
  });
  return intelligenceRoute(request, {
    enabled,
    userId,
    signal,
    operations,
    workflow,
    gateway: {
      loadSnapshot: gateway.loadSnapshot,
      loadDraft: gateway.loadDraft,
      reserveCareer: async (input) =>
        (
          await gateway.reserveEnhancement({
            operationId: input.operationId,
            snapshotId: input.snapshotId,
            revision: input.revision,
            targetId: input.targetId,
            policy: `${policy.slice(0, 100)}:${input.kind}`,
            secret,
          })
        ).created,
    },
  });
}
