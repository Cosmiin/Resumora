import {
  decodeDraft,
  encodeDraft,
  isBaseDraft,
  type CvDraftGateway,
  type DraftSnapshot,
} from "@resumora/contracts/editor/transport";
import { validateDraft } from "@resumora/contracts/editor/validation";
export type { CvDraftGateway } from "@resumora/contracts/editor/transport";

const routes: Record<string, string> = {
  "/v1/base-cv": "GET",
  "/v1/base-cv/history": "GET",
  "/v1/base-cv/save": "POST",
  "/v1/base-cv/restore": "POST",
  "/v1/base-cv/remove": "POST",
  "/v1/base-cv/removal-cleanup": "POST",
};
const uuid = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  ) &&
  value !== "00000000-0000-0000-0000-000000000000";
const revision = (v: unknown): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const json = (
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
) =>
  Response.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      ...headers,
    },
  });
const failure = (code: string, status: number) =>
  json({ error: { code } }, status);
function snapshot(row: DraftSnapshot) {
  const { payload, ...metadata } = row;
  return { ...metadata, draft: decodeDraft(payload) };
}
export async function readBody(
  request: Request,
): Promise<Record<string, unknown> | Response> {
  if (
    request.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase() !==
    "application/json"
  )
    return failure("invalidRequest", 415);
  const reader = request.body?.getReader();
  if (!reader) return failure("invalidRequest", 400);
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 1048576) {
        await reader.cancel();
        return failure("invalidRequest", 413);
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const parsed: unknown = JSON.parse(
      new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes),
    );
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : failure("invalidRequest", 400);
  } catch {
    return failure("invalidRequest", 400);
  }
}

// The caller must authenticate without cookie mutation, enforce Origin/CSRF on
// writes and supply only that request's authenticated gateway.
export async function cvRoute(
  request: Request,
  gateway: CvDraftGateway,
): Promise<Response> {
  const path = new URL(request.url).pathname;
  const method = routes[path];
  if (!method) return failure("missing", 404);
  if (request.method !== method)
    return json({ error: { code: "method" } }, 405, { Allow: method });
  try {
    if (path === "/v1/base-cv") {
      if (gateway.loadBaseState) {
        const state = await gateway.loadBaseState();
        return json(state.snapshot ? snapshot(state.snapshot) : null, 200, {
          "X-Base-Generation": String(state.generation),
          "X-Base-Revision": String(state.revision),
          "X-Base-Cleanup-Pending": String(state.cleanupPending),
        });
      }
      const row = await gateway.loadDraft();
      return json(row ? snapshot(row) : null);
    }
    if (path === "/v1/base-cv/history") {
      const query = new URL(request.url).searchParams;
      const cursor = query.get("beforeRevision");
      if (
        [...query.keys()].some((key) => key !== "beforeRevision") ||
        query.getAll("beforeRevision").length > 1 ||
        (cursor !== null &&
          (!/^[1-9][0-9]*$/.test(cursor) ||
            !Number.isSafeInteger(Number(cursor))))
      )
        return failure("invalidRequest", 400);
      return json(
        (
          await gateway.draftHistory({
            ...(cursor === null ? {} : { beforeRevision: Number(cursor) }),
            limit: 20,
          })
        ).map(snapshot),
      );
    }
    const body = await readBody(request);
    if (body instanceof Response) return body;
    if (path === "/v1/base-cv/removal-cleanup") {
      if (Object.keys(body).length) return failure("invalidRequest", 400);
      if (!gateway.retryBaseCleanup) return failure("unavailable", 503);
      return json(await gateway.retryBaseCleanup());
    }
    if (!uuid(body.requestId) || !revision(body.expectedRevision))
      return failure("invalidRequest", 400);
    if (path === "/v1/base-cv/remove") {
      if (Object.keys(body).some((key) => !["requestId", "expectedRevision", "expectedGeneration"].includes(key)) || !revision(body.expectedGeneration)) return failure("invalidRequest", 400);
      if (!gateway.removeBase) return failure("unavailable", 503);
      return json(await gateway.removeBase({ requestId: body.requestId, expectedRevision: body.expectedRevision, expectedGeneration: body.expectedGeneration }));
    }
    if (path === "/v1/base-cv/save") {
      if (
        Object.keys(body).some(
          (key) =>
            !["requestId", "expectedRevision", "mode", "draft"].includes(key),
        ) ||
        !isBaseDraft(body.draft) ||
        (body.mode !== undefined &&
          body.mode !== "autosave" &&
          body.mode !== "checkpoint")
      )
        return failure("invalidRequest", 400);
      const mode = body.mode ?? "checkpoint";
      const issues = mode === "checkpoint" ? validateDraft(body.draft) : [];
      if (issues.length)
        return json({ error: { code: "validation", issues } }, 422);
      const payload = encodeDraft(body.draft);
      if (body.draft.importReview?.confirmedIds.length) {
        if (!gateway.saveReviewedImport) return failure("unavailable", 503);
        return json(
          snapshot(
            await gateway.saveReviewedImport({
              requestId: body.requestId,
              expectedRevision: body.expectedRevision,
              payload,
              importId: body.draft.importReview.id,
              selected: body.draft.importReview.confirmedIds,
            }),
          ),
        );
      }
      return json(
        snapshot(
          await gateway.saveDraft({
            requestId: body.requestId,
            expectedRevision: body.expectedRevision,
            mode,
            payload,
          }),
        ),
      );
    }
    if (
      Object.keys(body).some(
        (key) => !["requestId", "expectedRevision", "snapshotId"].includes(key),
      ) ||
      !uuid(body.snapshotId)
    )
      return failure("invalidRequest", 400);
    return json(
      snapshot(
        await gateway.restoreDraft({
          requestId: body.requestId,
          expectedRevision: body.expectedRevision,
          snapshotId: body.snapshotId,
        }),
      ),
    );
  } catch (error) {
    const e = error as { status?: number; code?: string } | null;
    if (e?.code === "LEGACY_JOB_DOCUMENT_CONVERSION_REQUIRED" || e?.code === "LEGACY_JOB_DOCUMENT_COLLISION") return failure("preservationRequired", 409);
    if (e?.code === "IDEMPOTENCY_BODY_MISMATCH")
      return failure("requestMismatch", 409);
    if (e?.code === "VERSION_CONFLICT" || e?.code === "BASE_VERSION_CONFLICT")
      return failure("conflict", 409);
    if (e?.status === 404) return failure("missing", 404);
    if (e?.status === 401) return failure("unauthorized", 401);
    if (e?.status === 403) return failure("missing", 404);
    if (e?.status === 400 || e?.status === 413 || e?.status === 422)
      return failure("invalidRequest", e.status);
    // Unknown/expired outcome must remain an error; never re-key/retry writes.
    return failure("unavailable", e?.status === 410 ? 410 : 503);
  }
}
