import {
  AdapterError,
  type BaseCvAdapter,
  type Snapshot,
} from "../base/adapter";
import { clone, equalValues, type BaseDraft } from "../base/model";
import {
  getSkillInventory,
  skillInventoryIdentity,
  skillReviewIdentity,
  withSkillInventory,
  type SkillInventory,
} from "@resumora/contracts/intelligence/skills-improvement";
type StagedSkillInventory = {
  documentId: string;
  headId: string;
  expectedIdentity: string;
  previous: SkillInventory;
  review: BaseDraft["skillReview"];
  undo: boolean;
  applied?: boolean;
  discarded?: boolean;
};
export type PendingWrite = {
  generation: number;
  expired?: boolean;
  uncertain?: boolean;
} & (
  | {
      kind: "save";
      input: Parameters<BaseCvAdapter["save"]>[0];
      skillInventory?: StagedSkillInventory;
    }
  | { kind: "restore"; input: Parameters<BaseCvAdapter["restore"]>[0] }
);
/** A document's save lifecycle outlives every view and is retired with its account. */
export class DocumentController {
  adapter?: BaseCvAdapter;
  latest: { current: BaseDraft | null } = { current: null };
  head: { current: Snapshot | null | undefined } = { current: undefined };
  generation = { current: 0 };
  lock = { current: false };
  pending: { current: PendingWrite | null } = { current: null };
  error: string | null = null;
  unsaved = false;
  private skillsImproving = false;
  skillTimeoutId?: string;
  private skillTimer?: ReturnType<typeof setTimeout>;
  /** The deadline belongs to the document, even when the skills view is closed. */
  watchSkillReview = () => {
    clearTimeout(this.skillTimer);
    const review = this.latest.current?.skillReview;
    if (!this.alive || !review) return;
    const remaining = (review.expiresAt ?? 0) - Date.now();
    if (remaining <= 0) this.discardSkillReview(review.operationId);
    else
      this.skillTimer = setTimeout(
        () => this.discardSkillReview(review.operationId),
        remaining,
      );
  };
  discardSkillReview = (operationId: string) => {
    const current = this.latest.current;
    if (!this.alive || current?.skillReview?.operationId !== operationId)
      return;
    clearTimeout(this.skillTimer);
    const pending = this.pending.current;
    if (
      pending?.kind === "save" &&
      pending.skillInventory?.review?.operationId === operationId
    )
      pending.skillInventory.discarded = true;
    // Keep an uncertain database write's identity for reconciliation. Its late
    // acknowledgement may advance the saved revision, but must never publish
    // the discarded inventory over the retained draft or subsequent edits.
    const next = clone(current);
    delete next.skillReview;
    this.latest.current = next;
    this.generation.current++;
    this.skillsImproving = false;
    this.skillTimeoutId = operationId;
    this.skillUndo = undefined;
    this.refreshUnsaved();
    this.notify();
  };
  setSkillsImproving = (active: boolean) => {
    if (this.skillsImproving === active) return;
    this.skillsImproving = active;
    this.notify();
  };
  profileChangesBlocked(): boolean {
    return (
      this.skillsImproving ||
      !!this.latest.current?.skillReview ||
      !!(
        this.pending.current?.kind === "save" &&
        this.pending.current.skillInventory &&
        !this.pending.current.skillInventory.discarded
      )
    );
  }

