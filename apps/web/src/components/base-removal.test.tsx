import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { App } from "../App";
import {
  AdapterError,
  MemoryBaseCvAdapter,
  type BaseCvAdapter,
} from "../base/adapter";
import { blankDraft } from "../base/model";
import { HttpBaseCvAdapter } from "../base/http-adapter";
import { cvRoute, type CvDraftGateway } from "../../../api/src/cv/routes";

async function seeded() {
  const adapter = new MemoryBaseCvAdapter(),
    draft = blankDraft();
  draft.name.value = "Synthetic removal owner";
  draft.answers.push({
    id: "old-answer",
    targetId: "old-role",
    question: "context",
    questionText: "Synthetic context question",
    text: "Synthetic old context",
    status: "confirmed",
  });
  const input = {
    draft,
    mode: "autosave" as const,
    expectedRevision: 0,
    requestId: crypto.randomUUID(),
  };
  const snapshot = await adapter.save(input);
  return { adapter, input, snapshot };
}
async function open(adapter: BaseCvAdapter) {
  window.location.hash = "base";
  const view = render(<App adapter={adapter} />);
  fireEvent.change(await screen.findByLabelText("Limba interfeței"), {
    target: { value: "en" },
  });
  await screen.findByRole("button", { name: "Remove Base CV" });
  return view;
}
async function confirmRemoval() {
  fireEvent.click(screen.getByRole("button", { name: "Remove Base CV" }));
  const dialog = await screen.findByRole("dialog");
  expect(dialog.textContent).toContain(
    "Current tailored CVs for each job and language remain",
  );
  fireEvent.click(
    within(dialog).getByRole("button", { name: "Permanently remove Base CV" }),
  );
}

it("requires explicit removal confirmation, clears history/context, reloads empty and starts a fresh manual Base", async () => {
  const { adapter, snapshot, input } = await seeded();
  const view = await open(adapter);
  fireEvent.click(screen.getByRole("button", { name: "Remove Base CV" }));
  fireEvent.click(
    within(await screen.findByRole("dialog")).getByRole("button", {
      name: "Keep draft",
    }),
  );
  expect((await adapter.load())!.id).toBe(snapshot.id);
  await confirmRemoval();
  await screen.findByRole("button", { name: "Enter manually" });
  expect(await adapter.load()).toBeNull();
  expect(await adapter.history()).toEqual([]);
  await expect(adapter.save(input)).rejects.toMatchObject({ code: "expired" });
  await expect(
    adapter.restore({
      snapshotId: snapshot.id,
      expectedRevision: adapter.lifecycle().revision,
      requestId: crypto.randomUUID(),
    }),
  ).rejects.toMatchObject({ code: "missing" });
  view.unmount();
  const next = render(<App adapter={adapter} />);
  fireEvent.change(await screen.findByLabelText("Limba interfeței"), {
    target: { value: "en" },
  });
  fireEvent.click(
    await screen.findByRole("button", { name: "Enter manually" }),
  );
  await waitFor(() =>
    expect(document.querySelector("[data-editor]")).toBeTruthy(),
  );
  expect(screen.queryByDisplayValue("Synthetic removal owner")).toBeNull();
  await waitFor(async () =>
    expect((await adapter.load())?.revision).toBeGreaterThan(
      snapshot.revision + 1,
    ),
  );
  expect((await adapter.load())!.draft.answers).toEqual([]);
  expect((await adapter.load())!.draft.importReview).toBeUndefined();
  next.unmount();
});

it("fences stale initial saves and old removal replay without deleting a new Base", async () => {
  const { adapter, snapshot } = await seeded();
  const operation = {
    requestId: crypto.randomUUID(),
    expectedRevision: snapshot.revision,
    expectedGeneration: 0,
  };
  const result = await adapter.remove(operation);
  expect(await adapter.remove(operation)).toEqual(result);
  await expect(
    adapter.save({
      draft: blankDraft(),
      mode: "autosave",
      expectedRevision: 0,
      requestId: crypto.randomUUID(),
    }),
  ).rejects.toMatchObject({ code: "conflict" });
  const fresh = await adapter.save({
    draft: blankDraft(),
    mode: "autosave",
    expectedRevision: result.revision,
    requestId: crypto.randomUUID(),
  });
  await expect(adapter.remove(operation)).rejects.toMatchObject({
    code: "expired",
  });
  expect((await adapter.load())!.id).toBe(fresh.id);
});

