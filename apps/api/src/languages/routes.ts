import { encodeDraft, decodeDraft } from "@resumora/contracts/editor/transport";
import {
  defaultDocumentLocale,
  componentFingerprint,
  translationItems,
  isTranslationLineage,
  type TranslationSource,
} from "@resumora/contracts/editor/languages";
import { validateDocumentLocale } from "@resumora/contracts/intelligence/translation";
import { isUuid } from "@resumora/contracts/editor/identity";
import { readBody } from "../cv/routes.ts";
import { privateJson, routeError } from "../http/responses.ts";
import { languageWorkflow, LanguageError } from "./workflow.ts";
import { intelligenceOperations } from "../intelligence/operations.ts";
import {
  configuredStructuredRunner,
  type IntelligenceConfig,
} from "../intelligence/configured.ts";
import type { createDatabaseGateway } from "../db/supabase.ts";
import type {
  LanguageGateway,
  LanguageProposal,
  LanguageRequest,
} from "./model.ts";
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const keys = (v: Record<string, unknown>, allowed: string[]) =>
  Object.keys(v).every((k) => allowed.includes(k));
function pin(v: unknown): v is TranslationSource {
  return (
    object(v) &&
    keys(v, ["kind", "documentId", "currentId", "revision", "fingerprint"]) &&
    v.kind === "base" &&
    isUuid(v.currentId) &&
    typeof v.documentId === "string" &&
    v.documentId.length > 0 &&
    v.documentId.length <= 256 &&
    Number.isSafeInteger(v.revision) &&
    Number(v.revision) > 0 &&
    typeof v.fingerprint === "string" &&
    /^[a-f0-9]{64}$/.test(v.fingerprint)
  );
}
export const isLanguagePath = (path: string) =>
  path === "/v1/document-languages" ||
  path.startsWith("/v1/document-languages/") ||
  path.startsWith("/v1/base-cv/languages/");
