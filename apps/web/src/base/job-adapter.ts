import {
  jobEditorFacts,
  projectJobEditor,
  type JobEditorPayload,
  type JobEditorVersion,
} from "@resumora/contracts/jobs/documents";
import { encodeDraft } from "@resumora/contracts/editor/transport";
import { AdapterError, type BaseCvAdapter, type Snapshot } from "./adapter";
import { clone, equalValues, isAuthored, type BaseDraft } from "./model";
import { HttpBaseCvAdapter, type CvTransport } from "./http-adapter";

type Version = Omit<JobEditorVersion, "sourcePayload"> & {
  draft: BaseDraft;
  sourceDraft: BaseDraft;
};
// One adapter per job/account. The existing editor owns write coordination and retries.
export class HttpJobCvAdapter implements BaseCvAdapter {
  readonly capability = "durable" as const;
  private documentId: string | null = null;
  private payload!: JobEditorPayload;
  private source!: BaseDraft;
  private requests = new Map<string, { input: unknown; body: unknown }>();
  private http: HttpBaseCvAdapter;
  constructor(
    transport: CvTransport,
    readonly jobId: string,
  ) {
    this.http = new HttpBaseCvAdapter(
      transport,
      `/v1/jobs/${encodeURIComponent(jobId)}/cv`,
    );
  }
  private snapshot(v: Version): Snapshot {
    return {
      id: v.id,
      revision: v.revision,
      parentId: v.parentId,
      createdAt: v.createdAt,
      reason: v.reason,
      ...(v.restoredFrom ? { restoredFrom: v.restoredFrom } : {}),
      draft: v.draft,
    };
  }
  private accept(v: Version) {
    this.documentId = v.documentId;
    this.payload = clone(v.payload);
    return this.snapshot(v);
  }
  async load() {
    const v = await this.http.request<Version | null>("");
    if (v) {
      this.source = clone(v.sourceDraft);
      return this.accept(v);
    }
    const context = await this.http.request<{
      job: JobEditorPayload["job"];
      source: JobEditorPayload["source"];
      draft: BaseDraft;
    }>("/context");
    this.source = clone(context.draft);
    this.payload = {
      schemaVersion: "resumora-job-editor/1",
      acceptance: "accepted",
      source: context.source,
      job: context.job,
      selectedFacts: jobEditorFacts(this.source)
        .filter(
          (f) =>
            isAuthored(f.fact) &&
            this.source.sources.some((s) => s.id === f.ref.sourceId),
        )
        .map((f) => f.ref),
      selectedAnswerIds: this.source.answers
        .filter((a) => a.status === "confirmed")
        .map((a) => a.id),
      wording: [],
      presentation: {},
      localAdditions: [],
    };
    this.documentId = null;
    return null;
  }
  initialDraft() {
    return clone(this.source);
  }
  private build(draft: BaseDraft): JobEditorPayload {
    if (
      !equalValues(
        draft.sources.filter((s) => s.id !== "job_local_manual"),
        this.source.sources,
      )
    )
      throw new AdapterError("rejected");
    const p = clone(this.payload);
    const { order, hidden, hiddenFields, templateVersionId, photo } =
      draft.presentation;
    p.presentation = {
      order,
      hidden,
      ...(hiddenFields ? { hiddenFields } : {}),
      ...(templateVersionId ? { templateVersionId } : {}),
      ...(photo !== undefined ? { photo } : {}),
      summaryText: draft.summary.text,
    };
    p.localAdditions = p.localAdditions.filter((a) => a.kind === "bullet");
    for (const [group, kind, selection] of [
      ["professionalSkills", "professionalSkill", "professionalSkillIds"],
      ["technicalSkills", "technicalSkill", "technicalSkillIds"],
    ] as const) {
      p.presentation[selection] = draft[group].map((f, i) => {
        const original = this.source[group].find(
          (s) => s.fieldId === f.fieldId && s.value === f.value,
        );
        if (original) return original.id;
        const existing = this.payload.localAdditions.find(
          (a) => a.id === f.id && a.kind === kind && a.text === f.value,
        );
        const id = existing?.id ?? `job_local_${crypto.randomUUID()}`;
        p.localAdditions.push({
          id,
          targetId: group,
          kind,
          text: f.value,
          scope: "job-only",
          origin: "user_authored",
        });
        return id;
      });
    }
    p.wording = p.wording.filter(
      (w) => draft.presentation.approvedWording?.[w.targetId],
    );
    for (const [targetId, wording] of Object.entries(
      draft.presentation.approvedWording ?? {},
    )) {
      if (
        equalValues(
          wording,
          this.source.presentation.approvedWording?.[targetId],
        ) ||
        p.wording.some(
          (w) => w.targetId === targetId && w.text === wording.text,
        )
      )
        continue;
      const sourceFacts = jobEditorFacts(this.source);
      const valueIds: string[] = [],
        answerIds: string[] = [];
      for (const evidence of wording.sources) {
        const row = sourceFacts.find((f) => f.fact.id === evidence.id);
        if (row) {
          valueIds.push(row.fact.id);
          if (!p.selectedFacts.some((f) => f.valueId === row.fact.id))
            p.selectedFacts.push(row.ref);
        } else if (
          this.source.answers.some(
            (a) => a.id === evidence.id && a.status === "confirmed",
          )
        ) {
          answerIds.push(evidence.id);
          if (!p.selectedAnswerIds.includes(evidence.id))
            p.selectedAnswerIds.push(evidence.id);
        } else throw new AdapterError("rejected");
      }
      p.wording = p.wording.filter((w) => w.targetId !== targetId);
      p.wording.push({
        targetId,
        text: wording.text,
        origin: "user_authored",
        acceptance: "accepted",
        valueIds,
        answerIds,
      });
    }
    try {
      const projected = projectJobEditor(encodeDraft(this.source), p);
      const normalized = clone(draft);
      normalized.summary = projected.summary;
      normalized.professionalSkills = projected.professionalSkills;
      normalized.technicalSkills = projected.technicalSkills;
      normalized.sources = projected.sources;
      // The adapter accepts only controls exposed in job mode, never arbitrary facts.
      if (!equalValues(normalized, projected)) throw new Error();
    } catch {
      throw new AdapterError("rejected");
    }
    return p;
  }
  private command(
    input: { requestId: string },
    kind: "save" | "restore",
    makeBody: () => unknown,
  ) {
    const signature = { kind, input };
    const prior = this.requests.get(input.requestId);
    if (prior) {
      if (!equalValues(prior.input, signature))
        throw new AdapterError("requestMismatch");
      return prior.body;
    }
    const body = makeBody();
    this.requests.set(input.requestId, {
      input: clone(signature),
      body: clone(body),
    });
    return body;
  }
  async save(input: Parameters<BaseCvAdapter["save"]>[0]) {
    const body = this.command(input, "save", () => ({
      requestId: input.requestId,
      documentId: this.documentId,
      expectedRevision: input.expectedRevision,
      payload: this.build(input.draft),
    }));
    return this.accept(await this.http.request<Version>("/save", body));
  }
  async history() {
    if (!this.documentId) return [];
    const rows: Snapshot[] = [];
    let before: number | undefined;
    while (true) {
      const page = await this.http.request<Version[]>(
        `/history?documentId=${this.documentId}${before === undefined ? "" : `&beforeRevision=${before}`}`,
      );
      if (
        page.length > 20 ||
        page.some(
          (r, i) =>
            !Number.isSafeInteger(r.revision) ||
            r.revision < 1 ||
            (i
              ? r.revision >= page[i - 1].revision
              : before !== undefined && r.revision >= before),
        )
      )
        throw new Error("invalidHistoryPage");
      rows.push(...page.map((v) => this.snapshot(v)));
      if (page.length < 20) return rows;
      before = page.at(-1)!.revision;
    }
  }
  async restore(input: Parameters<BaseCvAdapter["restore"]>[0]) {
    const body = this.command(input, "restore", () => ({
      requestId: input.requestId,
      documentId: this.documentId,
      expectedRevision: input.expectedRevision,
      versionId: input.snapshotId,
    }));
    const v = await this.http.request<Version>("/restore", body);
    this.source = clone(v.sourceDraft);
    return this.accept(v);
  }
}
