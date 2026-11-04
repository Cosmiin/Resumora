import {
  draftKinds,
  object,
  parseJobAnswer,
  validateWorkspaceValue,
  withJobAnswers,
  type DraftKind,
} from "@resumora/contracts/editor/workspace";
import { isUuid } from "@resumora/contracts/jobs/connected";
import { decodeDraft, encodeDraft } from "@resumora/contracts/editor/transport";
import { careerContext } from "@resumora/contracts/intelligence/context";
import { acceptWording } from "@resumora/contracts/editor/wording";
import { normalizeJobIntake } from "@resumora/contracts/jobs/intake";
import { readBody } from "../cv/routes.ts";
import { privateJson, routeError } from "../jobs/routes.ts";
import { publicJobUrl } from "../jobs/url.ts";
import {
  configuredStructuredRunner,
  type IntelligenceConfig,
} from "../intelligence/configured.ts";
import {
  intelligenceOperations,
  type StructuredRunner,
} from "../intelligence/operations.ts";
import type { createDatabaseGateway } from "../db/supabase.ts";
type Gateway = ReturnType<typeof createDatabaseGateway>;
const revision = (v: unknown) => Number.isSafeInteger(v) && Number(v) >= 0;
export const isWorkspacePath = (p: string) =>
  p === "/v1/workspace-drafts" ||
  p.startsWith("/v1/workspace-drafts/") ||
  /^\/v1\/jobs\/(?:intakes\/[^/]+\/submit|[^/]+\/(?:answers|profile-integrations)(?:\/[^/]+\/accept)?)$/.test(
    p,
  ) ||
  /^\/v1\/intelligence\/operations\/[^/]+(?:\/reject)?$/.test(p);
