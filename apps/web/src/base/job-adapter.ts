import { selfContainedJobDraft } from "@resumora/contracts/jobs/current-document";
import { AdapterError, type BaseCvAdapter, type Snapshot } from "./adapter";
import { clone, equalValues, type BaseDraft } from "./model";
import { HttpBaseCvAdapter, type CvTransport } from "./http-adapter";
type Current = {
  id: string;
  documentId: string;
  revision: number;
  createdAt: string;
  locale: "ro" | "en";
  fingerprint?: string;
  draft: BaseDraft;
};
/** One CURRENT accepted document per job and language; counters are CAS metadata,
 * never content history. Existing editor/preview is reused. */
export class HttpJobCvAdapter implements BaseCvAdapter {
  readonly capability = "durable" as const;
  private documentId: string | null = null;
  private fingerprint = "";
  private source!: BaseDraft;
  private baseSnapshotId: string | null = null;
  private http: HttpBaseCvAdapter;
  private requests = new Map<string, { input: unknown; body: unknown }>();
  constructor(
    transport: CvTransport,
    readonly jobId: string,
    readonly locale?: "ro" | "en",
  ) {
    this.http = new HttpBaseCvAdapter(
      transport,
      `/v1/jobs/${encodeURIComponent(jobId)}/cv`,
    );
  }
  exportDocumentId() {
    return this.documentId;
  }
  exportFingerprint() {
    return this.fingerprint;
  }
  private accept(v: Current): Snapshot {
    this.documentId = v.documentId;
    this.fingerprint = v.fingerprint ?? "";
    this.source = clone(v.draft);
    this.baseSnapshotId = null;
    return {
      id: v.id,
      revision: v.revision,
      parentId: null,
      createdAt: v.createdAt,
      reason: "save",
      draft: clone(v.draft),
    };
  }
  async load() {
    const v = await this.http.request<Current | null>(
      this.locale ? `?locale=${this.locale}` : "",
    );
    if (v) return this.accept(v);
    const context = await this.http.request<{
      source: { snapshotId: string };
      draft: BaseDraft;
    }>("/context");
    this.baseSnapshotId = context.source.snapshotId;
    this.source = selfContainedJobDraft(context.draft);
    if (this.locale) this.source.language = this.locale;
    this.documentId = null;
    return null;
  }
  initialDraft() {
    return clone(this.source);
  }
  matchesDraft(saved: BaseDraft, draft: BaseDraft) {
    return equalValues(saved, selfContainedJobDraft(draft));
  }
  async save(input: Parameters<BaseCvAdapter["save"]>[0]) {
    const prior = this.requests.get(input.requestId);
    if (prior && !equalValues(prior.input, input))
      throw new AdapterError("requestMismatch");
    const body = prior?.body ?? {
      requestId: input.requestId,
      documentId: this.documentId,
      expectedRevision: input.expectedRevision,
      locale: this.locale ?? input.draft.language,
      baseSnapshotId: this.baseSnapshotId,
      draft: selfContainedJobDraft(input.draft),
    };
    this.requests.set(input.requestId, {
      input: clone(input),
      body: clone(body),
    });
    return this.accept(await this.http.request<Current>("/save", body));
  }
  async history(): Promise<Snapshot[]> {
    return [];
  }
  async restore(
    _input: Parameters<BaseCvAdapter["restore"]>[0],
  ): Promise<Snapshot> {
    throw new AdapterError("expired");
  }
}
