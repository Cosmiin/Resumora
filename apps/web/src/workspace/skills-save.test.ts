import { expect, it, vi } from "vitest";
import {
  getSkillInventory,
  skillReviewIdentity,
  type SkillInventory,
} from "@resumora/contracts/intelligence/skills-improvement";
import {
  AdapterError,
  MemoryBaseCvAdapter,
  type BaseCvAdapter,
} from "../base/adapter";
import { maraReviewDraft } from "../base/fixture";
import { clone, type BaseDraft, type Fact } from "../base/model";
import { DocumentController } from "./document-controller";

type SaveInput = Parameters<BaseCvAdapter["save"]>[0];
class ControlledAdapter extends MemoryBaseCvAdapter {
  nextSave?: { wait?: Promise<void>; before?: Error; after?: Error };
  writes: SaveInput[] = [];
  override async save(input: SaveInput) {
    const control = this.nextSave;
    this.nextSave = undefined;
    this.writes.push(clone(input));
    await control?.wait;
    if (control?.before) throw control.before;
    const saved = await super.save(input);
    if (control?.after) throw control.after;
    return saved;
  }
}
function gate() {
  let release!: () => void;
  const wait = new Promise<void>((resolve) => (release = resolve));
  return { wait, release };
}
it("automatically retries a transient inventory save with the same write identity", async () => {
  const { controller, adapter, identity, inventory } = await fixture();
  vi.useFakeTimers();
  try {
    adapter.nextSave = { after: new Error("lost acknowledgement") };
    const saving = controller.commitSkillInventory(
      adapter,
      identity,
      inventory,
      { retryTransient: true },
    );
    await vi.advanceTimersByTimeAsync(3000);
    expect(await saving).toBe(true);
    expect(adapter.writes).toHaveLength(2);
    expect(adapter.writes[1]).toEqual(adapter.writes[0]);
    expect(controller.canUndoSkillInventory()).toBe(true);
  } finally {
    vi.useRealTimers();
  }
});
it("recognizes a successful manual retry during the automatic retry delay", async () => {
  const { controller, adapter, identity, inventory } = await fixture();
  vi.useFakeTimers();
  try {
    adapter.nextSave = { before: new Error("offline") };
    const saving = controller.commitSkillInventory(
      adapter,
      identity,
      inventory,
      { retryTransient: true },
    );
    await vi.advanceTimersByTimeAsync(1);
    await controller.submit(adapter);
    await vi.advanceTimersByTimeAsync(3000);
    expect(await saving).toBe(true);
    expect(adapter.writes).toHaveLength(2);
    expect(controller.canUndoSkillInventory()).toBe(true);
  } finally {
    vi.useRealTimers();
  }
});
it("automatic inventory save retries stop after two retries and preserve the original inventory", async () => {
  const { controller, adapter, identity, inventory } = await fixture();
  const before = clone(controller.latest.current);
  const save = vi
    .spyOn(adapter, "save")
    .mockRejectedValue(new Error("offline"));
  vi.useFakeTimers();
  try {
    const saving = controller.commitSkillInventory(
      adapter,
      identity,
      inventory,
      { retryTransient: true },
    );
    await vi.advanceTimersByTimeAsync(3000);
    expect(await saving).toBe(false);
    expect(save).toHaveBeenCalledTimes(3);
    expect(controller.latest.current).toEqual(before);
    expect(controller.pending.current).not.toBeNull();
  } finally {
    vi.useRealTimers();
  }
});
it("automatic save retry stops when the user edits skills", async () => {
  const { controller, adapter, identity, inventory } = await fixture();
  vi.useFakeTimers();
  try {
    adapter.nextSave = { before: new Error("offline") };
    const saving = controller.commitSkillInventory(
      adapter,
      identity,
      inventory,
      { retryTransient: true },
    );
    await vi.advanceTimersByTimeAsync(1);
    edit(controller, (d) => {
      d.technicalSkills[0].value = "My edit";
    });
    await vi.advanceTimersByTimeAsync(3000);
    expect(await saving).toBe(false);
    expect(adapter.writes).toHaveLength(1);
    expect(controller.latest.current!.technicalSkills[0].value).toBe("My edit");
  } finally {
    vi.useRealTimers();
  }
});
function skill(id: string, value: string): Fact<string> {
  return {
    id,
    fieldId: id,
    value,
    status: "user_authored",
    sourceId: "manual",
  };
}
async function fixture() {
  const adapter = new ControlledAdapter();
  const draft = maraReviewDraft();
  draft.roles[0].bullets[0].status = "user_confirmed";
  draft.technicalSkills = [skill("old-technical", "JS + TS")];
  draft.professionalSkills = [skill("old-professional", "Team player")];
  draft.skillReserves = {
    technicalSkills: [skill("old-reserve", "HTML5")],
    professionalSkills: [],
  };
  draft.skillReview = {
    operationId: crypto.randomUUID(),
    fingerprint: "pending-fingerprint",
    snapshotId: crypto.randomUUID(),
    revision: 1,
  };
  const saved = await adapter.save({
    draft,
    expectedRevision: 0,
    mode: "autosave",
    requestId: crypto.randomUUID(),
  });
  const controller = new DocumentController();
  controller.head.current = saved;
  controller.latest.current = clone(saved.draft);
  adapter.writes = [];
  const inventory: SkillInventory = {
    technicalSkills: [skill("js", "JavaScript"), skill("ts", "TypeScript")],
    professionalSkills: [skill("leadership", "Team leadership")],
    skillReserves: {
      technicalSkills: [skill("html", "HTML")],
      professionalSkills: [skill("mentoring", "Mentoring")],
    },
  };
  return {
    adapter,
    controller,
    saved,
    inventory,
    identity: skillReviewIdentity(draft),
  };
}
function edit(
  controller: DocumentController,
  update: (draft: BaseDraft) => void,
) {
  const next = clone(controller.latest.current!);
  update(next);
  controller.latest.current = next;
  controller.generation.current++;
}
async function saveOrdinary(
  controller: DocumentController,
  adapter: BaseCvAdapter,
) {
  controller.pending.current = {
    kind: "save",
    generation: controller.generation.current,
    input: {
      draft: clone(controller.latest.current!),
      expectedRevision: controller.head.current!.revision,
      mode: "autosave",
      requestId: crypto.randomUUID(),
    },
  };
  await controller.submit(adapter);
}

