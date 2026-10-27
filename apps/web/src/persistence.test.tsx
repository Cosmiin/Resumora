import { act, render, screen, waitFor } from "@testing-library/react";
import { expect, it } from "vitest";
import { App } from "./App";
import { MemoryBaseCvAdapter, type BaseCvAdapter, type Snapshot } from "./base/adapter";
import { blankDraft, fact } from "./base/model";

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
