import { canonicalContentLocale } from '@resumora/contracts/editor/content-language';
import { createImportTiming, type ImportTiming } from "@resumora/contracts/intelligence/import-timing";
import { cvImportLimits } from "@resumora/contracts/intelligence/import-limits";
import { skillInventoryPolicy } from "@resumora/contracts/intelligence/skill-keywords";
import { WorkflowOutputError } from "@resumora/contracts/jobs/workflow";
import {
  prepareEnhancement,
  validateReasoningEffort,
  type ReasoningEffort,
} from "../ai/enhancement.ts";
import { configId, type EnhancementConfig } from "../ai/routes.ts";
import { privateJson } from "../jobs/routes.ts";
import type { UsageLedger } from "../ai/ledger.ts";
import type { createDatabaseGateway } from "../db/supabase.ts";
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
  execution: { waitUntil?: (promise: Promise<unknown>) => void } = {},
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
  const experience =
    new URL(request.url).pathname === "/v1/intelligence/experience";
  const skillsImprovement = path === "/v1/intelligence/skills";
  // Retain completion/receipt after a browser disconnect; never extend paid work beyond its deadline.
  const signal = experience || skillsImprovement
    ? AbortSignal.timeout(skillsImprovement ? 180000 : 25000)
    : AbortSignal.any([
        request.signal,
        AbortSignal.timeout(cvImportLimits.processingMs),
      ]);
  const skillsSignal = experience ? AbortSignal.timeout(skillInventoryPolicy.totalMs) : signal;
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
  const run: StructuredRunner = reading
    ? async () => {
        throw new Error("READ_ONLY_OPERATION");
      }
    : task => configuredStructuredRunner(
        env,
        userId,
        ledger,
        experience && task.promptVersion === skillInventoryPolicy.promptVersion ? skillsSignal : signal,
        transport,
        gateway.reserveDocumentOperation,
        gateway.reserveEnhancement,
      )(task);
  const operations = intelligenceOperations(run),
    store = gateway.createImportStore(secret);
  const workflow = importWorkflow({ store });
  const response = intelligenceRoute(request, {
    enabled,
    userId,
    signal,
    operations,
    workflow,
    waitUntil: execution.waitUntil,
    gateway: {
      getWorkspaceOperation: gateway.getWorkspaceOperation,
      beginWorkspaceOperation: gateway.beginWorkspaceOperation,
      finishWorkspaceOperation: gateway.finishWorkspaceOperation
        ? (id, state, result) => gateway.finishWorkspaceOperation(id, state, result, secret)
        : undefined,
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
  if (experience || skillsImprovement) execution.waitUntil?.(response.then(() => undefined));
  return response;
}

/** Shared bounded provider/usage runner used by CV import and queued job operations. */
export function configuredStructuredRunner(
  env: IntelligenceConfig,
  userId: string,
  ledger: UsageLedger,
  signal: AbortSignal,
  transport: typeof fetch = fetch,
  reserveDocument?: ReturnType<
    typeof createDatabaseGateway
  >["reserveDocumentOperation"],
  reserveCareer?: ReturnType<
    typeof createDatabaseGateway
  >["reserveEnhancement"],
  timing?: ImportTiming,
): StructuredRunner {
  const enabled = env.AI_PAID_INFERENCE === "on",
    secret = env.AI_WORKER_SECRET ?? "",
    policy = env.AI_PROCESSING_POLICY ?? "";
  const reasoningEffort = validateReasoningEffort(env.AI_REASONING_EFFORT);
  const run: StructuredRunner = async (task) => {
    const skillInventory = [skillInventoryPolicy.promptVersion, "skills-improvement/3"].includes(task.promptVersion) &&
      task.operation === "cv_rewrite" && task.tier === "career";
    const operationTiming = task.promptVersion.startsWith('experience-')
      ? createImportTiming('server', task.parentOperationId ?? task.operationId, { emit: event => { console.debug('experience-timing', event); } })
      : timing;
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
      if (!reserveDocument) throw new Error("AI_UNCONFIGURED");
      const reservedDone = timing?.span("stage_reservation", {
        stageOperationId: task.operationId,
        stage: task.stage,
      });
      let reserved;
      try {
        reserved = await reserveDocument!({
          operationId: task.operationId,
          importId: task.importId,
          stage: task.stage!,
          policy,
          secret,
        });
        reservedDone?.();
      } catch (error) {
        reservedDone?.("unknown");
        throw error;
      }
      if (!reserved.created) throw new Error("OPERATION_REPLAY");
    }
    if (task.careerSnapshot) {
      if (!reserveCareer) throw new Error("AI_UNCONFIGURED");
      const reservationDone = operationTiming?.span('stage_reservation', { stageOperationId: task.operationId });
      const reserved = await reserveCareer({
        operationId: task.operationId,
        snapshotId: task.careerSnapshot.snapshotId,
        revision: task.careerSnapshot.revision,
        targetId: task.careerSnapshot.targetId,
        policy: `${policy.slice(0, 100)}:${task.careerSnapshot.kind}`,
        secret,
      });
      reservationDone?.();
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
    let validationReason = "NOT_REACHED";
    const runner = prepareEnhancement({
      timing: task.operation === "cv_parse" || task.promptVersion.startsWith('experience-') ? operationTiming : undefined,
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
      totalTimeoutMs:
        task.operation === "cv_parse" && task.tier === "extraction"
          ? cvImportLimits.extractionTotalMs
          : skillInventory ? skillInventoryPolicy.totalMs : 30000,
      attemptTimeoutMs:
        task.tier === "admission"
          ? 8000
          : task.operation === "cv_parse" && task.tier === "extraction"
            ? cvImportLimits.extractionAttemptMs
            : skillInventory ? skillInventoryPolicy.attemptMs : 25000,
      structured: {
        request: {
          ...task,
          input: structuredClone(task.input),
          schema: structuredClone(task.schema),
        },
        validate: (value) => {
          validationReason = "VALIDATING";
          try {
            const result = task.validateOutput
              ? task.validateOutput(value)
              : value;
            validationReason = "VALID";
            return result;
          } catch (error) {
            const code = error instanceof Error ? error.message : "";
            const skillReason = (error as { validationReason?: unknown })?.validationReason;
            validationReason =
              error instanceof WorkflowOutputError
                ? error.reason
                : task.promptVersion === "skills-improvement/3" && typeof skillReason === "string" && ["SKILLS_RESPONSE_SHAPE", "SKILLS_ROW_SHAPE", "SKILLS_LABEL_INVALID", "SKILLS_REMOVAL_INVALID"].includes(skillReason)
                ? skillReason
                : [
                      "QUESTION_OUTPUT",
                      "QUESTION_REPEATED",
                      "INVALID_WORKFLOW_OUTPUT",
                      "REWRITE_OUTPUT",
                      "OUTPUT_UNSUPPORTED",
                      "UNSUPPORTED_METRIC",
                      "EXPERIENCE_SCORE_EVIDENCE",
                      "EXPERIENCE_SCORE_GRADES",
                      "EXPERIENCE_OUTPUT_SHAPE",
                    ].includes(code)
                  ? code
                  : "STRUCTURE_REJECTED";
            throw error;
          }
        },
      },
    });
    const result = await runner.propose({
      operationId: task.operationId,
      userId,
      context: {
        targetId: task.operationId,
        locale: canonicalContentLocale(task.contentLocale) ?? canonicalContentLocale((task.input as { locale?: unknown; targetLocale?: unknown })?.locale) ?? canonicalContentLocale((task.input as { targetLocale?: unknown })?.targetLocale) ?? "ro",
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
    if (result.output === undefined) {
      const last = result.attempts.at(-1)?.result;
      const truncated =
        last?.status === "incomplete" && last.errorCode === "OUTPUT_INVALID";
      const invalid =
        last?.errorCode === "OUTPUT_INVALID" ||
        last?.errorCode === "OUTPUT_UNSUPPORTED";
      const importing = task.operation === "cv_parse";
      const job = task.promptVersion.startsWith("AIW.");
      const experience = task.promptVersion.startsWith("experience-") || task.promptVersion === "cv-language/1" || task.promptVersion === "skills-improvement/3";
      const questions = task.promptVersion.startsWith("career.questions.");
      const rewrite = task.promptVersion.startsWith("career.role-rewrite.");
      const uncertain = result.attempts.some(
        (a) =>
          a.result == null ||
          a.result.status === "unknown" ||
          ["TIMEOUT", "NETWORK_OR_RESPONSE_UNKNOWN", "CANCELLED"].includes(
            a.result?.errorCode ?? "",
          ),
      );
      const timedOut = result.attempts.some(
        (a) => a.result?.errorCode === "TIMEOUT",
      );
      const code =
        (importing || questions || rewrite || job || experience) && uncertain
          ? timedOut
            ? "AI_TIMEOUT_UNKNOWN"
            : "AI_REQUEST_UNKNOWN"
          : (importing || questions || rewrite || job || experience) &&
              truncated
            ? "AI_OUTPUT_TRUNCATED"
            : (importing || questions || rewrite || job || experience) &&
                invalid
              ? "AI_OUTPUT_INVALID"
              : (rewrite || experience) &&
                  last?.errorCode === "PROVIDER_REJECTED"
                ? "AI_PROVIDER_REJECTED"
                : experience && last?.status === "failed"
                  ? "AI_REQUEST_FAILED"
                  : rewrite || experience
                    ? "AI_REQUEST_UNKNOWN"
                    : "PROVIDER_OUTPUT_UNAVAILABLE";
      if (questions || job || experience)
        console.warn(
          experience
            ? "ai-experience-outcome"
            : job
              ? "ai-job-outcome"
              : "ai-questions-outcome",
          {
            stage: task.promptVersion,
            code,
            validationReason,
            outputLimit: task.maxOutputTokens,
            outputTokens: last?.usage.output ?? null,
            httpStatus: last?.httpStatus ?? null,
          },
        );
      throw new Error(code);
    }
    return result.output;
  };
  return run;
}
