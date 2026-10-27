import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it } from "vitest";
import { App } from "./App";
import { MemoryBaseCvAdapter, type BaseCvAdapter, type Snapshot } from "./base/adapter";
import { blankDraft, fact } from "./base/model";

function unloadPrevented() {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

it.each(["session-memory", "durable"] as const)(
  "%s unload protection follows draft persistence and cleans up across adapters",
  async (capability) => {
    window.location.hash = "#start";
    const storage = new MemoryBaseCvAdapter();
    const adapter: BaseCvAdapter = {
      capability,
      load: storage.load.bind(storage),
      history: storage.history.bind(storage),
      save: storage.save.bind(storage),
      restore: storage.restore.bind(storage),
    };
    const view = render(<App adapter={adapter} />);
    const manual = await screen.findByRole("button", { name: "Completează manual" });
    expect(unloadPrevented()).toBe(false);
    fireEvent.click(manual);
    expect(unloadPrevented()).toBe(true);
    fireEvent.change(screen.getByRole("textbox", { name: /Prenume/ }), {
      target: { value: "Ana" },
    });
    const savedText = capability === "durable"
      ? "Ciornă salvată în cont · v1"
      : "Ciornă salvată în sesiune · v1";
    await screen.findByText(savedText);
    expect((await storage.load())?.draft.name.value).toBe("Ana");
    expect(unloadPrevented()).toBe(capability === "session-memory");
    fireEvent.click(screen.getByRole("link", { name: "Acasă" }));
    await screen.findByRole("button", { name: "Redeschide versiunea salvată" });
    expect(unloadPrevented()).toBe(capability === "session-memory");
    view.unmount();
    expect(unloadPrevented()).toBe(false);

    window.location.hash = "#base";
    const reopened = render(<App adapter={adapter} />);
    await screen.findByText(savedText);
    expect(unloadPrevented()).toBe(capability === "session-memory");
    fireEvent.change(screen.getByRole("textbox", { name: /Prenume/ }), {
      target: { value: "Mira" },
    });
    expect(unloadPrevented()).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Anulează ultima modificare" }));
    expect(screen.getByDisplayValue("Ana")).toBeTruthy();
    expect(unloadPrevented()).toBe(capability === "session-memory");
    fireEvent.change(screen.getByRole("textbox", { name: /Prenume/ }), {
      target: { value: "Mira" },
    });
    expect(unloadPrevented()).toBe(true);
    reopened.rerender(<App adapter={new MemoryBaseCvAdapter()} />);
    await screen.findByRole("button", { name: "Completează manual" });
    expect(unloadPrevented()).toBe(false);
    reopened.unmount();
    expect(unloadPrevented()).toBe(false);
  },
);

it("adapter/account change clears prior CV and ignores late previous-account load replies", async () => {
  window.location.hash = "#base";
  const draft = blankDraft(); draft.name = fact("Account A private");
  let finish!: (row: Snapshot) => void;
  const a: BaseCvAdapter = { capability: "durable", load: () => new Promise(resolve => { finish = resolve; }),
    history: async () => [], save: async () => { throw new Error("unexpected"); }, restore: async () => { throw new Error("unexpected"); } };
  const view = render(<App adapter={a} />);
  const b = new MemoryBaseCvAdapter();
  view.rerender(<App adapter={b} />);
  await screen.findByRole("button", { name: "Completează manual" });
  await act(async () => finish({ id: "a", revision: 1, parentId: null, reason: "autosave", createdAt: new Date().toISOString(), draft }));
  expect(screen.queryByDisplayValue("Account A private")).toBeNull();
  expect(screen.queryByText("Account A private")).toBeNull();
  await waitFor(() => expect(screen.getByRole("button", { name: "Completează manual" })).toBeTruthy());
});
it("retries failed initial cloud loads without requiring a draft to save", async () => {
  window.location.hash = "#home";
  let loads = 0;
  const adapter = new MemoryBaseCvAdapter();
  const load = adapter.load.bind(adapter);
  adapter.load = async () => { if (++loads === 1) throw new Error("offline"); return load(); };
  render(<App adapter={adapter} />);
  const retry = await screen.findByRole("button", { name: "Reîncearcă" });
  await act(async () => retry.click());
  await screen.findByRole("button", { name: /Creează CV-ul de bază/ });
  expect(loads).toBe(2);
  expect(screen.queryByRole("alert")).toBeNull();
});