export async function workspaceRoute(
  request: Request,
  env: IntelligenceConfig,
  gateway: Gateway,
  userId: string,
  options: {
    run?: StructuredRunner;
    waitUntil?: (promise: Promise<unknown>) => void;
  } = {},
) {
  const path = new URL(request.url).pathname;
  try {
    if (new URL(request.url).search) throw Error("invalidRequest");
    if (path === "/v1/workspace-drafts") {
      if (request.method !== "GET")
        return privateJson({ error: { code: "method" } }, 405);
      try {
        return privateJson(await gateway.listWorkspaceDrafts());
      } catch (e) {
        if ((e as { code?: string }).code === "ACTIVE_WORKSPACE_REQUIRED")
          return privateJson([]);
        throw e;
      }
    }
    const draft = /^\/v1\/workspace-drafts\/([^/]+)\/([^/]+)$/.exec(path);
    if (draft) {
      if (!draftKinds.includes(draft[1] as DraftKind) || !isUuid(draft[2]))
        throw Error("invalidRequest");
      const kind = draft[1] as DraftKind,
        id = draft[2];
      if (request.method === "GET") {
        try {
          const context = await gateway.getWorkspaceDraftContext(kind, id);
          const response = privateJson(context.draft);
          response.headers.set(
            "X-Profile-Generation",
            String(context.generation),
          );
          return response;
        } catch (e) {
          if (kind === "intake" || kind === "resume") {
            if ((e as { code?: string }).code === "ACTIVE_WORKSPACE_REQUIRED")
              return privateJson(null);
          }
          throw e;
        }
      }
      if (request.method !== "POST")
        return privateJson({ error: { code: "method" } }, 405);
      const body = await readBody(request);
      if (body instanceof Response) return body;
      if (
        Object.keys(body).some(
          (k) =>
            ![
              "expectedRevision",
              "requestId",
              "value",
              "profileGeneration",
            ].includes(k),
        ) ||
        !isUuid(body.requestId) ||
        !revision(body.expectedRevision) ||
        (!["intake", "resume", "job-review"].includes(kind) &&
          !revision(body.profileGeneration))
      )
        throw Error("invalidRequest");
      return privateJson(
        await gateway.saveWorkspaceDraft({
          requestId: body.requestId,
          kind,
          id,
          expectedRevision: Number(body.expectedRevision),
          profileGeneration:
            body.profileGeneration === undefined
              ? undefined
              : Number(body.profileGeneration),
          value: validateWorkspaceValue(kind, body.value),
        }),
      );
    }
    const op = /^\/v1\/intelligence\/operations\/([^/]+)(\/reject)?$/.exec(
      path,
    );
    if (op) {
      if (op[2] && request.method === "POST" && isUuid(op[1]))
        return privateJson(await gateway.rejectWorkspaceOperation(op[1]));
      if (request.method !== "GET" || op[2])
        return privateJson({ error: { code: "method" } }, 405);
      if (!isUuid(op[1])) throw Error("invalidRequest");
      const value = await gateway.getWorkspaceOperation(op[1]);
      return privateJson(
        value ?? { error: { code: "missing" } },
        value ? 200 : 404,
      );
    }
    const intake = /^\/v1\/jobs\/intakes\/([^/]+)\/submit$/.exec(path);
    const job =
      /^\/v1\/jobs\/([^/]+)\/(answers|profile-integrations)(?:\/([^/]+)\/accept)?$/.exec(
        path,
      );
    if (!intake && !job) throw Error("invalidRequest");
    if (intake) {
      if (request.method !== "POST" || !isUuid(intake[1]))
        throw Error("invalidRequest");
      const body = await readBody(request);
      if (body instanceof Response) return body;
      if (
        Object.keys(body).some(k=>!["expectedRevision","requestId","interfaceLocale"].includes(k)) ||
        (body.interfaceLocale !== undefined && !["ro","en"].includes(String(body.interfaceLocale))) ||
        !isUuid(body.requestId) ||
        !revision(body.expectedRevision)
      )
        throw Error("invalidRequest");
      const value = (await gateway.getWorkspaceDraft("intake", intake[1]))
        ?.value;
      if (!value) return privateJson({ error: { code: "missing" } }, 404);
      if (value.sourceUrl) publicJobUrl(value.sourceUrl);
      if (value.text) {
        if (!normalizeJobIntake(value).ok) throw Error("invalidRequest");
      } else if (!value.sourceUrl) throw Error("invalidRequest");
      return privateJson(
        await gateway.submitWorkspaceIntake({
          requestId: body.requestId,
          id: intake[1],
          ...(body.interfaceLocale ? {interfaceLocale:body.interfaceLocale as "ro"|"en"} : {}),
          expectedRevision: Number(body.expectedRevision),
        }),
        201,
      );
    }
    const [, jobId, action, operationId] = job!;
    if (!isUuid(jobId) || (operationId && !isUuid(operationId)))
      throw Error("invalidRequest");
    if (!(await gateway.getJob(jobId)))
      return privateJson({ error: { code: "missing" } }, 404);
    if (action === "answers" && request.method === "GET")
      return privateJson(await gateway.getJobAnswers(jobId));
    if (request.method !== "POST")
      return privateJson({ error: { code: "method" } }, 405);
    const body = await readBody(request);
    if (body instanceof Response) return body;
    if (action === "answers") {
      if (
        Object.keys(body).sort().join(",") !==
          "answer,expectedRevision,requestId" ||
        !isUuid(body.requestId) ||
        !revision(body.expectedRevision)
      )
        throw Error("invalidRequest");
      return privateJson(
        await gateway.saveJobAnswer({
          requestId: body.requestId,
          jobId,
          expectedRevision: Number(body.expectedRevision),
          answer: parseJobAnswer(body.answer),
        }),
      );
    }
    if (operationId) {
      if (
        Object.keys(body).join(",") !== "requestId" ||
        !isUuid(body.requestId)
      )
        throw Error("invalidRequest");
      const operation = await gateway.getWorkspaceOperation(operationId);
      if (operation?.input.jobId !== jobId)
        return privateJson({ error: { code: "missing" } }, 404);
      const saved = await gateway.acceptProfileIntegration(
        body.requestId,
        operationId,
      );
      const { payload, ...meta } = saved;
      return privateJson({ ...meta, draft: decodeDraft(payload) });
    }
    if (env.AI_PAID_INFERENCE !== "on")
      return privateJson({ error: { code: "AI_DISABLED" } }, 503);
    if (
      !env.AI_WORKER_SECRET ||
      env.AI_WORKER_SECRET.length < 32 ||
      !env.AI_PROCESSING_POLICY
    )
      return privateJson({ error: { code: "AI_UNCONFIGURED" } }, 503);
    if (
      Object.keys(body).sort().join(",") !==
        "answerIds,answersRevision,operationId,revision,snapshotId,targetId" ||
      !isUuid(body.operationId) ||
      !isUuid(body.snapshotId) ||
      !revision(body.revision) ||
      !revision(body.answersRevision) ||
      typeof body.targetId !== "string" ||
      !Array.isArray(body.answerIds) ||
      !body.answerIds.length ||
      body.answerIds.length > 50 ||
      !body.answerIds.every(isUuid) ||
      new Set(body.answerIds).size !== body.answerIds.length
    )
      throw Error("invalidRequest");
    const input = {
      jobId,
      snapshotId: body.snapshotId,
      revision: Number(body.revision),
      targetId: body.targetId,
      answerIds: body.answerIds,
      answersRevision: Number(body.answersRevision),
    };
    const existing = await gateway.getWorkspaceOperation(body.operationId);
    if (existing) {
      if (
        existing.kind !== "integration" ||
        JSON.stringify(existing.input) !== JSON.stringify(input)
      ) {
        // JSONB key order differs; compare canonical key/value pairs instead.
        if (
          existing.kind !== "integration" ||
          Object.keys(input).some(
            (k) =>
              JSON.stringify(existing.input[k]) !==
              JSON.stringify(input[k as keyof typeof input]),
          )
        )
          return privateJson({ error: { code: "requestMismatch" } }, 409);
      }
      return privateJson(existing);
    }
    const [snapshot, answers] = await Promise.all([
      gateway.loadDraft(),
      gateway.getJobAnswers(jobId),
    ]);
    if (
      !snapshot ||
      snapshot.id !== input.snapshotId ||
      snapshot.revision !== input.revision ||
      answers.revision !== input.answersRevision
    )
      return privateJson({ error: { code: "stale" } }, 409);
    const original = decodeDraft(snapshot.payload);
    if (!original.roles.some((r) => r.id === input.targetId))
      throw Error("invalidRequest");
    const selected = answers.answers.filter(
      (a) => input.answerIds.includes(a.id) && a.status === "confirmed",
    );
    if (selected.length !== input.answerIds.length)
      throw Error("invalidRequest");
    const candidate = withJobAnswers(
      original,
      jobId,
      selected.map((a) => ({ ...a, targetId: input.targetId })),
    );
    const context = careerContext(candidate, input.targetId);
    const reserved = await gateway.beginWorkspaceOperation(
      body.operationId,
      "integration",
      input,
    );
    if (!reserved.created) return privateJson(reserved.operation);
    const id = body.operationId,
      secret = env.AI_WORKER_SECRET;
    const execute = async () => {
      try {
        const reservedAi = await gateway.reserveEnhancement({
          operationId: id,
          snapshotId: snapshot.id,
          revision: snapshot.revision,
          targetId: input.targetId,
          policy: `${env.AI_PROCESSING_POLICY!.slice(0, 90)}:integration`,
          secret,
        });
        if (!reservedAi.created) throw Error("AI_REQUEST_UNKNOWN");
        const ledger = {
          durability: "durable" as const,
          begin: (s: Parameters<Gateway["beginAttempt"]>[0]) =>
            gateway.beginAttempt(s, secret),
          finish: (id: string, r: Parameters<Gateway["finishAttempt"]>[1]) =>
            gateway.finishAttempt(id, r, secret),
          report: async () => {
            throw Error("REPORT_UNCONNECTED");
          },
        };
        const run =
          options.run ??
          configuredStructuredRunner(
            env,
            userId,
            ledger,
            AbortSignal.timeout(90000),
          );
        const proposal = await intelligenceOperations(run).rewrite({
          operationId: id,
          userId,
          draft: candidate,
          targetId: input.targetId,
        });
        const revised = acceptWording(candidate, input.targetId, {
          text: proposal.text,
          scope: "experience",
          origin: "ai_generated",
          sources: context.facts.filter((f) => proposal.factIds.includes(f.id)),
        });
        return await gateway.finishWorkspaceOperation(
          id,
          "ready",
          { proposal, draft: encodeDraft(revised) },
          secret,
        );
      } catch (error) {
        await gateway.finishWorkspaceOperation(
          id,
          error instanceof Error &&
            [
              "AI_OUTPUT_INVALID",
              "AI_OUTPUT_TRUNCATED",
              "AI_PROVIDER_REJECTED",
              "REWRITE_OUTPUT",
              "OUTPUT_UNSUPPORTED",
              "INVALID_SCOPED_CONTEXT",
            ].includes(error.message)
            ? "failed"
            : "unknown",
          null,
          secret,
        );
        throw error;
      }
    };
    const task = execute();
    options.waitUntil?.(task.catch(() => undefined));
    return privateJson(await task);
  } catch (error) {
    if ((error as { code?: string }).code === "BASE_GENERATION_CONFLICT")
      return privateJson({ error: { code: "profileRemoved" } }, 410);
    return routeError(error);
  }
}