it("rejects an inventory generated from outdated review inputs without saving", async () => {
  const { controller, adapter, saved, inventory } = await fixture();
  expect(
    await controller.commitSkillInventory(adapter, "outdated-input", inventory),
  ).toBe(false);
  expect(controller.latest.current).toEqual(saved.draft);
  expect(await adapter.history()).toHaveLength(1);
});

it("publishes the complete inventory and clears the review receipt only after the save is confirmed", async () => {
  const { controller, adapter, saved, identity, inventory } = await fixture();
  const pause = gate();
  adapter.nextSave = { wait: pause.wait };
  const observed: BaseDraft[] = [];
  controller.subscribe(() => observed.push(clone(controller.latest.current!)));
  const committing = controller.commitSkillInventory(
    adapter,
    identity,
    inventory,
  );
  expect(controller.latest.current).toEqual(saved.draft);
  expect(controller.canUndoSkillInventory()).toBe(false);
  expect(controller.lock.current).toBe(true);
  expect(controller.unsaved).toBe(true);
  pause.release();
  expect(await committing).toBe(true);
  expect(getSkillInventory(controller.latest.current!)).toEqual(inventory);
  expect(controller.latest.current?.skillReview).toBeUndefined();
  expect(controller.latest.current).toEqual((await adapter.load())!.draft);
  expect(controller.unsaved).toBe(false);
  expect(controller.canUndoSkillInventory()).toBe(true);
  for (const draft of observed)
    expect([getSkillInventory(saved.draft), inventory]).toContainEqual(
      getSkillInventory(draft),
    );
  expect((await adapter.history()).at(-1)!.draft).toEqual(saved.draft);
});

