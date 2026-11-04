import { contentLocale, contentLanguagePolicyVersion, languageDetectionOperationId, languageNarrativeFingerprint } from '@resumora/contracts/editor/content-language';
import { languageDetectionPlan } from './language-operations.ts';
import { equalValues } from "@resumora/contracts/editor/model";
import { skillReviewFingerprint, isSkillsImprovementResult } from "@resumora/contracts/intelligence/skills-improvement";
import {
  experienceFingerprint,
  experienceScoreFingerprint,
  experienceScoreOperationId,
  isExperienceRequest,
} from "@resumora/contracts/intelligence/experience";
import { validateExperienceInput } from "./experience-operations.ts";
import { experienceStream } from './experience-stream.ts';
import {
  decodeDraft,
  type DraftSnapshot,
} from "@resumora/contracts/editor/transport";
import { documentLimits } from "@resumora/contracts/intelligence/model";
import { readBody } from "../cv/routes.ts";
import type { intelligenceOperations } from "./operations.ts";
import type { importWorkflow } from "./import-workflow.ts";
export interface IntelligenceGateway {
  getWorkspaceOperation?: (
    id: string,
  ) => Promise<
    import("@resumora/contracts/editor/workspace").CareerOperation | null
  >;
  beginWorkspaceOperation?: (
    id: string,
    kind: "questions" | "rewrite",
    input: Record<string, unknown>,
  ) => Promise<{ created: boolean }>;
  finishWorkspaceOperation?: (
    id: string,
    state: "ready" | "unknown" | "failed",
    result: unknown,
  ) => Promise<unknown>;
  loadSnapshot(id: string): Promise<DraftSnapshot | null>;
  loadDraft(): Promise<DraftSnapshot | null>;
  reserveCareer(input: {
    operationId: string;
    snapshotId: string;
    revision: number;
    targetId: string;
    kind: "questions" | "rewrite" | "score";
  }): Promise<boolean>;
}
const uuid = (v: unknown): v is string =>
  typeof v === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v,
  );
