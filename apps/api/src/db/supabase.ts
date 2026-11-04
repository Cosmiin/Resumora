const positiveRevision = (v: unknown): v is number =>
  Number.isSafeInteger(v) && Number(v) > 0;
import {
  draftKinds,
  validateWorkspaceValue,
} from "@resumora/contracts/editor/workspace";
import { languageGateway } from "./languages.ts";
import { workspaceGateway } from "./workspace.ts";
import { decodeDraft } from "@resumora/contracts/editor/transport";
import type { PhotoAsset } from "../photos/routes.ts";
import { importGateway } from "./imports.ts";
import type { AttemptStart, AttemptResult, Attempt } from "../ai/ledger.ts";
import { boundedJson } from "../ai/http.ts";
import type {
  DraftSnapshot,
  EditorWireEnvelope,
  BaseLifecycle,
  BaseRemoval,
} from "@resumora/contracts/editor/transport";

/** Worker bindings only. Never use a service-role/secret key at this boundary. */
export interface DatabaseConfig {
  SUPABASE_URL?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
}
/** Obtain only from authenticateRequest; Auth owns verification and refresh. */
export interface DatabaseIdentity {
  user: { id: string; email?: string };
  accessToken: string;
}
export class DatabaseError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string) {
    super(code);
    this.status = status;
    this.code = code;
  }
}
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const safeCodes = new Set([
  "VERSION_CONFLICT",
  "IDEMPOTENCY_BODY_MISMATCH",
  "REQUEST_EXPIRED_RECOVER_EXISTING_RESOURCE",
  "COMMAND_IN_PROGRESS",
  "RESOURCE_FORBIDDEN",
  "ACTIVE_WORKSPACE_REQUIRED",
  "AUTHENTICATION_REQUIRED",
  "SNAPSHOT_NOT_FOUND",
  "INVALID_COMMAND_ENVELOPE",
  "INVALID_EDITOR_PAYLOAD",
  "EDITOR_HISTORY_TOO_LARGE",
  "EDITOR_PROFILE_CONFLICT",
]);
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const isBaseLifecycle = (value: unknown): value is BaseLifecycle =>
  record(value) &&
  Number.isSafeInteger(value.generation) &&
  Number(value.generation) >= 0 &&
  Number.isSafeInteger(value.revision) &&
  Number(value.revision) >= 0 &&
  typeof value.cleanupPending === "boolean";
function isSnapshot(value: unknown): boolean {
  return (
    record(value) &&
    typeof value.id === "string" &&
    uuid.test(value.id) &&
    Number.isSafeInteger(value.revision) &&
    (value.revision as number) > 0 &&
    (value.parentId === null ||
      (typeof value.parentId === "string" && uuid.test(value.parentId))) &&
    (value.restoredFrom === undefined ||
      (typeof value.restoredFrom === "string" &&
        uuid.test(value.restoredFrom))) &&
    typeof value.createdAt === "string" &&
    Number.isFinite(Date.parse(value.createdAt)) &&
    ["save", "autosave", "restore"].includes(value.reason as string) &&
    record(value.payload) &&
    value.payload.schemaVersion === "resumora-editor-draft/1" &&
    record(value.payload.content) &&
    Array.isArray(value.payload.answers)
  );
}
function key(value: string) {
  if (!uuid.test(value)) throw new DatabaseError(400, "INVALID_REQUEST");
  return value;
}
function revision(value: number) {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new DatabaseError(400, "INVALID_REQUEST");
  return value;
}
function configuration(env: DatabaseConfig): {
  origin: string;
  apiKey: string;
} {
  try {
    const url = new URL(env.SUPABASE_URL ?? "");
    if (
      url.protocol !== "https:" ||
      !/^[a-z0-9]+\.supabase\.co$/.test(url.hostname) ||
      url.username ||
      url.password ||
      url.port ||
      url.search ||
      url.hash ||
      !["", "/"].includes(url.pathname)
    )
      throw new Error();
    const apiKey = env.SUPABASE_PUBLISHABLE_KEY ?? "";
    if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(apiKey)) throw new Error();
    return { origin: url.origin, apiKey };
  } catch {
    throw new DatabaseError(503, "DATABASE_UNAVAILABLE");
  }
}

