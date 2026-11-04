import { documentLabels } from '@resumora/contracts/editor/document-labels';
import { contentLocale, contentLanguagePolicyVersion } from '@resumora/contracts/editor/content-language';
import { jobLocaleKey, jobDocumentLocale, requireJobContentLanguage } from './locale.ts';
import {
  withJobAnswers,
  type JobAnswers,
  type JobAnswer,
} from "@resumora/contracts/editor/workspace";
import { writeSummary } from "@resumora/contracts/editor/model";
import { allInventorySkills } from "@resumora/contracts/intelligence/skills-improvement";
import {
  selfContainedJobDraft,
  type CurrentJobDocument,
} from "@resumora/contracts/jobs/current-document";
import type { CurrentDocumentGateway } from "./current-documents.ts";
import { publicJobUrl } from "./url.ts";
import { isUuid, type SavedJob } from "@resumora/contracts/jobs/connected";
import {
  tailorTargets,
  tailorTargetText,
  fingerprint,
  jobClarificationQuestion,
  validateVacancy,
  validateTailor,
  eligibleEvidence,
  evidenceCoverage,
  type JobWorkflow,
  type Vacancy,
  type WorkflowOperation,
  type TailorProposal,
  type MatchResult,
} from "@resumora/contracts/jobs/workflow";
import {
  jobEditorFacts,
  type JobEditorPayload,
  type JobEditorGateway,
} from "@resumora/contracts/jobs/documents";
import {
  decodeDraft,
  encodeDraft,
  type DraftSnapshot,
} from "@resumora/contracts/editor/transport";
import { privateJson, routeError } from "./routes.ts";
import { readBody } from "../cv/routes.ts";
export interface WorkflowGateway extends CurrentDocumentGateway {
  getJobAnswers?(jobId: string): Promise<JobAnswers>;
  saveJobAnswer?(input: {
    requestId: string;
    jobId: string;
    expectedRevision: number;
    answer: Omit<JobAnswer, "revision">;
  }): Promise<JobAnswers>;
  saveDraft(input: {
    requestId: string;
    expectedRevision: number;
    mode: "autosave" | "checkpoint";
    payload: ReturnType<typeof encodeDraft>;
  }): Promise<DraftSnapshot>;
  getJob(id: string): Promise<SavedJob | null>;
  loadDraft(): Promise<DraftSnapshot | null>;
  getJobWorkflow(
    id: string,
  ): Promise<JobWorkflow & { actions?: Record<string, string> }>;
  reviewJobWorkflow(input: {
    requestId: string;
    jobId: string;
    revision: number;
    value: Vacancy;
  }): Promise<JobWorkflow>;
  requestJobWorkflow(input: {
    requestId: string;
    jobId: string;
    kind: string;
    revision: number;
    targetId?: string;
    locale?: string;
    interfaceLocale?: "ro" | "en";
  }): Promise<WorkflowOperation>;
  cancelJobWorkflow(jobId: string, operationId: string): Promise<unknown>;
  jobWorkflowAction(input: {
    requestId: string;
    jobId: string;
    revision: number;
    id: string;
    state: string;
  }): Promise<JobWorkflow>;
  linkJobSourceVersion(input: {
    requestId: string;
    jobId: string;
    parentId: string;
    revision: number;
  }): Promise<JobWorkflow>;
  acceptJobTailor(input: {
    requestId: string;
    jobId: string;
    operationId: string;
    documentId: string | null;
    expectedRevision: number;
    payload: JobEditorPayload;
  }): Promise<unknown>;
}
const exact = (v: Record<string, unknown>, keys: string[]) =>
  Object.keys(v).sort().join(",") === [...keys].sort().join(",");
