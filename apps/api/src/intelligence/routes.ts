import {
  decodeDraft,
  type DraftSnapshot,
} from "@resumora/contracts/editor/transport";
import { documentLimits } from "@resumora/contracts/intelligence/model";
import { readBody } from "../cv/routes.ts";
import type { intelligenceOperations } from "./operations.ts";
import type { importWorkflow } from "./import-workflow.ts";
export interface IntelligenceGateway {
  loadSnapshot(id: string): Promise<DraftSnapshot | null>;
  loadDraft(): Promise<DraftSnapshot | null>;
  reserveCareer(input: {
    operationId: string;
    snapshotId: string;
    revision: number;
    targetId: string;
    kind: "questions" | "rewrite";
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
  /^\/v1\/intelligence\/imports\/[0-9a-f-]+(?:\/cancel)?$/i.test(path) ||
  ["/v1/intelligence/questions", "/v1/intelligence/rewrite"].includes(path);
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
  },
) {
  const path = new URL(request.url).pathname,
    match = path.match(/^\/v1\/intelligence\/imports\/([^/]+)(\/cancel)?$/);
  try {
    if (match) {
      if (!uuid(match[1])) return fail("INVALID_REQUEST", 400);
      if (!match[2] && request.method === "GET")
        return json(await options.workflow.status(match[1]));
      if (match[2] && request.method === "POST")
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
      !["/v1/intelligence/questions", "/v1/intelligence/rewrite"].includes(path)
    )
      return fail("MISSING", 404);
    if (request.method !== "POST") return fail("METHOD", 405);
    if (!options.enabled) return fail("AI_DISABLED", 503);
    const body = await readBody(request);
    if (body instanceof Response) return body;
    if (
      Object.keys(body).some(
        (k) =>
          !["snapshotId", "revision", "targetId", "operationId"].includes(k),
      ) ||
      !uuid(body.operationId) ||
      !uuid(body.snapshotId) ||
      !Number.isSafeInteger(body.revision) ||
      Number(body.revision) < 1 ||
      typeof body.targetId !== "string" ||
      !/^[-A-Za-z0-9_:]{1,128}$/.test(body.targetId)
    )
      return fail("INVALID_REQUEST", 400);
    const [snapshot, head] = await Promise.all([
      options.gateway.loadSnapshot(body.snapshotId),
      options.gateway.loadDraft(),
    ]);
    if (!snapshot || snapshot.revision !== body.revision)
      return fail("MISSING", 404);
    if (head?.id !== snapshot.id) return fail("STALE_INPUT", 409);
    const draft = decodeDraft(snapshot.payload),
      kind = path.endsWith("questions") ? "questions" : "rewrite";
    // Resolve/validate target before reserving any operation or invoking provider.
    if (
      !draft.roles.some((r) => r.id === body.targetId) &&
      !draft.optionalSections
        .filter((s) => s.kind !== "languages")
        .some((s) => s.entries.some((e) => e.id === body.targetId))
    )
      return fail("INVALID_TARGET", 422);
    if (
      !(await options.gateway.reserveCareer({
        operationId: body.operationId,
        snapshotId: snapshot.id,
        revision: snapshot.revision,
        targetId: body.targetId,
        kind,
      }))
    )
      return fail("ALREADY_REQUESTED", 409);
    const context = {
      operationId: body.operationId,
      userId: options.userId,
      draft,
      targetId: body.targetId,
    };
    return json(
      kind === "questions"
        ? await options.operations.questions(context)
        : await options.operations.rewrite(context),
    );
  } catch (error) {
    const e = error as { code?: string; status?: number; message?: string };
    if (e.status && [400, 401, 403, 404, 409, 410, 413, 422].includes(e.status))
      return fail(e.code ?? "REJECTED", e.status);
    const safe = new Set(["DOCUMENT_SIZE", "DOCUMENT_TYPE", "UPLOAD_TIMEOUT"]);
    return fail(
      safe.has(e.message ?? "") ? e.message! : "INTELLIGENCE_UNAVAILABLE",
      e.message === "DOCUMENT_SIZE" ? 413 : 503,
    );
  }
}