export async function languageRoute(
  request: Request,
  db: LanguageGateway,
  options: {
    enabled: boolean;
    userId: string;
    secret: string;
    operations: ReturnType<typeof intelligenceOperations>;
  },
) {
  const url = new URL(request.url),
    path = url.pathname;
  const workflow = languageWorkflow(
    db,
    options.operations,
    options.userId,
    options.secret,
  );
  try {
    if (path === "/v1/document-languages") {
      if (request.method !== "GET")
        return privateJson({ error: { code: "method" } }, 405);
      if (
        [...url.searchParams.keys()].some((k) => !["sourceLocale"].includes(k))
      )
        throw new LanguageError("invalidRequest", 400);
      const locale = url.searchParams.get("sourceLocale");
      if (locale) validateDocumentLocale(locale);
      const context = await db.languageContext();
      const row = context.source;
      if (!row)
        return privateJson({ source: null, versions: context.versions });
      const draft = decodeDraft(row.payload);
      if (draft.translation)
        throw new LanguageError("authoritativeSourceRequired");
      const source: TranslationSource = {
        kind: "base",
        documentId: draft.id,
        currentId: row.id,
        revision: row.revision,
        fingerprint: row.fingerprint,
      };
      return privateJson({
        source: {
          pin: source,
          locale: draft.documentLocale ?? defaultDocumentLocale(draft),
          draft,
          items: await translationItems(draft),
          accepted: !("reason" in row) || row.reason !== "autosave",
        },
        versions: context.versions,
      });
    }
    const variant =
      /^\/v1\/base-cv\/languages\/(lang_[a-f0-9]{64})(?:\/(save|history|restore))?$/.exec(
        path,
      );
    if (variant) {
      const [, id, action = "load"] = variant;
      if (request.method === "GET" && action === "load") {
        const row = await db.loadBaseLanguage(id);
        return privateJson(
          row
            ? { ...row, draft: decodeDraft(row.payload), payload: undefined }
            : null,
        );
      }
      if (request.method === "GET" && action === "history") {
        const before = url.searchParams.get("beforeRevision");
        if (before && !/^[1-9][0-9]*$/.test(before))
          throw new LanguageError("invalidRequest", 400);
        return privateJson(
          (
            await db.baseLanguageHistory(
              id,
              before ? Number(before) : undefined,
            )
          ).map((row) => ({
            ...row,
            draft: decodeDraft(row.payload),
            payload: undefined,
          })),
        );
      }
      if (request.method !== "POST" || !["save", "restore"].includes(action))
        return privateJson({ error: { code: "method" } }, 405);
      const body = await readBody(request);
      if (body instanceof Response) return body;
      if (
        !keys(body, [
          "requestId",
          "expectedRevision",
          "draft",
          "mode",
          "snapshotId",
        ]) ||
        !isUuid(body.requestId) ||
        !Number.isSafeInteger(body.expectedRevision) ||
        Number(body.expectedRevision) < 0
      )
        throw new LanguageError("invalidRequest", 400);
      const payload =
        action === "save"
          ? encodeDraft(decodeDraft(encodeDraft(body.draft as never)))
          : null;
      if (action === "restore" && !isUuid(body.snapshotId))
        throw new LanguageError("invalidRequest", 400);
      if (
        payload &&
        (!isTranslationLineage(payload.content.translation) ||
          payload.content.translation.source.kind !== "base")
      )
        throw new LanguageError("invalidRequest", 422);
      const row = await db.writeBaseLanguage({
        requestId: body.requestId,
        variantId: id,
        expectedRevision: Number(body.expectedRevision),
        payload,
        ...(action === "restore" ? { restore: String(body.snapshotId) } : {}),
      });
      return privateJson({
        ...row,
        draft: decodeDraft(row.payload),
        payload: undefined,
      });
    }
    const proposal =
      /^\/v1\/document-languages\/proposals(?:\/([0-9a-f-]+)(?:\/(advance|review|accept|cancel))?)?$/.exec(
        path,
      );
    if (!proposal) return privateJson({ error: { code: "missing" } }, 404);
    const [, id, action] = proposal;
    if (id && !isUuid(id)) throw new LanguageError("invalidRequest", 400);
    if (request.method === "GET" && id && !action)
      return privateJson(await workflow.get(id));
    if (request.method !== "POST")
      return privateJson({ error: { code: "method" } }, 405);
    const body = await readBody(request);
    if (body instanceof Response) return body;
    if (!id) {
      if (!options.enabled) throw new LanguageError("AI_DISABLED", 503);
      if (
        !keys(body, [
          "operationId",
          "source",
          "sourceLocale",
          "targetLocale",
          "sectionIds",
          "glossary",
          "expectedTargetRevision",
        ]) ||
        !isUuid(body.operationId) ||
        !pin(body.source) ||
        !Array.isArray(body.sectionIds) ||
        body.sectionIds.length > 100 ||
        body.sectionIds.some((s) => typeof s !== "string" || s.length > 256) ||
        !Array.isArray(body.glossary) ||
        body.glossary.length > 100
      )
        throw new LanguageError("invalidRequest", 400);
      const targetLocale = validateDocumentLocale(body.targetLocale),
        sourceLocale = validateDocumentLocale(body.sourceLocale);
      const variantId =
        "lang_" +
        (await componentFingerprint([body.source.documentId, targetLocale]));
      const target = await db.loadBaseLanguage(variantId);
      if (
        !Number.isSafeInteger(body.expectedTargetRevision) ||
        Number(body.expectedTargetRevision) !== (target?.revision ?? 0)
      )
        throw new LanguageError("targetChanged");
      const input: LanguageRequest = {
        source: body.source,
        sourceLocale,
        targetLocale,
        targetRevision: target?.revision ?? 0,
        targetDocumentId: null,
        variantId,
        sectionIds: body.sectionIds as string[],
        glossary: body.glossary as LanguageRequest["glossary"],
      };
      return privateJson(await workflow.start(body.operationId, input));
    }
    if (action === "advance") {
      if (!options.enabled) throw new LanguageError("AI_DISABLED", 503);
      return privateJson(await workflow.advance(id));
    }
    if (action === "cancel") return privateJson(await workflow.cancel(id));
    if (action === "review") {
      if (
        !keys(body, ["expectedRevision", "review"]) ||
        !Number.isSafeInteger(body.expectedRevision)
      )
        throw new LanguageError("invalidRequest", 400);
      return privateJson(
        await workflow.review(
          id,
          Number(body.expectedRevision),
          body.review as never,
        ),
      );
    }
    if (action === "accept") {
      if (
        !keys(body, ["requestId", "reviewRevision"]) ||
        !isUuid(body.requestId) ||
        !Number.isSafeInteger(body.reviewRevision)
      )
        throw new LanguageError("invalidRequest", 400);
      return privateJson(
        await workflow.accept(id, body.requestId, Number(body.reviewRevision)),
      );
    }
    throw new LanguageError("invalidRequest", 400);
  } catch (error) {
    if (error instanceof LanguageError)
      return privateJson({ error: { code: error.code } }, error.status);
    if (error instanceof Error && error.message.startsWith("TRANSLATION_"))
      return privateJson({ error: { code: error.message } }, 422);
    return routeError(error);
  }
}
export async function configuredLanguageRoute(
  request: Request,
  env: IntelligenceConfig,
  db: ReturnType<typeof createDatabaseGateway>,
  userId: string,
) {
  const secret = env.AI_WORKER_SECRET ?? "";
  const ledger = {
    durability: "durable" as const,
    begin: (s: Parameters<typeof db.beginAttempt>[0]) =>
      db.beginAttempt(s, secret),
    finish: (id: string, r: Parameters<typeof db.finishAttempt>[1]) =>
      db.finishAttempt(id, r, secret),
    report: async () => {
      throw new Error("REPORT_UNCONNECTED");
    },
  };
  const operations = intelligenceOperations((task) =>
    configuredStructuredRunner(
      env,
      userId,
      ledger,
      AbortSignal.any([request.signal, AbortSignal.timeout(90000)]),
    )(task),
  );
  return languageRoute(request, db, {
    enabled: env.AI_PAID_INFERENCE === "on",
    userId,
    secret,
    operations,
  });
}