const json = (value: unknown, status = 200) =>
  Response.json(value, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
const fail = (code: string, status: number) =>
  json({ error: { code } }, status);
export const isIntelligencePath = (path: string) =>
  path === "/v1/intelligence/imports" ||
  path === "/v1/intelligence/imports/pending" ||
  /^\/v1\/intelligence\/imports\/[0-9a-f-]+(?:\/(?:cancel|source))?$/i.test(
    path,
  ) ||
  [
    "/v1/intelligence/language",
    "/v1/intelligence/questions",
    "/v1/intelligence/rewrite",
    "/v1/intelligence/experience",
    "/v1/intelligence/skills",
  ].includes(path);
async function readDocument(request: Request): Promise<Uint8Array> {
  if (request.headers.get("Content-Type") !== "application/octet-stream")
    throw new Error("DOCUMENT_TYPE");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("DOCUMENT_SIZE");
  const chunks: Uint8Array[] = [];
  let size = 0;
  const deadline = AbortSignal.any([
    request.signal,
    AbortSignal.timeout(15000),
  ]);
  let abort: () => void = () => {};
  const stopped = new Promise<never>((_, reject) => {
    abort = () => {
      void reader.cancel();
      reject(new Error("UPLOAD_TIMEOUT"));
    };
    deadline.addEventListener("abort", abort, { once: true });
    if (deadline.aborted) abort();
  });
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), stopped]);
      if (done) break;
      size += value.length;
      if (size > documentLimits.bytes) throw new Error("DOCUMENT_SIZE");
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let pos = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, pos);
      pos += chunk.length;
    }
    return bytes;
  } finally {
    deadline.removeEventListener("abort", abort);
    reader.releaseLock();
  }
}
/** Called only after session verification and Origin/CSRF checks, using a user-scoped gateway. */
export async function intelligenceRoute(
  request: Request,
  options: {
    enabled: boolean;
    userId: string;
    signal?: AbortSignal;
    gateway: IntelligenceGateway;
    workflow: ReturnType<typeof importWorkflow>;
    operations: ReturnType<typeof intelligenceOperations>;
    waitUntil?: (promise: Promise<unknown>) => void;
    onDraft?: (text: string) => void;
  },
): Promise<Response> {
  const path = new URL(request.url).pathname,
    match = path.match(
      /^\/v1\/intelligence\/imports\/([^/]+)(\/(?:cancel|source))?$/,
    );
  let persistedOperation: string | null = null;
  let completedResult: unknown;
  let languageResultCurrent: (() => Promise<boolean>) | undefined;
  let skillsResultCurrent: (() => Promise<boolean>) | undefined;
  // Retrying receipt persistence never repeats inference. Read back a lost acknowledgement first.
  const persistResult = async (id: string, result: unknown) => {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await options.gateway.finishWorkspaceOperation?.(id, "ready", result);
        return;
      } catch (error) {
        const receipt = await options.gateway
          .getWorkspaceOperation?.(id)
          .catch(() => null);
        if (receipt?.state === "ready" && equalValues(receipt.result, result))
          return;
        if (attempt === 1) throw error;
      }
    }
  };
  try {
    if (path === "/v1/intelligence/imports/pending") {
      if (request.method !== "GET") return fail("METHOD", 405);
      return json(await options.workflow.pending());
    }
    if (match) {
      if (!uuid(match[1])) return fail("INVALID_REQUEST", 400);
      if (match[2] === "/source" && request.method === "GET") {
        const source = await options.workflow.source(match[1]);
        if ("text" in source) return json(source);
        return new Response(source.bytes as Uint8Array<ArrayBuffer>, {
          headers: {
            "Content-Type":
              source.format === "pdf"
                ? "application/pdf"
                : "application/octet-stream",
            "Content-Disposition": "attachment",
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
            "Referrer-Policy": "no-referrer",
            "Content-Security-Policy": "default-src 'none'; sandbox",
          },
        });
      }
      if (!match[2] && request.method === "GET")
        return json(await options.workflow.status(match[1]));
      if (match[2] === "/cancel" && request.method === "POST")
        return json(await options.workflow.cancel(match[1]));
      return fail("METHOD", 405);
    }
    if (path === "/v1/intelligence/imports") {
      if (request.method === "GET") return json(await options.workflow.list());
      if (request.method !== "POST") return fail("METHOD", 405);
      const operationId = request.headers.get("X-Operation-Id"),
        revision = request.headers.get("X-Expected-Revision"),
        format = request.headers.get("X-Document-Format");
      if (
        !uuid(operationId) ||
        !revision ||
        !/^\d{1,12}$/.test(revision) ||
        !["pdf", "docx", "doc"].includes(format ?? "")
      )
        return fail("INVALID_REQUEST", 400);
      return json(
        await options.workflow.start({
          operationId,
          format: format!,
          expectedRevision: Number(revision),
          bytes: await readDocument(request),
          signal: options.signal ?? request.signal,
        }),
      );
    }
    if (
      ![
        "/v1/intelligence/language",
        "/v1/intelligence/questions",
        "/v1/intelligence/rewrite",
        "/v1/intelligence/experience",
        "/v1/intelligence/skills",
      ].includes(path)
    )
      return fail("MISSING", 404);
    if (request.method !== "POST") return fail("METHOD", 405);
    if (!options.enabled) return fail("AI_DISABLED", 503);
    if (path === '/v1/intelligence/language') {
      const body = await readBody(request);
      if (body instanceof Response) return body;
      if (Object.keys(body).some(k => !['snapshotId', 'revision', 'targetId', 'operationId', 'languageAttempt'].includes(k)) ||
          !uuid(body.operationId) || !uuid(body.snapshotId) || !Number.isSafeInteger(body.revision) || Number(body.revision) < 1 ||
          typeof body.targetId !== 'string' || (body.languageAttempt !== undefined && (!Number.isSafeInteger(body.languageAttempt) || Number(body.languageAttempt) < 0 || Number(body.languageAttempt) > 3))) return fail('INVALID_REQUEST', 400);
      const attempt = Number(body.languageAttempt ?? 0);
      const [snapshot, head] = await Promise.all([options.gateway.loadSnapshot(body.snapshotId), options.gateway.loadDraft()]);
      if (!snapshot || snapshot.revision !== body.revision) return fail('MISSING', 404);
      const draft = decodeDraft(snapshot.payload);
      if (body.targetId !== draft.id || body.operationId !== await languageDetectionOperationId(draft, attempt)) return fail('INVALID_REQUEST', 400);
      const compatible = async (current: DraftSnapshot | null) => !!current && decodeDraft(current.payload).id === draft.id &&
        await languageDetectionOperationId(decodeDraft(current.payload), attempt) === body.operationId;
      if (!await compatible(head)) return fail('STALE_INPUT', 409);
      const operationInput = { snapshotId: snapshot.id, revision: snapshot.revision, targetId: draft.id, profileId: draft.id, languageDetection: true,
        narrativeFingerprint: await languageNarrativeFingerprint(draft), policyVersion: contentLanguagePolicyVersion, ...(attempt ? { languageAttempt: attempt } : {}) };
      const replay = (previous: NonNullable<Awaited<ReturnType<NonNullable<IntelligenceGateway['getWorkspaceOperation']>>>>) => {
        if (previous.kind !== 'rewrite' || !equalValues(
          { ...previous.input, snapshotId: snapshot.id, revision: snapshot.revision }, operationInput)) return fail('IDEMPOTENCY_BODY_MISMATCH', 409);
        return previous.state === 'ready' ? json(previous.result) : previous.state === 'failed' ? fail('AI_OUTPUT_INVALID', 502) : fail('ALREADY_REQUESTED', 409);
      };
      const previous = await options.gateway.getWorkspaceOperation?.(body.operationId);
      if (previous) return replay(previous);
      if (attempt) {
        const prior = await options.gateway.getWorkspaceOperation?.(await languageDetectionOperationId(draft, attempt - 1));
        const unavailable = prior?.state === 'ready' && (prior.result as { status?: string } | null)?.status === 'unavailable';
        if (!['failed', 'unknown'].includes(prior?.state ?? '') && !unavailable) return fail('CONTENT_LANGUAGE_RETRY_BLOCKED', 409);
      }
      // Durable receipt + existing owned snapshot reservation fence concurrent/uncertain paid work.
      if (!options.gateway.beginWorkspaceOperation || !options.gateway.finishWorkspaceOperation) return fail('AI_UNCONFIGURED', 503);
      let begun;
      try { begun = await options.gateway.beginWorkspaceOperation(body.operationId, 'rewrite', operationInput); }
      catch (error) {
        const concurrent = await options.gateway.getWorkspaceOperation?.(body.operationId);
        if (concurrent) return replay(concurrent);
        throw error;
      }
      if (!begun.created) {
        const concurrent = await options.gateway.getWorkspaceOperation?.(body.operationId);
        return concurrent ? replay(concurrent) : fail('ALREADY_REQUESTED', 409);
      }
      persistedOperation = body.operationId;
      const plan = await languageDetectionPlan(draft);
      if (plan.needsInference && !await options.gateway.reserveCareer({ operationId: body.operationId,
        snapshotId: snapshot.id, revision: snapshot.revision, targetId: draft.id, kind: 'rewrite' })) return fail('ALREADY_REQUESTED', 409);
      languageResultCurrent = async () => compatible(await options.gateway.loadDraft());
      const result = await options.operations.detectLanguage({ operationId: body.operationId, userId: options.userId, draft });
      if (!await languageResultCurrent()) { await persistResult(body.operationId, result); return fail("STALE_INPUT", 409); }
      completedResult = result;
      await persistResult(body.operationId, result);
      // A response cannot attach to changed content, a replacement profile or a deleted base.
      if (!await compatible(await options.gateway.loadDraft())) return fail('STALE_INPUT', 409);
      return json(result);
    }
    if (path === "/v1/intelligence/skills") {
      const body = await readBody(request);
      if (body instanceof Response) return body;
      if (Object.keys(body).some(k => !["snapshotId", "revision", "targetId", "operationId", "fingerprint"].includes(k)) ||
          !uuid(body.operationId) || !uuid(body.snapshotId) || !Number.isSafeInteger(body.revision) || Number(body.revision) < 1 ||
          typeof body.targetId !== "string" || typeof body.fingerprint !== "string" || !/^[a-f0-9]{64}$/.test(body.fingerprint))
        return fail("INVALID_REQUEST", 400);
      // A complete receipt boundary is required before this multi-stage paid action.
      if (!options.gateway.getWorkspaceOperation || !options.gateway.beginWorkspaceOperation || !options.gateway.finishWorkspaceOperation)
        return fail("AI_UNCONFIGURED", 503);
      const [snapshot, head] = await Promise.all([
        options.gateway.loadSnapshot(body.snapshotId), options.gateway.loadDraft(),
      ]);
      if (!snapshot || snapshot.revision !== body.revision) return fail("MISSING", 404);
      const draft = decodeDraft(snapshot.payload);
      if (body.targetId !== draft.id) return fail("INVALID_TARGET", 422);
      if (await skillReviewFingerprint(draft) !== body.fingerprint) return fail("STALE_INPUT", 409);
      if (draft.contentLanguage?.status === "unavailable") return fail("CONTENT_LANGUAGE_UNAVAILABLE", 422);
      const languagePlan = await languageDetectionPlan(draft);
      if (!languagePlan.reliable && languagePlan.substantial) return fail("CONTENT_LANGUAGE_REQUIRED", 409);
      const compatible = async (current: DraftSnapshot | null): Promise<boolean> => {
        if (!current) return false;
        try {
          const currentDraft = decodeDraft(current.payload);
          if (currentDraft.id !== draft.id || currentDraft.contentLanguage?.status === "unavailable" ||
              await skillReviewFingerprint(currentDraft) !== body.fingerprint) return false;
          const plan = await languageDetectionPlan(currentDraft);
          return plan.reliable || !plan.substantial;
        } catch { return false; }
      };
      if (!await compatible(head)) return fail("STALE_INPUT", 409);
      skillsResultCurrent = async () => compatible(await options.gateway.loadDraft());
      const operationInput = {
        snapshotId: snapshot.id, revision: snapshot.revision, targetId: draft.id, profileId: draft.id,
        fingerprint: body.fingerprint, skillsImprovement: true,
        contentLocale: contentLocale(draft), languagePolicyVersion: contentLanguagePolicyVersion,
      };
      const replay = async (previous: NonNullable<Awaited<ReturnType<NonNullable<IntelligenceGateway["getWorkspaceOperation"]>>>>) => {
        // The fingerprint owns the input; harmless metadata autosaves can change snapshot pins.
        if (previous.kind !== "rewrite" || !equalValues({ ...previous.input, snapshotId: snapshot.id, revision: snapshot.revision }, operationInput))
          return fail("IDEMPOTENCY_BODY_MISMATCH", 409);
        if (previous.state !== "ready") return previous.state === "failed" ? fail("AI_REQUEST_FAILED", 502) : fail("ALREADY_REQUESTED", 409);
        if (!isSkillsImprovementResult(previous.result) || previous.result.fingerprint !== body.fingerprint) return fail("AI_OUTPUT_INVALID", 502);
        if (!await skillsResultCurrent!()) return fail("STALE_INPUT", 409);
        return json(previous.result);
      };
      const previous = await options.gateway.getWorkspaceOperation(body.operationId);
      if (previous) return await replay(previous);
      let begun;
      try { begun = await options.gateway.beginWorkspaceOperation(body.operationId, "rewrite", operationInput); }
      catch (error) {
        const concurrent = await options.gateway.getWorkspaceOperation(body.operationId);
        if (concurrent) return await replay(concurrent);
        throw error;
      }
      if (!begun.created) {
        const concurrent = await options.gateway.getWorkspaceOperation(body.operationId);
        return concurrent ? await replay(concurrent) : fail("ALREADY_REQUESTED", 409);
      }
      persistedOperation = body.operationId;
      if (!await options.gateway.reserveCareer({ operationId: body.operationId, snapshotId: snapshot.id, revision: snapshot.revision, targetId: draft.id, kind: "rewrite" }))
        return fail("ALREADY_REQUESTED", 409);
      const result = await options.operations.improveSkills({
        operationId: body.operationId, userId: options.userId, draft, fingerprint: body.fingerprint,
        snapshot: { id: snapshot.id, revision: snapshot.revision },
      });
      if (!isSkillsImprovementResult(result) || result.fingerprint !== body.fingerprint) throw Error("AI_OUTPUT_INVALID");
      completedResult = result;
      const currentAfterRun = await skillsResultCurrent().catch(() => false);
      // Stale results still settle the durable receipt; replay must never repeat paid work.
      await persistResult(body.operationId, result);
      if (!currentAfterRun || !await skillsResultCurrent()) return fail("STALE_INPUT", 409);
      return json(result);
    }
    const wantsStream = path.endsWith('/experience') && request.headers.get('Accept')?.includes('text/event-stream') && !options.onDraft;
    const streamRequest = wantsStream ? request.clone() : undefined;
    const body = await readBody(request);
    if (body instanceof Response) return body;
    if (
      Object.keys(body).some(
        (k) =>
          ![
            "snapshotId",
            "revision",
            "targetId",
            "operationId",
            "purpose",
            ...(path.endsWith("experience") ? ["experience"] : []),
          ].includes(k),
      ) ||
      (path.endsWith("experience") &&
        (!isExperienceRequest(body.experience) ||
          body.purpose !== undefined)) ||
      (body.purpose !== undefined &&
        (body.purpose !== "summary" || path.endsWith("questions"))) ||
      !uuid(body.operationId) ||
      !uuid(body.snapshotId) ||
      !Number.isSafeInteger(body.revision) ||
      Number(body.revision) < 1 ||
      typeof body.targetId !== "string" ||
      !/^[-A-Za-z0-9_:]{1,128}$/.test(body.targetId)
    )
      return fail("INVALID_REQUEST", 400);
    if (streamRequest) return experienceStream(body.operationId as string,
      onDraft => intelligenceRoute(streamRequest, { ...options, onDraft }), options.waitUntil);
    const [snapshot, head] = await Promise.all([
      options.gateway.loadSnapshot(body.snapshotId),
      options.gateway.loadDraft(),
    ]);
    if (!snapshot || snapshot.revision !== body.revision)
      return fail("MISSING", 404);
    const draft = decodeDraft(snapshot.payload);
    const experience =
      path.endsWith("experience") && isExperienceRequest(body.experience)
        ? body.experience
        : undefined;
    if (draft.contentLanguage?.status === "unavailable") return fail("CONTENT_LANGUAGE_UNAVAILABLE", 422);
    const languagePlan = await languageDetectionPlan(draft);
    if (!languagePlan.reliable && languagePlan.substantial) return fail('CONTENT_LANGUAGE_REQUIRED', 409);
    if (experience)
      await validateExperienceInput(draft, body.targetId as string, experience);
    const scoring =
      experience?.intent === "score" &&
      experience.fingerprint ===
        (await experienceScoreFingerprint(
          draft,
          body.targetId as string,
          contentLocale(draft),
        ));
    if (
      scoring &&
      body.operationId !==
        (await experienceScoreOperationId(
          draft,
          body.targetId as string,
          experience.scoreAttempt,
          contentLocale(draft),
        ))
    )
      return fail("INVALID_REQUEST", 400);
    if (scoring && experience.scoreAttempt) {
      const previousAttempt = await options.gateway.getWorkspaceOperation?.(
        await experienceScoreOperationId(
          draft,
          body.targetId as string,
          experience.scoreAttempt - 1,
          contentLocale(draft),
        ),
      );
      if (!["failed", "ready", "unknown"].includes(previousAttempt?.state ?? ""))
        return fail("INVALID_REQUEST", 400);
    }
    if (!experience && head?.id !== snapshot.id)
      return fail("STALE_INPUT", 409);
    const kind =
      path.endsWith("questions") || experience?.intent === "questions"
        ? "questions"
        : "rewrite";
    const operationInput = {
      snapshotId: body.snapshotId,
      revision: body.revision,
      targetId: body.targetId,
      ...(experience ? { experience } : {}),
      ...(scoring ? { profileId: draft.id } : {}),
      ...(body.purpose === "summary" ? { purpose: "summary" as const } : {}),
      ...(!experience ? { contentLocale: contentLocale(draft), languagePolicyVersion: contentLanguagePolicyVersion } : {}),
    };
    // Scoring is bound to content, not the autosave revision which happened to dispatch it.
    const matchesOperation = (
      previous: NonNullable<
        Awaited<
          ReturnType<NonNullable<IntelligenceGateway["getWorkspaceOperation"]>>
        >
      >,
    ) =>
      previous.kind === kind &&
      (scoring
        ? previous.input.profileId === draft.id &&
          previous.input.targetId === body.targetId &&
          equalValues(previous.input.experience, experience)
        : equalValues(previous.input, operationInput));
    const replay = (
      previous: NonNullable<
        Awaited<
          ReturnType<NonNullable<IntelligenceGateway["getWorkspaceOperation"]>>
        >
      >,
    ) => {
      if (!matchesOperation(previous))
        return fail("IDEMPOTENCY_BODY_MISMATCH", 409);
      if (previous.state === "ready") return json(previous.result);
      if (previous.state === "failed") return fail("AI_REQUEST_FAILED", 502);
      return fail("ALREADY_REQUESTED", 409);
    };
    const previous = await options.gateway.getWorkspaceOperation?.(
      body.operationId,
    );
    if (previous) {
      return replay(previous);
    }
    if (experience && head?.id !== snapshot.id) {
      if (experience.intent === 'preview' && head)
        await validateExperienceInput(decodeDraft(head.payload), body.targetId as string, experience);
      // Metadata autosaves and unrelated role edits do not stale unchanged, owned experience input.
      try {
        if (
          !head ||
          (scoring && decodeDraft(head.payload).id !== draft.id) ||
          (await (scoring
            ? experienceScoreFingerprint(
                decodeDraft(head.payload),
                body.targetId as string,
                contentLocale(decodeDraft(head.payload)),
              )
            : experienceFingerprint(
                decodeDraft(head.payload),
                body.targetId as string,
              ))) !== experience.fingerprint
        )
          return fail("STALE_INPUT", 409);
      } catch {
        return fail("STALE_INPUT", 409);
      }
    }
    // Resolve/validate target before reserving any operation or invoking provider.
    if (
      !draft.roles.some((r) => r.id === body.targetId) &&
      !draft.optionalSections
        .filter((s) => s.kind !== "languages")
        .some((s) => s.entries.some((e) => e.id === body.targetId))
    )
      return fail("INVALID_TARGET", 422);
    if (
      body.purpose === "summary" &&
      !draft.roles.some((r) => r.id === body.targetId)
    )
      return fail("INVALID_TARGET", 422);
    if (options.gateway.beginWorkspaceOperation) {
      try {
        const begun = await options.gateway.beginWorkspaceOperation(
          body.operationId,
          kind,
          operationInput,
        );
        if (!begun.created) {
          const concurrent = await options.gateway.getWorkspaceOperation?.(
            body.operationId,
          );
          return concurrent
            ? replay(concurrent)
            : fail("ALREADY_REQUESTED", 409);
        }
      } catch (error) {
        // Two tabs may race with different snapshot revisions for the same scoring input.
        const concurrent = scoring
          ? await options.gateway.getWorkspaceOperation?.(body.operationId)
          : null;
        if (concurrent) return replay(concurrent);
        throw error;
      }
      persistedOperation = body.operationId;
    }
    if (
      !(await options.gateway.reserveCareer({
        operationId: body.operationId,
        snapshotId: snapshot.id,
        revision: snapshot.revision,
        targetId: body.targetId,
        kind: scoring ? "score" : kind,
      }))
    )
      return fail("ALREADY_REQUESTED", 409);
    const context = {
      operationId: body.operationId,
      userId: options.userId,
      draft,
      targetId: body.targetId,
      ...(body.purpose === "summary" ? { purpose: "summary" as const } : {}),
    };
    const result = experience
      ? await options.operations.experience({
          ...context,
          request: experience,
          onDraft: options.onDraft,
          snapshot: { id: snapshot.id, revision: snapshot.revision },
        })
      : kind === "questions"
        ? await options.operations.questions(context)
        : await options.operations.rewrite(context);
    completedResult = result;
    if (persistedOperation) await persistResult(persistedOperation, result);
    return json(result);
  } catch (error) {
    if (completedResult !== undefined) {
      if (skillsResultCurrent) {
        // Even stale completed work needs a recoverable receipt after an outage.
        if (persistedOperation) options.waitUntil?.(persistResult(persistedOperation, completedResult).catch(() => undefined));
        if (!await skillsResultCurrent().catch(() => false)) return fail("STALE_INPUT", 409);
      }
      if (languageResultCurrent && !await languageResultCurrent().catch(() => false)) return fail("STALE_INPUT", 409);
      // A receipt outage must not discard a validated result already available to the user.
      if (persistedOperation && !skillsResultCurrent)
        options.waitUntil?.(
          persistResult(persistedOperation, completedResult).catch(
            () => undefined,
          ),
        );
      const response = json(completedResult);
      response.headers.set("X-Result-Receipt", "pending");
      return response;
    }
    const definite =
      error instanceof Error &&
      [
        "AI_OUTPUT_INVALID",
        "AI_OUTPUT_TRUNCATED",
        "AI_PROVIDER_REJECTED",
        "AI_REQUEST_FAILED",
        "QUESTION_OUTPUT",
        "QUESTION_REPEATED",
        "REWRITE_OUTPUT",
        "OUTPUT_UNSUPPORTED",
        "INVALID_SCOPED_CONTEXT",
        "AI_UNCONFIGURED",
        "AI_DISABLED",
        "INVALID_TARGET",
        "INVALID_POINT",
      ].includes(error.message);
    if (persistedOperation)
      await options.gateway
        .finishWorkspaceOperation?.(
          persistedOperation,
          definite ? "failed" : "unknown",
          definite ? { error: { code: (error as Error).message } } : null,
        )
        .catch(() => undefined);
    const e = error as { code?: string; status?: number; message?: string };
    if (e.status && [400, 401, 403, 404, 409, 410, 413, 422].includes(e.status))
      return fail(e.code ?? "REJECTED", e.status);
    const questionErrors: Record<string, number> = {
      BASE_CV_EXISTS: 409,
      AI_OUTPUT_TRUNCATED: 502,
      AI_OUTPUT_INVALID: 502,
      AI_UNCONFIGURED: 503,
      AI_TIMEOUT_UNKNOWN: 504,
      AI_REQUEST_UNKNOWN: 503,
      AI_PROVIDER_REJECTED: 502,
      AI_REQUEST_FAILED: 502,
      REWRITE_OUTPUT: 502,
      QUESTION_OUTPUT: 502,
      QUESTION_REPEATED: 422,
      INVALID_SCOPED_CONTEXT: 422,
    };
    if (Object.hasOwn(questionErrors, e.message ?? ""))
      return fail(e.message!, questionErrors[e.message!]);
    const safe = new Set(["DOCUMENT_SIZE", "DOCUMENT_TYPE", "UPLOAD_TIMEOUT"]);
    return fail(
      safe.has(e.message ?? "") ? e.message! : "INTELLIGENCE_UNAVAILABLE",
      e.message === "DOCUMENT_SIZE" ? 413 : 503,
    );
  }
}