it("keeps the original inventory and offers no Undo after a definite save failure", async () => {
  const { controller, adapter, saved, identity, inventory } = await fixture();
  adapter.nextSave = { before: new AdapterError("rejected") };
  expect(
    await controller.commitSkillInventory(adapter, identity, inventory),
  ).toBe(false);
  expect(controller.latest.current).toEqual(saved.draft);
  expect(controller.pending.current).toBeNull();
  expect(controller.canUndoSkillInventory()).toBe(false);
  expect(await adapter.history()).toHaveLength(1);
});

it.each(["before", "after"] as const)(
  "retries an unknown %s-write outcome through submit with the same body and request ID",
  async (phase) => {
    const { controller, adapter, saved, identity, inventory } = await fixture();
    adapter.nextSave = { [phase]: new Error("connection lost") };
    expect(
      await controller.commitSkillInventory(adapter, identity, inventory),
    ).toBe(false);
    expect(controller.latest.current).toEqual(saved.draft);
    expect(controller.pending.current?.uncertain).toBe(true);
    expect(controller.canUndoSkillInventory()).toBe(false);
    const pending = clone(controller.pending.current!.input);
    edit(controller, (draft) => {
      draft.name.value = "Updated name";
    });
    await controller.submit(adapter);
    expect(adapter.writes).toEqual([pending, pending]);
    expect(await adapter.history()).toHaveLength(2);
    expect(getSkillInventory(controller.latest.current!)).toEqual(inventory);
    expect(controller.latest.current!.name.value).toBe("Updated name");
    expect(controller.unsaved).toBe(true);
    expect(controller.pending.current).toBeNull();
    expect(controller.canUndoSkillInventory()).toBe(true);
  },
);

it.each(["active skill", "reserve skill", "experience", "language"])(
  "preserves a later %s edit when an inventory save is acknowledged",
  async (field) => {
    const { controller, adapter, identity, inventory } = await fixture();
    const pause = gate();
    adapter.nextSave = { wait: pause.wait };
    const committing = controller.commitSkillInventory(
      adapter,
      identity,
      inventory,
    );
    edit(controller, (draft) => {
      if (field === "active skill")
        draft.technicalSkills[0].value = "User skill";
      if (field === "reserve skill")
        draft.skillReserves!.technicalSkills[0].value = "User reserve";
      if (field === "experience")
        draft.roles[0].bullets[0].value = "User experience";
      if (field === "language")
        draft.language = draft.language === "en" ? "ro" : "en";
    });
    const edited = clone(controller.latest.current);
    pause.release();
    expect(await committing).toBe(false);
    expect(controller.latest.current).toEqual(edited);
    expect(controller.head.current!.revision).toBe(2);
    expect(controller.unsaved).toBe(true);
    expect(controller.canUndoSkillInventory()).toBe(false);
  },
);

it("merges a confirmed inventory with unrelated edits made while saving", async () => {
  const { controller, adapter, identity, inventory } = await fixture();
  const pause = gate();
  adapter.nextSave = { wait: pause.wait };
  const committing = controller.commitSkillInventory(
    adapter,
    identity,
    inventory,
  );
  edit(controller, (draft) => {
    draft.name.value = "New name";
  });
  pause.release();
  expect(await committing).toBe(true);
  expect(controller.latest.current!.name.value).toBe("New name");
  expect(getSkillInventory(controller.latest.current!)).toEqual(inventory);
  expect(controller.unsaved).toBe(true);
});

it("does not resurrect a disposed controller after a late acknowledgement", async () => {
  const { controller, adapter, identity, inventory } = await fixture();
  const pause = gate();
  adapter.nextSave = { wait: pause.wait };
  const committing = controller.commitSkillInventory(
    adapter,
    identity,
    inventory,
  );
  controller.dispose();
  pause.release();
  expect(await committing).toBe(false);
  expect(controller.latest.current).toBeNull();
  expect(controller.head.current).toBeUndefined();
  expect(controller.pending.current).toBeNull();
  expect(controller.canUndoSkillInventory()).toBe(false);
  expect(
    await controller.commitSkillInventory(adapter, identity, inventory),
  ).toBe(false);
});

