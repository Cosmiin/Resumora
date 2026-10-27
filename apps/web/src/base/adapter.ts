import { clone, equalValues, localId, type BaseDraft } from "./model";
import { validateDraft, type Issue } from "./validation";
export type Snapshot = {
  id: string;
  revision: number;
  parentId: string | null;
  restoredFrom?: string;
  createdAt: string;
  reason: "save" | "autosave" | "restore";
  draft: BaseDraft;
};
export class AdapterError extends Error {
  constructor(
    public code: "validation" | "conflict" | "missing" | "requestMismatch" | "rejected" | "unauthenticated" | "expired",
    public issues: Issue[] = [],
  ) {
    super(code);
  }
}
export interface BaseCvAdapter {
  readonly capability: "session-memory" | "durable";
  load(): Promise<Snapshot | null>;
  history(): Promise<Snapshot[]>;
  save(input: {
    draft: BaseDraft;
    expectedRevision: number;
    mode?: "autosave" | "checkpoint";
    requestId: string;
  }): Promise<Snapshot>;
  restore(input: {
    snapshotId: string;
    expectedRevision: number;
    requestId: string;
  }): Promise<Snapshot>;
}
// No localStorage, sessionStorage, IndexedDB, cookies, fetch, or auth identity.
// Each instance is one document in one page lifetime; every read/write crosses a clone boundary.
export class MemoryBaseCvAdapter implements BaseCvAdapter {
  readonly capability = "session-memory" as const;
  private versions: Snapshot[] = [];
  private requests = new Map<string, { body: string; snapshot: Snapshot }>();
  async load() {
    return clone(this.versions.at(-1) ?? null);
  }
  async history() {
    return clone(this.versions).reverse();
  }
  private replay(requestId: string, body: string) {
    const old = this.requests.get(requestId);
    if (old && old.body !== body) throw new AdapterError("requestMismatch");
    return old ? clone(old.snapshot) : null;
  }
  private publish(
    draft: BaseDraft,
    reason: Snapshot["reason"],
    restoredFrom?: string,
  ): Snapshot {
    const parent = this.versions.at(-1);
    const snapshot: Snapshot = {
      id: localId(),
      revision: (parent?.revision ?? 0) + 1,
      parentId: parent?.id ?? null,
      createdAt: new Date().toISOString(),
      reason,
      ...(restoredFrom ? { restoredFrom } : {}),
      draft: clone(draft),
    };
    this.versions.push(snapshot);
    return clone(snapshot);
  }
  async save(input: {
    draft: BaseDraft;
    expectedRevision: number;
    mode?: "autosave" | "checkpoint";
    requestId: string;
  }) {
    const body = JSON.stringify(input),
      prior = this.replay(input.requestId, body);
    if (prior) return prior;
    const head = this.versions.at(-1);
    if (input.expectedRevision !== (head?.revision ?? 0))
      throw new AdapterError("conflict");
    // Autosave preserves incomplete drafts without attesting imported facts.
    const issues = input.mode === "autosave" ? [] : validateDraft(input.draft);
    if (issues.length) throw new AdapterError("validation", issues);
    const snapshot =
      head && equalValues(head.draft, input.draft)
        ? clone(head)
        : this.publish(
            input.draft,
            input.mode === "autosave" ? "autosave" : "save",
          );
    this.requests.set(input.requestId, { body, snapshot: clone(snapshot) });
    return snapshot;
  }
  async restore(input: {
    snapshotId: string;
    expectedRevision: number;
    requestId: string;
  }) {
    const body = JSON.stringify(input),
      prior = this.replay(input.requestId, body);
    if (prior) return prior;
    const head = this.versions.at(-1);
    if (input.expectedRevision !== (head?.revision ?? 0))
      throw new AdapterError("conflict");
    const old = this.versions.find((s) => s.id === input.snapshotId);
    if (!old) throw new AdapterError("missing");
    const snapshot = this.publish(old.draft, "restore", old.id);
    this.requests.set(input.requestId, { body, snapshot: clone(snapshot) });
    return snapshot;
  }
}