export async function jobWorkflowRoute(
  request: Request,
  gateway: WorkflowGateway,
  aiEnabled = false,
) {
  const url = new URL(request.url),
    m =
      /^\/v1\/jobs\/([^/]+)\/workflow(?:\/(review|extract|fetch|match|tailor|prepare|cancel|action|accept|source|clarify))?$/.exec(
        url.pathname,
      );
  if (
    !m ||
    !isUuid(m[1]) ||
    [...url.searchParams.keys()].some((k) => k !== "locale") ||
    url.searchParams.getAll("locale").length > 1 ||
    (url.searchParams.has("locale") &&
      !jobLocaleKey(url.searchParams.get("locale"))) ||
    (request.method !== "GET" && !!url.search)
  )
    return privateJson({ error: { code: "invalidRequest" } }, 400);
  const [, jobId, action] = m;
  const selectedLocale = jobLocaleKey(url.searchParams.get("locale"));
  if (request.method !== (action ? "POST" : "GET"))
    return privateJson({ error: { code: "method" } }, 405);
  try {
    const job = await gateway.getJob(jobId);
    if (!job) return privateJson({ error: { code: "missing" } }, 404);
    const workflow = await gateway.getJobWorkflow(jobId);
    const answers = (await gateway.getJobAnswers?.(jobId)) ?? {
      revision: 0,
      answers: [],
    };
    if (!action) {
      const base = await gateway.loadDraft(),
        document = await gateway.loadCurrentJobDocument(
          jobId,
          selectedLocale ?? undefined,
        );
      const latest = workflow.operations.find(
        (o) =>
          o.kind === "match" &&
          o.languagePolicyVersion === contentLanguagePolicyVersion &&
          o.state === "ready" &&
          (o.answersRevision ?? 0) === answers.revision &&
          o.jobRevision === workflow.revision &&
          o.snapshotId === base?.id &&
          (o.documentVersionId ?? null) === (document?.id ?? null),
      );
      const vacancy = workflow.reviewed;
      const d = base ? decodeDraft(base.payload) : null,
        targetLocale =
          selectedLocale ?? document?.locale ?? (d ? jobLocaleKey(contentLocale(d)) : null),
        targetDocument = targetLocale
          ? await gateway.loadCurrentJobDocument(jobId, targetLocale)
          : null,
        currentDraft = targetDocument ? decodeDraft(targetDocument.payload) : d,
        labels = currentDraft ? documentLabels(currentDraft) : null,
        currentSections = currentDraft
          ? tailorTargets(currentDraft).map((id) => ({
              id,
              label:
                id === "summary"
                  ? labels?.summary ?? id
                  : id === "professionalSkills"
                    ? labels?.professionalSkills ?? id
                    : id === "technicalSkills"
                      ? labels?.technicalSkills ?? id
                      : currentDraft.titles.some((f) => f.fieldId === id)
                        ? labels?.role ?? id
                        : (currentDraft.roles.find((r) => r.id === id)?.title
                            .value ??
                          currentDraft.education.find((e) => e.id === id)
                            ?.qualification.value ??
                          currentDraft.optionalSections
                            .flatMap((s) => s.entries)
                            .find((e) => e.id === id)?.title.value ??
                          id),
              questionLabel:
                currentDraft.roles.find((r) => r.id === id)?.title.value ?? id,
              text: tailorTargetText(currentDraft, id),
            }))
          : [];
      return privateJson({
        ...workflow,
        jobAnswers: answers.answers,
        answersRevision: answers.revision,
        sourceText: job.intake.text,
        suggestions:
          latest && vacancy
            ? ((latest.result as MatchResult).suggestions ?? []).map((s) => ({
                ...s,
                state: workflow.actions?.[s.id] ?? s.state,
              }))
            : [],
        aiEnabled,
        currentSnapshotId: base?.id ?? null,
        currentDocumentVersionId: document?.id ?? null,
        documentLocale: document?.locale ?? selectedLocale,
        targetLocale,
        currentTargetDocumentVersionId: targetDocument?.id ?? null,
        currentSnapshotRevision: base?.revision ?? null,
        currentSections,
        skillLabels: d
          ? Object.fromEntries(
              [...allInventorySkills(d, "professionalSkills"), ...allInventorySkills(d, "technicalSkills")].map((f) => [
                f.id,
                f.value,
              ]),
            )
          : {},
        ...(latest && vacancy
          ? {
              coverage: {
                profile: evidenceCoverage(
                  vacancy,
                  latest.result as MatchResult,
                  "profile",
                ),
                cv: evidenceCoverage(
                  vacancy,
                  latest.result as MatchResult,
                  "cv",
                ),
              },
            }
          : {}),
      });
    }
    const body = await readBody(request);
    if (body instanceof Response) return body;
    if (action === "cancel") {
      if (!exact(body, ["operationId"]) || !isUuid(body.operationId))
        throw Error("invalidRequest");
      return privateJson(
        await gateway.cancelJobWorkflow(jobId, body.operationId),
      );
    }
    if (!isUuid(body.requestId)) throw Error("invalidRequest");
    if (action === "accept") {
      if (!workflow.reviewed)
        return privateJson({ error: { code: "reviewRequired" } }, 422);
      if (
        !exact(body, [
          "requestId",
          "operationId",
          "documentId",
          "expectedRevision",
          "decisions",
        ]) ||
        !isUuid(body.operationId) ||
        !(body.documentId === null || isUuid(body.documentId)) ||
        !Number.isSafeInteger(body.expectedRevision) ||
        Number(body.expectedRevision) < 0 ||
        !Array.isArray(body.decisions) ||
        !body.decisions.length ||
        body.decisions.length > 200
      )
        throw Error("invalidRequest");
      const operation = workflow.operations.find(
        (o) =>
          o.id === body.operationId &&
          o.kind === "tailor" &&
          o.languagePolicyVersion === contentLanguagePolicyVersion &&
          o.state === "ready",
      );
      const base = await gateway.loadDraft();
      if (
        !operation ||
        !base ||
        operation.snapshotId !== base.id ||
        operation.jobRevision !== workflow.revision ||
        (operation.answersRevision ?? 0) !== answers.revision
      )
        return privateJson({ error: { code: "stale" } }, 409);
      const draft = withJobAnswers(
        decodeDraft(base.payload),
        jobId,
        answers.answers,
      );
      if (operation.targetLocale) jobDocumentLocale(draft, operation.targetLocale);
      const vacancy = workflow.reviewed;
      if (!vacancy) throw Error("invalidRequest");
      const sourceDocument = await gateway.loadCurrentJobDocument(
          jobId,
          operation.documentLocale ?? undefined,
        ),
        prior = await gateway.loadCurrentJobDocument(
          jobId,
          operation.targetLocale ?? jobLocaleKey(contentLocale(draft))!,
        );
      if (
        (prior?.documentId ?? null) !== body.documentId ||
        (prior?.revision ?? 0) !== body.expectedRevision ||
        (operation.documentVersionId ?? null) !==
          (sourceDocument?.id ?? null) ||
        (operation.targetDocumentVersionId ?? null) !== (prior?.id ?? null)
      )
        return privateJson({ error: { code: "stale" } }, 409);
      const combined = new Map<
        string,
        import("@resumora/contracts/jobs/workflow").TailorSection
      >();
      for (const o of [
        operation,
        ...workflow.operations.filter(
          (o) =>
            o.id !== operation.id &&
            o.kind === "tailor" &&
            o.languagePolicyVersion === contentLanguagePolicyVersion &&
            o.state === "ready" &&
            o.result &&
            o.snapshotId === operation.snapshotId &&
            o.jobRevision === operation.jobRevision &&
            (o.documentVersionId ?? null) ===
              (operation.documentVersionId ?? null) &&
            (o.targetDocumentVersionId ?? null) ===
              (operation.targetDocumentVersionId ?? null) &&
            o.targetLocale === operation.targetLocale,
        ),
      ])
        for (const section of (o.result as TailorProposal).sections)
          if (!combined.has(section.targetId))
            combined.set(section.targetId, section);
      const proposal: TailorProposal = {
        schemaVersion: "job-tailor/1",
        sections: [...combined.values()],
      };
      if (!proposal || proposal.schemaVersion !== "job-tailor/1")
        throw Error("invalidRequest");
      const evidence = eligibleEvidence(draft),
        accepted = prior ? decodeDraft(prior.payload) : structuredClone(draft);
      const targets = new Set<string>();
      for (const d of body.decisions) {
        if (
          !d ||
          typeof d !== "object" ||
          Array.isArray(d) ||
          Object.keys(d).some(
            (k) => !["targetId", "accept", "text"].includes(k),
          ) ||
          typeof d.targetId !== "string" ||
          typeof d.accept !== "boolean" ||
          (d.text !== undefined &&
            (typeof d.text !== "string" ||
              !d.text.trim() ||
              d.text.length > 20000)) ||
          targets.has(d.targetId)
        )
          throw Error("invalidRequest");
        targets.add(d.targetId);
        const s = proposal.sections.find((s) => s.targetId === d.targetId);
        if (!s) throw Error("invalidRequest");
        if (!d.accept || s.action === "retain") continue;
        const current = {
          ...s,
          ...(d.text !== undefined ? { text: d.text } : {}),
        };
        validateTailor(
          { schemaVersion: "job-tailor/1", sections: [current] },
          accepted,
          vacancy,
          evidence,
          s.targetId,
        );
        if (s.targetId === "summary")
          writeSummary(
            accepted,
            current.text,
            d.text !== undefined ? "user_authored" : "ai_generated",
          );
        else if (s.targetId === "professionalSkills" || s.targetId === "technicalSkills") {
          const inventory = allInventorySkills(draft, s.targetId);
          accepted[s.targetId] = s.skillIds.map((id) => {
            const skill = inventory.find((f) => f.id === id);
            if (!skill) throw Error("invalidRequest");
            return structuredClone(skill);
          });
        } else if (accepted.titles.some((f) => f.fieldId === s.targetId)) {
          const title = accepted.titles.find((f) => f.fieldId === s.targetId)!;
          title.value = current.text;
          title.status = d.text !== undefined ? "user_authored" : "draft";
        } else {
          const target =
            accepted.roles.find((r) => r.id === s.targetId) ??
            accepted.education.find((e) => e.id === s.targetId) ??
            accepted.optionalSections
              .flatMap((s) => s.entries)
              .find((e) => e.id === s.targetId);
          if (!target) throw Error("invalidRequest");
          const field = "context" in target ? target.context : target.details;
          field.value = current.text;
          field.status = d.text !== undefined ? "user_authored" : "draft";
          if ("bullets" in target) target.bullets = [];
          delete accepted.presentation.approvedWording?.[s.targetId];
          delete accepted.presentation.contributionHtml?.[s.targetId];
        }
      }
      return privateJson(
        await gateway.saveCurrentJobDocument({
          requestId: body.requestId,
          jobId,
          locale: jobLocaleKey(contentLocale(accepted))!,
          documentId: body.documentId as string | null,
          expectedRevision: Number(body.expectedRevision),
          baseSnapshotId: base.id,
          payload: encodeDraft(selfContainedJobDraft(accepted)),
          operationId: body.operationId,
          provenance: {
            sourceSnapshotId: base.id,
            sourceRevision: base.revision,
            jobRevision: workflow.revision,
            acceptedTargets: [...targets],
            generatedTargets: body.decisions
              .filter((d: any) => d.accept && d.text === undefined)
              .map((d: any) => d.targetId),
          },
        }),
      );
    }
    if (!Number.isSafeInteger(body.revision) || Number(body.revision) < 1)
      throw Error("invalidRequest");
    if (
      ["match", "tailor", "prepare", "clarify"].includes(action) &&
      !workflow.reviewed
    )
      return privateJson({ error: { code: "reviewRequired" } }, 422);
    if (action === "clarify") {
      if (
        !exact(
          Object.fromEntries(
            Object.entries(body).filter(([key]) => key !== "answersRevision" && key !== "locale" && key !== "operationId" && key !== "suggestionId"),
          ),
          [
            "requestId",
            "revision",
            "snapshotId",
            "snapshotRevision",
            "requirementId",
            "targetId",
            "outcome",
            "text",
          ],
        ) ||
        ((body.operationId !== undefined || body.suggestionId !== undefined) && (!isUuid(body.operationId) || typeof body.suggestionId !== 'string' || !body.suggestionId.trim() || body.suggestionId.length > 256)) ||
        (body.locale !== undefined && !jobLocaleKey(body.locale)) ||
        (body.answersRevision !== undefined &&
          (!Number.isSafeInteger(body.answersRevision) ||
            Number(body.answersRevision) < 0)) ||
        !isUuid(body.snapshotId) ||
        !Number.isSafeInteger(body.snapshotRevision) ||
        Number(body.snapshotRevision) < 1 ||
        typeof body.requirementId !== "string" ||
        typeof body.targetId !== "string" ||
        !["answer", "no", "unknown", "skip"].includes(String(body.outcome)) ||
        typeof body.text !== "string" ||
        body.text.length > 6000 ||
        (body.outcome === "answer" && !body.text.trim())
      )
        throw Error("invalidRequest");
      if (body.revision !== workflow.revision)
        return privateJson({ error: { code: "stale" } }, 409);
      const source = await gateway.loadSnapshot(body.snapshotId);
      if (!source || source.revision !== body.snapshotRevision)
        return privateJson({ error: { code: "missing" } }, 404);
      const base = decodeDraft(source.payload),
        requirement = (
          workflow.reviewed ?? workflow.extracted
        )?.requirements.find((r) => r.id === body.requirementId),
        target =
          base.roles.find((r) => r.id === body.targetId) ??
          base.optionalSections
            .filter((s) => s.kind !== "languages")
            .flatMap((s) => s.entries)
            .find((e) => e.id === body.targetId);
      if (!requirement || !target) throw Error("invalidRequest");
      const document = await gateway.loadCurrentJobDocument?.(jobId, body.locale === undefined ? undefined : jobLocaleKey(body.locale)!);
      const compatible = workflow.operations.filter(o=>o.kind === 'match' && o.state === 'ready' && o.languagePolicyVersion === contentLanguagePolicyVersion && o.snapshotId === source.id && o.jobRevision === workflow.revision && (o.answersRevision ?? 0) === Number(body.answersRevision ?? answers.revision) && (o.documentVersionId ?? null) === (document?.id ?? null));
      const operation = compatible.find(o=>o.id === body.operationId);
      const suggestion = (operation?.result as MatchResult | undefined)?.suggestions?.find(s=>s.id === body.suggestionId && s.requirementIds.includes(body.requirementId as string));
      if ((body.operationId !== undefined && !suggestion?.question) || (body.operationId === undefined && compatible.some(o=>(o.result as MatchResult | null)?.suggestions?.some(s=>s.requirementIds.includes(body.requirementId as string)))))
        return privateJson({error:{code:'stale'}},409);
      const questionText = suggestion?.question ?? jobClarificationQuestion(requirement.text,target.title.value || target.id,document ? contentLocale(decodeDraft(document.payload)) : contentLocale(base));

      if (!gateway.saveJobAnswer)
        return privateJson({ error: { code: "unavailable" } }, 503);
      const saved = await gateway.saveJobAnswer({
        requestId: body.requestId,
        jobId,
        expectedRevision: Number(body.answersRevision ?? answers.revision),
        answer: {
          id: body.requestId,
          requirementId: body.requirementId,
          targetId: body.targetId,
          questionText,
          text: body.outcome === "no" ? "No" : body.text,
          status:
            body.outcome === "skip"
              ? "skipped"
              : body.outcome === "unknown"
                ? "unknown"
                : "confirmed",
        },
      });
      return privateJson({
        saved: true,
        jobScoped: true,
        answersRevision: saved.revision,
        requiresMatchRefresh: true,
      });
    }
    if (action === "source") {
      if (
        !exact(body, ["requestId", "revision", "parentId"]) ||
        !isUuid(body.parentId)
      )
        throw Error("invalidRequest");
      return privateJson(
        await gateway.linkJobSourceVersion({
          requestId: body.requestId,
          jobId,
          parentId: body.parentId,
          revision: Number(body.revision),
        }),
      );
    }
    if (action === "review") {
      if (!exact(body, ["requestId", "revision", "value"]))
        throw Error("invalidRequest");
      const value = validateVacancy(body.value, job.intake.text, true);
      for (const r of value.requirements) {
        const previous = (
          workflow.reviewed ?? workflow.extracted
        )?.requirements.find((p) => p.id === r.id);
        if (previous && previous.text !== r.text) {
          r.components = [{ id: r.id + "_manual", text: r.text }];
          r.operator = "and";
          r.evidence = [];
          r.emphasis = "unknown";
        }
      }
      return privateJson(
        await gateway.reviewJobWorkflow({
          requestId: body.requestId,
          jobId,
          revision: Number(body.revision),
          value,
        }),
      );
    }
    if (action === "action") {
      if (
        !exact(body, ["requestId", "revision", "id", "state"]) ||
        typeof body.id !== "string" ||
        !body.id ||
        body.id.length > 256 ||
        !["include", "dismissed", "skipped", "completed"].includes(
          String(body.state),
        )
      )
        throw Error("invalidRequest");
      return privateJson(
        await gateway.jobWorkflowAction({
          requestId: body.requestId,
          jobId,
          revision: Number(body.revision),
          id: body.id,
          state: String(body.state),
        }),
      );
    }
    if (
      !exact(body, [
        "requestId",
        "revision",
        ...(body.targetId === undefined ? [] : ["targetId"]),
        ...(body.locale === undefined ? [] : ["locale"]),
        ...(body.interfaceLocale === undefined ? [] : ["interfaceLocale"]),
      ]) ||
      (body.interfaceLocale !== undefined && (action !== "extract" || !["ro","en"].includes(String(body.interfaceLocale)))) ||
      (body.locale !== undefined &&
        (!jobLocaleKey(body.locale) ||
          !["extract", "match", "prepare", "tailor"].includes(action))) ||
      (body.targetId !== undefined &&
        (typeof body.targetId !== "string" ||
          !body.targetId ||
          body.targetId.length > 256 ||
          action !== "tailor"))
    )
      throw Error("invalidRequest");
    if (action === "fetch") {
      if (job.intake.text.trim() || !job.intake.sourceUrl)
        throw Error("invalidRequest");
      publicJobUrl(job.intake.sourceUrl);
    }
    if (action === "extract" && !job.intake.text.trim())
      throw Error("invalidRequest");
    if (body.targetId !== undefined) {
      const base = await gateway.loadDraft(),
        target = await gateway.loadCurrentJobDocument(
          jobId,
          body.locale === undefined ? undefined : jobLocaleKey(body.locale)!,
        );
      if (
        !base ||
        !tailorTargets(decodeDraft(target?.payload ?? base.payload)).includes(
          body.targetId as string,
        )
      )
        throw Error("invalidRequest");
    }
    if (["extract", "match", "prepare", "tailor"].includes(action)) {
      const document = await gateway.loadCurrentJobDocument(jobId, body.locale === undefined ? undefined : jobLocaleKey(body.locale)!);
      const base = document ? null : await gateway.loadDraft();
      if (base) await requireJobContentLanguage(decodeDraft(base.payload));
    }
    return privateJson(
      await gateway.requestJobWorkflow({
        requestId: body.requestId,
        jobId,
        kind: action,
        revision: Number(body.revision),
        ...(body.interfaceLocale ? {interfaceLocale:body.interfaceLocale as "ro"|"en"} : {}),
        ...(body.locale ? { locale: jobLocaleKey(body.locale)! } : {}),
        ...(typeof body.targetId === "string"
          ? { targetId: body.targetId }
          : {}),
      }),
      202,
    );
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_WORKFLOW_OUTPUT")
      return privateJson({ error: { code: "invalidRequest" } }, 400);
    if (error instanceof Error && ["CONTENT_LANGUAGE_REQUIRED", "CONTENT_LANGUAGE_UNAVAILABLE"].includes(error.message))
      return privateJson({error:{code:error.message}},error.message === "CONTENT_LANGUAGE_REQUIRED" ? 409 : 422);
    return routeError(error);
  }
}