it("Undo saves only the prior inventory and preserves later unrelated edits", async () => {
  const { controller, adapter, saved, identity, inventory } = await fixture();
  expect(
    await controller.commitSkillInventory(adapter, identity, inventory),
  ).toBe(true);
  edit(controller, (draft) => {
    draft.name.value = "New name";
    draft.roles[0].bullets[0].value = "New experience";
  });
  await saveOrdinary(controller, adapter);
  expect(controller.canUndoSkillInventory()).toBe(true);
  const pause = gate();
  adapter.nextSave = { wait: pause.wait };
  const undoing = controller.undoSkillInventory(adapter);
  expect(getSkillInventory(controller.latest.current!)).toEqual(inventory);
  pause.release();
  expect(await undoing).toBe(true);
  expect(getSkillInventory(controller.latest.current!)).toEqual(
    getSkillInventory(saved.draft),
  );
  expect(controller.latest.current!.name.value).toBe("New name");
  expect(controller.latest.current!.roles[0].bullets[0].value).toBe(
    "New experience",
  );
  expect(controller.latest.current!.skillReview).toBeUndefined();
  expect(controller.canUndoSkillInventory()).toBe(false);
  expect(await controller.undoSkillInventory(adapter)).toBe(false);
  expect((await adapter.load())!.draft).toEqual(controller.latest.current);
});

it("invalidates Undo after an ordinary skill save even if the inventory is later restored", async () => {
  const { controller, adapter, identity, inventory } = await fixture();
  await controller.commitSkillInventory(adapter, identity, inventory);
  const applied = clone(controller.latest.current!);
  edit(controller, (draft) => {
    draft.skillReserves!.technicalSkills[0].value = "User reserve edit";
  });
  await saveOrdinary(controller, adapter);
  controller.latest.current = applied;
  expect(controller.canUndoSkillInventory()).toBe(false);
  expect(await controller.undoSkillInventory(adapter)).toBe(false);
});

it("keeps Undo session-only and cannot overwrite another document", async () => {
  const { controller, adapter, identity, inventory } = await fixture();
  await controller.commitSkillInventory(adapter, identity, inventory);
  const reopened = new DocumentController();
  reopened.head.current = await adapter.load();
  reopened.latest.current = clone(reopened.head.current!.draft);
  expect(reopened.canUndoSkillInventory()).toBe(false);
  edit(controller, (draft) => {
    draft.id = "different-document";
  });
  expect(controller.canUndoSkillInventory()).toBe(false);
  expect(await controller.undoSkillInventory(adapter)).toBe(false);
});

it("preserves a newer skill edit during an uncertain Undo retry", async () => {
  const { controller, adapter, identity, inventory } = await fixture();
  await controller.commitSkillInventory(adapter, identity, inventory);
  adapter.nextSave = { after: new Error("Undo acknowledgement lost") };
  expect(await controller.undoSkillInventory(adapter)).toBe(false);
  expect(getSkillInventory(controller.latest.current!)).toEqual(inventory);
  edit(controller, (draft) => {
    draft.technicalSkills[0].value = "Later skill";
  });
  const edited = clone(controller.latest.current);
  await controller.submit(adapter);
  expect(controller.latest.current).toEqual(edited);
  expect(controller.unsaved).toBe(true);
  expect(controller.canUndoSkillInventory()).toBe(false);
});

it("does not replace an unresolved inventory save with a second request", async () => {
  const { controller, adapter, identity, inventory } = await fixture();
  adapter.nextSave = { after: new Error("acknowledgement lost") };
  await controller.commitSkillInventory(adapter, identity, inventory);
  const pending = clone(controller.pending.current);
  expect(
    await controller.commitSkillInventory(adapter, identity, inventory),
  ).toBe(false);
  expect(controller.pending.current).toEqual(pending);
  expect(await controller.undoSkillInventory(adapter)).toBe(false);
  expect(adapter.writes).toHaveLength(1);
});