it("retains an unknown removal operation and prevents autosave while retrying the same identity", async () => {
  const { adapter } = await seeded();
  const remove = adapter.remove.bind(adapter),
    seen: string[] = [];
  vi.spyOn(adapter, "remove").mockImplementation(async (input) => {
    seen.push(input.requestId);
    if (seen.length === 1) throw new Error("synthetic response lost");
    return remove(input);
  });
  const save = vi.spyOn(adapter, "save");
  await open(adapter);
  await confirmRemoval();
  await screen.findByRole("heading", { name: "Removal is not confirmed" });
  fireEvent.keyDown(window, { key: "s", ctrlKey: true });
  expect(save).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Check removal" }));
  await screen.findByRole("button", { name: "Enter manually" });
  expect(seen).toHaveLength(2);
  expect(seen[0]).toBe(seen[1]);
});

it("keeps the Base and explains a canonical-current preservation refusal", async () => {
  const { adapter, snapshot } = await seeded();
  vi.spyOn(adapter, "remove").mockRejectedValue(
    new AdapterError("preservationRequired"),
  );
  await open(adapter);
  await confirmRemoval();
  await screen.findByText(/Nothing was removed. An older tailored CV/);
  expect((await adapter.load())!.id).toBe(snapshot.id);
  expect(await adapter.history()).toHaveLength(1);
});

it("rechecks its own authenticated lifecycle on a cross-tab signal and discards old context", async () => {
  const { adapter: store, snapshot } = await seeded();
  let state = store.lifecycle();
  const adapter: BaseCvAdapter = {
    capability: "durable",
    lifecycle: () => state,
    load: async () => {
      state = store.lifecycle();
      return store.load();
    },
    history: () => store.history(),
    save: (i) => store.save(i),
    restore: (i) => store.restore(i),
    remove: (i) => store.remove(i),
  };
  await open(adapter);
  await store.remove({
    requestId: crypto.randomUUID(),
    expectedRevision: snapshot.revision,
    expectedGeneration: 0,
  });
  fireEvent(window, new Event("focus"));
  await screen.findByRole("button", { name: "Enter manually" });
  expect(screen.queryByDisplayValue("Synthetic removal owner")).toBeNull();
});

it("carries an empty-state revision floor through the HTTP route and rejects source-bearing removal input", async () => {
  const { adapter: store, snapshot } = await seeded();
  const remove = vi.fn((i: Parameters<MemoryBaseCvAdapter["remove"]>[0]) =>
    store.remove(i),
  );
  const gateway: CvDraftGateway = {
    loadDraft: async () => null,
    draftHistory: async () => [],
    saveDraft: async () => {
      throw new Error("not used");
    },
    restoreDraft: async () => {
      throw new Error("not used");
    },
    loadBaseState: async () => ({ ...store.lifecycle(), snapshot: null }),
    removeBase: remove,
  };
  const http = new HttpBaseCvAdapter((path, init) =>
    cvRoute(new Request(`https://synthetic.invalid${path}`, init), gateway),
  );
  const removed = await http.remove({
    requestId: crypto.randomUUID(),
    expectedRevision: snapshot.revision,
    expectedGeneration: 0,
  });
  expect(await http.load()).toBeNull();
  expect(http.lifecycle()).toMatchObject({
    generation: 1,
    revision: removed.revision,
  });
  const response = await cvRoute(
    new Request("https://synthetic.invalid/v1/base-cv/remove", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requestId: crypto.randomUUID(),
        expectedRevision: removed.revision,
        expectedGeneration: 1,
        tenantId: crypto.randomUUID(),
      }),
    }),
    gateway,
  );
  expect(response.status).toBe(400);
  expect(remove).toHaveBeenCalledTimes(1);
});
