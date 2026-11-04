import {
  draftKinds,
  object,
  validateWorkspaceValue,
  type DraftKind,
} from "@resumora/contracts/editor/workspace";
import { isUuid } from "@resumora/contracts/editor/identity";
import { readBody } from "../cv/routes.ts";
import { privateJson, routeError } from "../http/responses.ts";
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
  /^\/v1\/intelligence\/operations\/[^/]+$/.test(p);
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
          if (kind === "resume") {
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
        (!["resume"].includes(kind) && !revision(body.profileGeneration))
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
    const op = /^\/v1\/intelligence\/operations\/([^/]+)$/.exec(path);
    if (op) {
      if (request.method !== "GET")
        return privateJson({ error: { code: "method" } }, 405);
      if (!isUuid(op[1])) throw Error("invalidRequest");
      const value = await gateway.getWorkspaceOperation(op[1]);
      return privateJson(
        value ?? { error: { code: "missing" } },
        value ? 200 : 404,
      );
    }
    throw Error("invalidRequest");
  } catch (error) {
    if ((error as { code?: string }).code === "BASE_GENERATION_CONFLICT")
      return privateJson({ error: { code: "profileRemoved" } }, 410);
    return routeError(error);
  }
}