it("does not replace a new document head when an older inventory save returns", async () => {
  const { controller, adapter, saved, identity, inventory } = await fixture();
  const pause = gate();
  adapter.nextSave = { wait: pause.wait };
  const committing = controller.commitSkillInventory(
    adapter,
    identity,
    inventory,
  );
  controller.pending.current = null;
  controller.latest.current = null;
  controller.head.current = null;
  pause.release();
  expect(await committing).toBe(false);
  expect(controller.latest.current).toBeNull();
  expect(controller.head.current).toBeNull();
  expect(controller.canUndoSkillInventory()).toBe(false);
  expect(saved.revision).toBe(1);
});

it.each([false, true])(
  "reconciles an expired staged receipt without overwriting a later skill edit (%s)",
  async (laterEdit) => {
    const { controller, adapter, identity, inventory } = await fixture();
    adapter.nextSave = { after: new Error("acknowledgement lost") };
    await controller.commitSkillInventory(adapter, identity, inventory);
    adapter.nextSave = { before: new AdapterError("expired") };
    await controller.submit(adapter);
    const pending = controller.pending.current!;
    expect(pending.expired).toBe(true);
    if (laterEdit)
      edit(controller, (draft) => {
        draft.technicalSkills[0].value = "User edit";
      });
    const latest = clone(controller.latest.current);
    const saved = await adapter.load();
    expect(controller.acceptReconciledWrite(pending, saved, true)).toBe(true);
    expect(controller.pending.current).toBeNull();
    expect(controller.error).toBeNull();
    expect(controller.head.current?.revision).toBe(2);
    expect(controller.unsaved).toBe(laterEdit);
    expect(controller.canUndoSkillInventory()).toBe(!laterEdit);
    if (laterEdit) expect(controller.latest.current).toEqual(latest);
    else {
      expect(getSkillInventory(controller.latest.current!)).toEqual(inventory);
      expect(controller.latest.current?.skillReview).toBeUndefined();
    }
  },
);

it("releases an expired request that did not save without publishing its inventory", async () => {
  const { controller, adapter, saved, identity, inventory } = await fixture();
  adapter.nextSave = { before: new AdapterError("expired") };
  await controller.commitSkillInventory(adapter, identity, inventory);
  expect(
    controller.acceptReconciledWrite(controller.pending.current!, saved, false),
  ).toBe(true);
  expect(controller.latest.current).toEqual(saved.draft);
  expect(controller.canUndoSkillInventory()).toBe(false);
  expect(controller.pending.current).toBeNull();
  expect(controller.unsaved).toBe(false);
});

it("rejects an expired reconciliation after disposal", async () => {
  const { controller, adapter, identity, inventory } = await fixture();
  adapter.nextSave = { after: new Error("acknowledgement lost") };
  await controller.commitSkillInventory(adapter, identity, inventory);
  const pending = controller.pending.current!;
  const saved = await adapter.load();
  controller.dispose();
  expect(controller.acceptReconciledWrite(pending, saved, true)).toBe(false);
  expect(controller.latest.current).toBeNull();
  expect(controller.head.current).toBeUndefined();
});


it("refuses a previous improvement's undo during another improvement and while its receipt is pending", async () => {
  const {controller, adapter, identity, inventory} = await fixture();
  expect(await controller.commitSkillInventory(adapter, identity, inventory)).toBe(true);
  expect(controller.canUndoSkillInventory()).toBe(true);
  const before = clone(controller.latest.current);
  const writes = adapter.writes.length;
  controller.setSkillsImproving(true);
  expect(controller.canUndoSkillInventory()).toBe(false);
  expect(await controller.undoSkillInventory(adapter)).toBe(false);
  expect(controller.latest.current).toEqual(before);
  expect(adapter.writes.length).toBe(writes);
  controller.setSkillsImproving(false);
  controller.latest.current!.skillReview = {operationId:"pending",fingerprint:"a".repeat(64),snapshotId:"saved",revision:1};
  expect(controller.profileChangesBlocked()).toBe(true);
  expect(await controller.undoSkillInventory(adapter)).toBe(false);
  delete controller.latest.current!.skillReview;
  expect(await controller.undoSkillInventory(adapter)).toBe(true);
});
