import { decodeDraft, encodeDraft } from "@resumora/contracts/editor/transport";
import {
  allFacts,
  clone,
  type BaseDraft,
} from "@resumora/contracts/editor/model";
import { selfContainedJobDraft } from "@resumora/contracts/jobs/current-document";
import {
  translationItems,
  defaultDocumentLocale,
  componentFingerprint,
  composeTranslation,
  type TranslationSource,
  type TranslationLineage,
} from "@resumora/contracts/editor/languages";
import {
  validateDocumentLocale,
  validateTranslationOutput,
  type TranslationInput,
  type TranslationOutput,
} from "@resumora/contracts/intelligence/translation";
import {
  stageOperationId,
  type intelligenceOperations,
} from "../intelligence/operations.ts";
import type {
  LanguageGateway,
  LanguageProposal,
  LanguageRequest,
  LanguageReview,
} from "./model.ts";
export class LanguageError extends Error {
  code: string;
  status: number;
  constructor(code: string, status = 409) {
    super(code);
    this.code = code;
    this.status = status;
  }
}
function fail(code: string, status = 409): never {
  throw new LanguageError(code, status);
}
export function languageWorkflow(
  db: LanguageGateway,
  operations: ReturnType<typeof intelligenceOperations>,
  userId: string,
  secret: string,
) {
  async function source(pin: TranslationSource, locale: string) {
    validateDocumentLocale(locale);
    const row =
      pin.kind === "job"
        ? await db.loadCurrentJobDocument(pin.jobId!, locale.split("-")[0])
        : (await db.languageContext()).source;
    if (
      !row ||
      row.id !== pin.currentId ||
      row.revision !== pin.revision ||
      row.fingerprint !== pin.fingerprint
    )
      fail("staleSource");
    const draft = decodeDraft(row.payload);
    if (
      (pin.kind === "base" ? draft.id : row.documentId) !== pin.documentId ||
      draft.translation ||
      (draft.documentLocale ?? defaultDocumentLocale(draft)) !== locale
    )
      fail("authoritativeSourceRequired");
    if ("reason" in row && row.reason === "autosave")
      fail("acceptedVersionRequired");
    return draft;
  }
  async function inputFor(request: LanguageRequest) {
    const draft = await source(request.source, request.sourceLocale),
      items = await translationItems(draft);
    const selected = request.sectionIds.length
      ? items.filter((i) => request.sectionIds.includes(i.sectionId))
      : items;
    if (
      !selected.length ||
      request.sectionIds.some((id) => !items.some((i) => i.sectionId === id))
    )
      fail("invalidSection", 400);
    const input: TranslationInput = {
      contentType: "cv",
      sourceLocale: request.sourceLocale,
      targetLocale: request.targetLocale,
      sourceDocumentId: request.source.documentId,
      sourceVersionId: request.source.currentId,
      sourceRevision: request.source.revision,
      items: selected,
      approvedGlossary: request.glossary,
      glossaryVersion: await componentFingerprint(request.glossary),
      translationPreferences: { regionalTerminology: "" },
    };
    return { draft, input };
  }
  function batches(input: TranslationInput) {
    const groups: TranslationInput[] = [];
    let items: TranslationInput["items"] = [],
      size = 0;
    for (const item of input.items) {
      if (
        items.length &&
        (items.length >= 100 ||
          size +
            item.text.length +
            JSON.stringify({
              id: item.id,
              fieldId: item.fieldId,
              factIds: item.factIds,
              evidenceIds: item.evidenceIds,
            }).length +
            60 >
            24000)
      ) {
        groups.push({ ...input, items });
        items = [];
        size = 0;
      }
      items.push(item);
      size +=
        item.text.length +
        JSON.stringify({
          id: item.id,
          fieldId: item.fieldId,
          factIds: item.factIds,
          evidenceIds: item.evidenceIds,
        }).length +
        60;
    }
    if (items.length) groups.push({ ...input, items });
    if (groups.length > 64) fail("translationTooLong", 413);
    return groups;
  }
  async function get(id: string) {
    return (await db.languageCommand("get", id)) as LanguageProposal;
  }
  async function start(id: string, request: LanguageRequest) {
    validateDocumentLocale(request.targetLocale);
    validateDocumentLocale(request.sourceLocale);
    if (request.sourceLocale === request.targetLocale) fail("sameLocale", 400);
    await inputFor(request);
    return (await db.languageCommand(
      "start",
      id,
      request,
      secret,
    )) as LanguageProposal;
  }
  async function advance(id: string) {
    const proposal = await get(id);
    if (proposal.state !== "pending") return proposal;
    const { input } = await inputFor(proposal.request),
      plan = batches(input),
      batch = plan[proposal.step];
    if (!batch) fail("invalidProposal", 422);
    const operationId = await stageOperationId(id, `P09:${proposal.step}`);
    const reservation = (await db.languageCommand(
      "work",
      id,
      { operationId, expectedStep: proposal.step },
      secret,
    )) as { created: boolean; proposal: LanguageProposal };
    if (!reservation.created) return reservation.proposal;
    try {
      const output = await operations.translate({
        operationId,
        userId,
        input: batch,
      });
      await source(proposal.request.source, proposal.request.sourceLocale);
      const previous = proposal.output;
      const combined: TranslationOutput = {
        ...output,
        completion:
          output.completion === "needs_review" ||
          previous?.completion === "needs_review"
            ? "needs_review"
            : "complete",
        items: [...(previous?.items ?? []), ...output.items],
        warnings: [...(previous?.warnings ?? []), ...output.warnings],
        ambiguousTerms: [
          ...(previous?.ambiguousTerms ?? []),
          ...output.ambiguousTerms,
        ],
        suggestedGlossary: [
          ...(previous?.suggestedGlossary ?? []),
          ...output.suggestedGlossary,
        ].slice(0, 100),
      };
      return (await db.languageCommand(
        "settle",
        id,
        {
          operationId,
          complete: proposal.step + 1 === plan.length,
          output: combined,
        },
        secret,
      )) as LanguageProposal;
    } catch (error) {
      await db.languageCommand(
        "settle",
        id,
        { operationId, error: "TRANSLATION_FAILED" },
        secret,
      );
      if (error instanceof LanguageError) throw error;
      return await get(id);
    }
  }
  async function review(
    id: string,
    expectedRevision: number,
    review: LanguageReview,
  ) {
    const proposal = await get(id);
    if (proposal.state !== "ready" || !proposal.output)
      fail("proposalNotReady");
    const { input } = await inputFor(proposal.request);
    validateReview(proposal, input, review);
    return (await db.languageCommand("review", id, {
      expectedRevision,
      review,
    })) as LanguageProposal;
  }
  function validateReview(
    proposal: LanguageProposal,
    input: TranslationInput,
    review: LanguageReview,
  ) {
    if (
      !review ||
      !Array.isArray(review.values) ||
      review.values.length !== input.items.length ||
      new Set(review.values.map((v) => v.id)).size !== review.values.length ||
      !Array.isArray(review.confirmed) ||
      new Set(review.confirmed).size !== review.confirmed.length ||
      review.confirmed.some(
        (id) => !input.items.some((i) => i.sectionId === id),
      )
    )
      fail("invalidReview", 422);
    const output = {
      ...proposal.output!,
      items: input.items.map((i) => {
        const v = review.values.find((v) => v.id === i.id);
        if (!v) fail("invalidReview", 422);
        return {
          id: i.id,
          fieldId: i.fieldId,
          text: v.text,
          factIds: i.factIds,
          evidenceIds: i.evidenceIds,
        };
      }),
    };
    return validateTranslationOutput(output, input);
  }
  async function accept(id: string, requestId: string, reviewRevision: number) {
    const proposal = await get(id);
    if (proposal.state === "accepted" && proposal.accepted)
      return proposal.accepted;
    if (
      proposal.state !== "ready" ||
      proposal.reviewRevision !== reviewRevision ||
      !proposal.review
    )
      fail("proposalNotReady");
    const { draft, input } = await inputFor(proposal.request),
      output = validateReview(proposal, input, proposal.review);
    if (
      input.items.some((i) => !proposal.review!.confirmed.includes(i.sectionId))
    )
      fail("reviewIncomplete", 422);
    const existing =
      proposal.request.source.kind === "job"
        ? await db.loadCurrentJobDocument(
            proposal.request.source.jobId!,
            proposal.request.targetLocale.split("-")[0],
          )
        : await db.loadBaseLanguage(proposal.request.variantId);
    if ((existing?.revision ?? 0) !== proposal.request.targetRevision)
      fail("targetChanged");
    let target = await composeTranslation(
      draft,
      input,
      output,
      existing ? decodeDraft(existing.payload) : undefined,
    );
    const previous = existing
      ? (decodeDraft(existing.payload).translation?.components ?? [])
      : [];
    const translatedIds = new Set(input.items.map((i) => i.id));
    const lineage: TranslationLineage = {
      schemaVersion: "cv-language/1",
      documentLocale: input.targetLocale,
      sourceLocale: input.sourceLocale,
      source: proposal.request.source,
      glossaryVersion: input.glossaryVersion,
      components: [
        ...previous.filter((i) => !translatedIds.has(i.id)),
        ...input.items.map(({ text, protectedTerms, ...item }) => item),
      ],
    };
    target.translation = lineage;
    target.documentLocale = input.targetLocale;
    target.sourceLocale = input.sourceLocale;
    target = selfContainedJobDraft(target);
    await source(proposal.request.source, proposal.request.sourceLocale);
    return db.acceptLanguage({
      operationId: id,
      requestId,
      reviewRevision,
      payload: encodeDraft(target),
      variantId: proposal.request.variantId,
    });
  }
  return {
    source,
    inputFor,
    start,
    get,
    advance,
    review,
    accept,
    cancel: async (id: string) =>
      db.languageCommand("cancel", id) as Promise<LanguageProposal>,
  };
}