export function createDatabaseGateway(
  env: DatabaseConfig,
  identity: DatabaseIdentity,
  transport: typeof fetch = fetch,
) {
  const { origin, apiKey } = configuration(env);
  if (
    !identity ||
    !uuid.test(identity.user?.id ?? "") ||
    !identity.accessToken ||
    identity.accessToken.length > 8192 ||
    /\s/.test(identity.accessToken)
  )
    throw new DatabaseError(401, "UNAUTHORIZED");
  // Never decode a browser subject or replace this token with a privileged key.
  const token = identity.accessToken;
  async function rpc<T>(
    name: string,
    args: Record<string, unknown>,
    maxResponseBytes = 2 * 1048576,
  ): Promise<T> {
    let response: Response;
    try {
      const body = JSON.stringify(args);
      if (new TextEncoder().encode(body).length > 1048576)
        throw new DatabaseError(413, "INVALID_COMMAND_ENVELOPE");
      response = await transport(`${origin}/rest/v1/rpc/${name}`, {
        method: "POST",
        redirect: "manual",
        signal: AbortSignal.timeout(15000),
        headers: {
          apikey: apiKey,
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "Content-Profile": "app",
          "Accept-Profile": "app",
          Accept: "application/json",
        },
        body,
      });
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError(503, "DATABASE_UNAVAILABLE");
    }
    let result: unknown;
    try {
      result = await boundedJson(response, maxResponseBytes);
    } catch {
      throw new DatabaseError(503, "DATABASE_UNAVAILABLE");
    }
    if (!response.ok) {
      if (
        [
          "reserve_photo",
          "finish_photo",
          "read_photo",
          "delete_photo",
          "expire_photo_uploads",
        ].includes(name)
      ) {
        const codes = new Set([
          "PT400",
          "PT401",
          "PT403",
          "PT404",
          "PT409",
          "PT410",
          "PT413",
          "PT422",
          "42501",
          "23502",
          "23503",
          "23505",
          "23514",
          "40001",
          "40P01",
          "55P03",
          "42883",
          "PGRST202",
          "PGRST301",
        ]);
        const reasons = new Set([
          "AUTHENTICATION_REQUIRED",
          "RESOURCE_FORBIDDEN",
          "ACTIVE_WORKSPACE_REQUIRED",
          "PHOTO_NOT_FOUND",
          "PHOTO_NOT_AVAILABLE",
          "IDEMPOTENCY_BODY_MISMATCH",
          "INVALID_COMMAND_ENVELOPE",
          "VERSION_CONFLICT",
        ]);
        console.warn("photo-database", {
          operation: name,
          httpStatus: response.status,
          code:
            record(result) &&
            typeof result.code === "string" &&
            codes.has(result.code)
              ? result.code
              : "UNCLASSIFIED",
          reason:
            record(result) &&
            typeof result.message === "string" &&
            reasons.has(result.message)
              ? result.message
              : "UNCLASSIFIED",
        });
      }
      if (
        record(result) &&
        typeof result.code === "string" &&
        /^PT(400|401|403|404|409|410|413|422)$/.test(result.code)
      ) {
        throw new DatabaseError(
          Number(result.code.slice(2)),
          typeof result.message === "string" && safeCodes.has(result.message)
            ? result.message
            : "DATABASE_REQUEST_REJECTED",
        );
      }
      if (response.status === 401 || response.status === 403)
        throw new DatabaseError(response.status, "UNAUTHORIZED");
      throw new DatabaseError(503, "DATABASE_UNAVAILABLE");
    }
    const workspaceDraft = (v: unknown) => {
      if (
        !record(v) ||
        typeof v.id !== "string" ||
        !uuid.test(v.id) ||
        !draftKinds.includes(v.kind as (typeof draftKinds)[number]) ||
        !positiveRevision(v.revision) ||
        typeof v.updatedAt !== "string" ||
        !Number.isFinite(Date.parse(v.updatedAt))
      )
        return false;
      try {
        validateWorkspaceValue(v.kind as (typeof draftKinds)[number], v.value);
        return true;
      } catch {
        return false;
      }
    };
    const valid =
      name === "load_editor_snapshot"
        ? result === null || record(result)
        : name === "get_pending_cv_import"
          ? result === null || record(result)
          : name === "list_workspace_drafts"
            ? Array.isArray(result) &&
              result.length <= 100 &&
              result.every(workspaceDraft)
            : name === "get_workspace_draft"
              ? result === null || workspaceDraft(result)
              : name === "get_workspace_operation"
                ? result === null || record(result)
                : name === "load_base_state"
                  ? isBaseLifecycle(result) &&
                    "snapshot" in result &&
                    (result.snapshot === null || isSnapshot(result.snapshot))
                  : name === "remove_base_cv"
                    ? isBaseLifecycle(result) &&
                      "removed" in result &&
                      result.removed === true
                    : name === "base_removal_objects"
                      ? Array.isArray(result) &&
                        result.length <= 20 &&
                        result.every(
                          (v) =>
                            record(v) &&
                            ["cv-imports", "cv-photos"].includes(
                              String(v.bucket),
                            ) &&
                            typeof v.objectKey === "string",
                        )
                      : name === "ack_base_removal_object"
                        ? record(result) && result.acknowledged === true
                        : name === "load_base_draft"
                          ? result === null || isSnapshot(result)
                          : name === "base_draft_history"
                            ? Array.isArray(result) &&
                              result.length <= (args.p_limit as number) &&
                              result.every(isSnapshot)
                            : name === "save_base_draft" ||
                                name === "restore_base_draft"
                              ? isSnapshot(result)
                              : name === "list_cv_imports" ||
                                  name === "expired_cv_import_objects"
                                ? Array.isArray(result) && result.length <= 5
                                : name === "expire_photo_uploads"
                                  ? Array.isArray(result) && result.length <= 10
                                  : record(result);

    if (!valid) throw new DatabaseError(503, "DATABASE_UNAVAILABLE");
    return result as T;
  }
  function objectPath(objectKey: string) {
    if (!/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg$/.test(objectKey))
      throw new DatabaseError(503, "DATABASE_UNAVAILABLE");
    return objectKey;
  }
  async function photoStorage(
    path: string,
    init: RequestInit,
  ): Promise<Response> {
    let response: Response;
    try {
      response = await transport(`${origin}/storage/v1/${path}`, {
        ...init,
        redirect: "manual",
        signal: AbortSignal.timeout(15000),
        headers: {
          apikey: apiKey,
          Authorization: `Bearer ${token}`,
          ...init.headers,
        },
      });
    } catch {
      throw new DatabaseError(503, "DATABASE_UNAVAILABLE");
    }
    return response;
  }
  function photoStorageDiagnostic(
    response: Response,
    operation: "write" | "read",
    detail: unknown,
  ) {
    const codes = new Set([
      "AccessDenied",
      "InvalidJWT",
      "InvalidSignature",
      "InvalidRequest",
      "NoSuchBucket",
      "NoSuchKey",
      "not_found",
      "EntityTooLarge",
      "DatabaseError",
      "InternalError",
      "InternalServerError",
      "InvalidMimeType",
      "KeyAlreadyExists",
      "ResourceAlreadyExists",
      "ResourceNotFound",
      "Duplicate",
    ]);
    const candidate = record(detail)
      ? (detail.code ?? detail.error)
      : undefined;
    console.warn("photo-storage-response", {
      operation,
      httpStatus: response.status,
      code:
        typeof candidate === "string" && codes.has(candidate)
          ? candidate
          : "UNCLASSIFIED",
    });
  }
  async function storage(objectKey: string, bytes?: Uint8Array) {
    if (
      !/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/original\.(pdf|docx|doc)$/.test(
        objectKey,
      )
    )
      throw new DatabaseError(400, "INVALID_REQUEST");
    const contentType = objectKey.endsWith(".pdf")
      ? "application/pdf"
      : objectKey.endsWith(".doc")
        ? "application/msword"
        : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    let response: Response;
    try {
      response = await transport(
        bytes
          ? `${origin}/storage/v1/object/cv-imports/${objectKey}`
          : `${origin}/storage/v1/object/cv-imports`,
        {
          method: bytes ? "POST" : "DELETE",
          redirect: "manual",
          signal: AbortSignal.timeout(15000),
          headers: {
            apikey: apiKey,
            Authorization: `Bearer ${token}`,
            "Content-Type": bytes ? contentType : "application/json",
            "x-upsert": "false",
          },
          body: bytes
            ? (bytes as Uint8Array<ArrayBuffer>)
            : JSON.stringify({ prefixes: [objectKey] }),
        },
      );
    } catch {
      if (bytes)
        console.warn("import-storage", {
          phase: "upload",
          httpStatus: null,
          code: "STORAGE_OUTCOME_UNKNOWN",
        });
      throw new DatabaseError(
        503,
        bytes ? "STORAGE_OUTCOME_UNKNOWN" : "STORAGE_UNAVAILABLE",
      );
    }
    if (!bytes && response.status === 404) {
      await response.body?.cancel();
      return;
    }
    if (bytes && !response.ok) {
      const value = await boundedJson(response, 65536).catch(() => null);
      const diagnosticCodes = new Set([
        "AccessDenied",
        "InvalidJWT",
        "InvalidSignature",
        "InvalidRequest",
        "NoSuchBucket",
        "EntityTooLarge",
        "DatabaseError",
        "InternalError",
        "InternalServerError",
        "InvalidMimeType",
        "KeyAlreadyExists",
        "ResourceNotFound",
      ]);
      const diagnostic =
        record(value) &&
        typeof value.code === "string" &&
        diagnosticCodes.has(value.code)
          ? value.code
          : "UNCLASSIFIED_STORAGE_ERROR";
      const knownReasons = [
        "AUTHENTICATION_REQUIRED",
        "RESOURCE_FORBIDDEN",
        "VERSION_CONFLICT",
        "permission denied",
        "row-level security",
        "lock timeout",
        "deadlock detected",
      ];
      const description = record(value)
        ? [value.message, value.error]
            .filter((v) => typeof v === "string")
            .join(" ")
        : "";
      const reason =
        knownReasons.find((code) => description.includes(code)) ??
        "UNCLASSIFIED";
      console.warn("import-storage", {
        phase: "upload",
        httpStatus: response.status,
        code: diagnostic,
        reason,
      });
      const definite = response.status >= 400 && response.status < 500;
      throw new DatabaseError(
        definite ? response.status : 503,
        definite ? "STORAGE_UPLOAD_REJECTED" : "STORAGE_OUTCOME_UNKNOWN",
      );
    }
    try {
      await boundedJson(response, 65536);
    } catch {
      if (bytes)
        console.warn("import-storage", {
          phase: "upload",
          httpStatus: response.status,
          code: "STORAGE_ACK_UNKNOWN",
        });
      throw new DatabaseError(
        503,
        bytes ? "STORAGE_OUTCOME_UNKNOWN" : "STORAGE_UNAVAILABLE",
      );
    }
    if (!response.ok)
      throw new DatabaseError(
        response.status === 403 ? 403 : 503,
        "STORAGE_UNAVAILABLE",
      );
  }
  const loadBaseState = () =>
    rpc<BaseLifecycle & { snapshot: DraftSnapshot | null }>(
      "load_base_state",
      {},
    );
  const cleanupBaseSources = async (): Promise<BaseLifecycle> => {
    const rows = await rpc<
      { bucket: "cv-imports" | "cv-photos"; objectKey: string }[]
    >("base_removal_objects", {});
    for (const row of rows) {
      try {
        if (row.bucket === "cv-imports") await storage(row.objectKey);
        else {
          if (!/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg$/.test(row.objectKey))
            throw new DatabaseError(503, "DATABASE_UNAVAILABLE");
          const response = await photoStorage("object/cv-photos", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prefixes: [row.objectKey] }),
          });
          if (!response.ok && response.status !== 404) {
            await response.body?.cancel();
            throw new DatabaseError(503, "DATABASE_UNAVAILABLE");
          }
          await response.body?.cancel();
        }
        await rpc("ack_base_removal_object", {
          p_bucket: row.bucket,
          p_object_key: row.objectKey,
        });
      } catch {
        /* Keep the owned manifest for an explicit bounded retry. */
      }
    }
    const { snapshot: _snapshot, ...state } = await loadBaseState();
    return state;
  };
  return {
    loadBaseState,
    retryBaseCleanup: cleanupBaseSources,
    removeBase: async (input: {
      requestId: string;
      expectedRevision: number;
      expectedGeneration: number;
    }): Promise<BaseRemoval> => {
      const result = await rpc<BaseRemoval>("remove_base_cv", {
        p_key: key(input.requestId),
        p_expected_revision: revision(input.expectedRevision),
        p_expected_generation: revision(input.expectedGeneration),
      });
      try {
        return { ...result, ...(await cleanupBaseSources()) };
      } catch {
        return { ...result, cleanupPending: true };
      }
    },
    ...importGateway(rpc, storage, async (objectKey) => {
      if (
        !/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/original\.(pdf|docx|doc)$/.test(
          objectKey,
        )
      )
        throw new DatabaseError(400, "INVALID_REQUEST");
      const response = await photoStorage(
        `object/authenticated/cv-imports/${objectKey}`,
        { method: "GET" },
      );
      if (!response.ok || !response.body) {
        await response.body?.cancel();
        throw new DatabaseError(404, "SOURCE_UNAVAILABLE");
      }
      const reader = response.body.getReader(),
        chunks: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.length;
          if (size > 10_000_000)
            throw new DatabaseError(503, "SOURCE_UNAVAILABLE");
          chunks.push(value);
        }
      } finally {
        await reader.cancel();
        reader.releaseLock();
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      return bytes;
    }),
    ...languageGateway(rpc),
    ...workspaceGateway(rpc),

    loadSnapshot: (id: string) =>
      rpc<DraftSnapshot | null>("load_editor_snapshot", {
        p_snapshot: key(id),
      }),
    reserveEnhancement: (input: {
      operationId: string;
      snapshotId: string;
      revision: number;
      targetId: string;
      policy: string;
      secret: string;
    }) =>
      rpc<{ created: boolean }>("reserve_enhancement", {
        p_operation: key(input.operationId),
        p_snapshot: input.snapshotId === null ? null : key(input.snapshotId),
        p_revision: revision(input.revision),
        p_target: input.targetId,
        p_policy: input.policy,
        p_secret: input.secret,
      }),
    beginAttempt: (start: AttemptStart, secret: string) =>
      rpc<{ created: boolean; attempt: Attempt }>("begin_ai_attempt", {
        p_start: start,
        p_secret: secret,
      }),
    finishAttempt: (id: string, result: AttemptResult, secret: string) =>
      rpc<Attempt>("finish_ai_attempt", {
        p_attempt: id,
        p_result: result,
        p_secret: secret,
      }),
    reservePhoto: (
      input: {
        id: string;
        sha256: string;
        width: number;
        height: number;
        byteSize: number;
      },
      secret: string,
    ) =>
      rpc<PhotoAsset>("reserve_photo", {
        p_id: key(input.id),
        p_sha256: input.sha256,
        p_width: input.width,
        p_height: input.height,
        p_bytes: input.byteSize,
        p_worker_secret: secret,
      }),
    expirePhotos: (secret: string) =>
      rpc<PhotoAsset[]>("expire_photo_uploads", { p_worker_secret: secret }),
    readyPhoto: (id: string, secret: string) =>
      rpc<PhotoAsset>("finish_photo", {
        p_id: key(id),
        p_worker_secret: secret,
      }),
    readPhoto: (id: string) => rpc<PhotoAsset>("read_photo", { p_id: key(id) }),
    deletePhoto: (id: string, secret: string, complete = false) =>
      rpc<PhotoAsset>("delete_photo", {
        p_id: key(id),
        p_complete: complete,
        p_worker_secret: secret,
      }),
    putPhoto: async (objectKey: string, bytes: Uint8Array) => {
      const response = await photoStorage(
        `object/cv-photos/${objectPath(objectKey)}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "image/jpeg",
            "Cache-Control": "private, no-store",
            "x-upsert": "false",
          },
          body: bytes.slice().buffer,
        },
      );
      // 409 is only a possible replay; caller always checks existing bytes/hash.
      if (!response.ok) {
        const error = await boundedJson(response, 4096).catch(() => null);
        photoStorageDiagnostic(response, "write", error);
        let duplicate = response.status === 409;
        if (response.status === 400) {
          duplicate =
            record(error) &&
            (error.code === "ResourceAlreadyExists" ||
              error.code === "KeyAlreadyExists" ||
              error.error === "Duplicate" ||
              error.message === "The resource already exists" ||
              error.message === "Asset Already Exists");
        }
        if (!duplicate) throw new DatabaseError(503, "DATABASE_UNAVAILABLE");
      }
      await response.body?.cancel();
    },
    getPhoto: async (objectKey: string) => {
      const response = await photoStorage(
        `object/authenticated/cv-photos/${objectPath(objectKey)}`,
        { method: "GET" },
      );
      if (!response.ok) {
        photoStorageDiagnostic(
          response,
          "read",
          await boundedJson(response, 4096).catch(() => null),
        );
        throw new DatabaseError(
          response.status === 404 ? 404 : 503,
          "DATABASE_UNAVAILABLE",
        );
      }
      const reader = response.body?.getReader();
      if (!reader) throw new DatabaseError(503, "DATABASE_UNAVAILABLE");
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const value = await reader.read();
        if (value.done) break;
        size += value.value.length;
        if (size > 10485760) {
          await reader.cancel();
          throw new DatabaseError(503, "DATABASE_UNAVAILABLE");
        }
        chunks.push(value.value);
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      return bytes;
    },
    purgePhoto: async (objectKey: string) => {
      const response = await photoStorage("object/cv-photos", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prefixes: [objectPath(objectKey)] }),
      });
      if (!response.ok && response.status !== 404)
        throw new DatabaseError(503, "DATABASE_UNAVAILABLE");
      await response.body?.cancel();
    },

    provisionWorkspace: (requestId: string) =>
      rpc<{ tenantId: string; userId: string }>("provision_workspace", {
        request_key: key(requestId),
      }),

    loadDraft: () => rpc<DraftSnapshot | null>("load_base_draft", {}),
    draftHistory: (page: { beforeRevision?: number; limit?: number } = {}) => {
      const limit = page.limit ?? 20;
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 20)
        throw new DatabaseError(400, "INVALID_REQUEST");
      return rpc<DraftSnapshot[]>(
        "base_draft_history",
        {
          p_before_revision:
            page.beforeRevision === undefined
              ? null
              : revision(page.beforeRevision),
          p_limit: limit,
        },
        21 * 1048576,
      );
    },
    saveDraft: (input: {
      requestId: string;
      expectedRevision: number;
      mode: "autosave" | "checkpoint";
      payload: EditorWireEnvelope;
    }) => {
      if (!["autosave", "checkpoint"].includes(input.mode))
        throw new DatabaseError(400, "INVALID_REQUEST");
      return rpc<DraftSnapshot>("save_base_draft", {
        p_key: key(input.requestId),
        p_expected_revision: revision(input.expectedRevision),
        p_payload: input.payload,
        p_mode: input.mode,
      });
    },
    restoreDraft: (input: {
      requestId: string;
      expectedRevision: number;
      snapshotId: string;
    }) =>
      rpc<DraftSnapshot>("restore_base_draft", {
        p_key: key(input.requestId),
        p_expected_revision: revision(input.expectedRevision),
        p_snapshot: input.snapshotId === null ? null : key(input.snapshotId),
      }),
  };
}