  private listeners = new Set<() => void>();
  private alive = true;
  private skillUndo?: {
    documentId: string;
    appliedIdentity: string;
    previous: SkillInventory;
  };
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  notify = () => {
    this.invalidateSkillUndo();
    if (this.alive) for (const fn of this.listeners) fn();
  };
  private invalidateSkillUndo() {
    if (
      this.skillUndo &&
      (!this.alive ||
        !this.latest.current ||
        this.latest.current.id !== this.skillUndo.documentId ||
        skillInventoryIdentity(this.latest.current) !==
          this.skillUndo.appliedIdentity)
    )
      this.skillUndo = undefined;
  }
  canUndoSkillInventory(): boolean {
    this.invalidateSkillUndo();
    return !!(
      this.skillUndo &&
      !this.profileChangesBlocked() &&
      this.head.current &&
      !this.lock.current &&
      !this.pending.current &&
      this.error !== "conflict"
    );
  }
  async commitSkillInventory(
    adapter: BaseCvAdapter,
    expectedReviewIdentity: string,
    inventory: SkillInventory,
    options: { retryTransient?: boolean } = {},
  ): Promise<boolean> {
    return this.stageSkillInventory(
      adapter,
      expectedReviewIdentity,
      inventory,
      false,
      options.retryTransient,
    );
  }
  async undoSkillInventory(
    adapter: BaseCvAdapter,
    options: { retryTransient?: boolean } = {},
  ): Promise<boolean> {
    if (!this.canUndoSkillInventory()) return false;
    const undo = this.skillUndo!;
    return this.stageSkillInventory(
      adapter,
      undo.appliedIdentity,
      undo.previous,
      true,
      options.retryTransient,
    );
  }
  private async stageSkillInventory(
    adapter: BaseCvAdapter,
    expectedIdentity: string,
    inventory: SkillInventory,
    undo: boolean,
    retryTransient = false,
  ): Promise<boolean> {
    const current = this.latest.current;
    const head = this.head.current;
    if (
      !this.alive ||
      !current ||
      !head ||
      this.lock.current ||
      this.pending.current ||
      this.error === "conflict" ||
      (!undo &&
        current.skillReview?.expiresAt !== undefined &&
        current.skillReview.expiresAt <= Date.now()) ||
      (undo
        ? skillInventoryIdentity(current)
        : skillReviewIdentity(current)) !== expectedIdentity
    )
      return false;
    const draft = withSkillInventory(clone(current), clone(inventory));
    delete draft.skillReview;
    const staged: StagedSkillInventory = {
      documentId: current.id,
      headId: head.id,
      expectedIdentity,
      previous: clone(getSkillInventory(current)),
      review: clone(current.skillReview),
      undo,
    };
    this.pending.current = {
      kind: "save",
      generation: this.generation.current,
      skillInventory: staged,
      input: {
        draft,
        expectedRevision: head.revision,
        mode: "autosave",
        requestId: crypto.randomUUID(),
      },
    };
    this.unsaved = true;
    const operation = this.pending.current;
    await this.submit(adapter);
    const retryable = () =>
      this.alive &&
      !staged.discarded &&
      this.pending.current === operation &&
      operation.uncertain &&
      !operation.expired &&
      this.error === "save" &&
      !this.lock.current &&
      !!this.latest.current &&
      this.latest.current.id === staged.documentId &&
      (undo
        ? skillInventoryIdentity(this.latest.current)
        : skillReviewIdentity(this.latest.current)) === expectedIdentity;
    if (retryTransient)
      for (const delay of [750, 2000]) {
        if (!retryable()) break;
        await new Promise((resolve) => setTimeout(resolve, delay));
        if (!retryable()) break;
        await this.submit(adapter);
      }
    return this.alive && !!staged.applied;
  }
  private publishSkillInventory(staged: StagedSkillInventory, saved: Snapshot) {
    const current = this.latest.current;
    if (
      !current ||
      staged.discarded ||
      current.id !== staged.documentId ||
      (staged.undo
        ? skillInventoryIdentity(current)
        : skillReviewIdentity(current)) !== staged.expectedIdentity ||
      !equalValues(current.skillReview, staged.review)
    )
      return;
    // Keep unrelated edits made during the request; only the inventory and its
    // completed receipt come from this acknowledged save.
    const next = withSkillInventory(
      clone(current),
      getSkillInventory(saved.draft),
    );
    delete next.skillReview;
    this.latest.current = next;
    this.generation.current++;
    this.skillUndo = staged.undo
      ? undefined
      : {
          documentId: next.id,
          appliedIdentity: skillInventoryIdentity(next),
          previous: staged.previous,
        };
    staged.applied = true;
  }
  private acknowledgeWrite(
    operation: PendingWrite,
    saved: Snapshot | null,
    applied: boolean,
  ): boolean {
    if (!this.alive || this.pending.current !== operation) return false;
    const staged = operation.kind === "save" && operation.skillInventory;
    if (
      staged &&
      !staged.undo &&
      staged.review?.expiresAt !== undefined &&
      staged.review.expiresAt <= Date.now()
    )
      this.discardSkillReview(staged.review.operationId);
    if (
      staged &&
      (this.latest.current?.id !== staged.documentId ||
        this.head.current?.id !== staged.headId)
    ) {
      this.pending.current = null;
      return false;
    }
    this.pending.current = null;
    this.head.current = saved;
    this.error = null;
    if (applied && saved) {
      if (staged) this.publishSkillInventory(staged, saved);
      else if (
        this.skillUndo &&
        skillInventoryIdentity(saved.draft) !== this.skillUndo.appliedIdentity
      )
        this.skillUndo = undefined;
      if (
        operation.kind === "restore" &&
        operation.generation === this.generation.current
      )
        this.latest.current = clone(saved.draft);
    }
    return true;
  }
  private refreshUnsaved() {
    this.unsaved =
      !!this.pending.current ||
      (!!this.latest.current &&
        (!this.head.current ||
          !equalValues(this.latest.current, this.head.current.draft)));
  }
  /** The caller first verifies that a loaded snapshot applied this request or
   * still has its original revision, using the adapter's draft comparison. */
  acceptReconciledWrite(
    operation: PendingWrite,
    saved: Snapshot | null,
    applied: boolean,
  ): boolean {
    const accepted = this.acknowledgeWrite(operation, saved, applied);
    this.refreshUnsaved();
    this.notify();
    return accepted;
  }
  async submit(adapter: BaseCvAdapter) {
    const operation = this.pending.current;
    if (!this.alive || !operation || operation.expired || this.lock.current)
      return null;
    this.lock.current = true;
    this.notify();
    let saved: Snapshot | undefined;
    try {
      saved =
        operation.kind === "save"
          ? await adapter.save(clone(operation.input))
          : await adapter.restore(clone(operation.input));
      if (!this.acknowledgeWrite(operation, saved, true)) return null;
    } catch (error) {
      if (!this.alive || this.pending.current !== operation) return null;
      if (error instanceof AdapterError) {
        if (error.code === "expired") operation.expired = true;
        else if (
          !operation.uncertain ||
          !["unauthenticated", "forbidden", "missing"].includes(error.code)
        )
          this.pending.current = null;
      } else operation.uncertain = true;
      const superseded =
        !this.pending.current &&
        error instanceof AdapterError &&
        ["rejected", "validation"].includes(error.code) &&
        operation.generation !== this.generation.current;
      this.error = superseded
        ? null
        : error instanceof AdapterError
          ? error.code
          : "save";
    } finally {
      this.lock.current = false;
      this.refreshUnsaved();
      this.notify();
    }
    return { operation, saved };
  }
  dispose() {
    clearTimeout(this.skillTimer);
    this.alive = false;
    this.skillUndo = undefined;
    this.listeners.clear();
    this.latest.current = null;
    this.head.current = undefined;
    this.pending.current = null;
  }
}
