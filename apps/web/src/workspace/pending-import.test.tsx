import { StrictMode } from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { App } from "../App";
import { MemoryBaseCvAdapter } from "../base/adapter";
import type { IntelligenceClient } from "../base/intelligence";
import type { AuthTransport } from "../auth/AuthShell";
import type { ImportReview } from "@resumora/contracts/intelligence/model";
const source = "11111111-1111-4111-8111-111111111111",
  operation = "22222222-2222-4222-8222-222222222222";
afterEach(() => {
  vi.useRealTimers();
  window.location.hash = "";
});
function fixture(ready = false) {
  const adapter = new MemoryBaseCvAdapter(),
    rows = new Map<string, any>();
  let available = ready;
  const review: ImportReview = {
    id: source,
    sourceHash: "a".repeat(64),
    format: "docx",
    pages: null,
    parserVersion: "synthetic",
    confirmedIds: [],
    admission: { kind: "cv", reason: "Synthetic CV", pages: [] },
    extraction: {
      schemaVersion: "cv-extraction/1",
      warnings: [],
      omittedPages: [],
      candidates: [
        {
          id: "name",
          path: "name",
          value: "Alex Morgan",
          quote: "Alex Morgan",
          page: null,
          confidence: "high",
        },
      ],
    },
  };
  const receipt = () => ({ id: operation, state: "ready" as const, review });
  const intelligence = {
    pendingImport: vi.fn(async () =>
      available &&
      !(await adapter.load())?.draft.importReview?.confirmedIds.length
        ? { id: operation, state: "ready" as const }
        : null,
    ),
    listImports: vi.fn(async () => []),
    importDocument: vi.fn(async () => {
      available = true;
      return receipt();
    }),
    importStatus: vi.fn(async () => receipt()),
    cancelImport: vi.fn(async () => {
      available = false;
    }),
  } as unknown as IntelligenceClient;
  const transport: AuthTransport = vi.fn(async (path, init) => {
    if (path === "/v1/document-languages")
      return Response.json({ source: null, versions: [] });
    if (path === "/v1/jobs" || path === "/v1/workspace-drafts")
      return Response.json([]);
    if (path.startsWith("/v1/workspace-drafts/")) {
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      if (body)
        rows.set(path, {
          id: path.split("/").at(-1),
          kind: path.split("/").at(-2),
          revision: body.expectedRevision + 1,
          value: body.value,
          updatedAt: new Date().toISOString(),
        });
      return Response.json(rows.get(path) ?? null, {
        headers: { "X-Profile-Generation": "0" },
      });
    }
    throw Error("Unexpected synthetic path " + path);
  });
  return { adapter, rows, intelligence, transport };
}
const app = (f: ReturnType<typeof fixture>) => (
  <StrictMode>
    <App {...f} />
  </StrictMode>
);
it("a second browser opens the unconfirmed review from My Profile with account-saved corrections, then confirmation stops recovery", async () => {
  const f = fixture();
  window.location.hash = "#/profile";
  const first = render(app(f));
  const input = await screen.findByLabelText("Document CV");
  fireEvent.change(input, {
    target: { files: [new File(["PK synthetic"], "sample.docx")] },
  });
  await screen.findByRole("heading", { name: "Verifică informațiile din CV" });
  fireEvent.click(screen.getByRole("button", { name: "Editează: Nume" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Nume" }), {
    target: { value: "Alex Corrected" },
  });
  fireEvent.keyDown(screen.getByRole("textbox", { name: "Nume" }), {
    key: "Enter",
  });
  await waitFor(
    () =>
      expect(
        f.rows.get(`/v1/workspace-drafts/import-review/${source}`)?.value.draft
          .name.value,
      ).toBe("Alex Corrected"),
    { timeout: 2500 },
  );
  expect(await f.adapter.load()).toBeNull();
  first.unmount();
  window.location.hash = "#/profile";
  const second = render(app(f));
  await screen.findByRole("heading", { name: "Verifică informațiile din CV" });
  expect(
    screen
      .getByRole("button", { name: "Editează: Nume" })
      .getAttribute("aria-description"),
  ).toBe("Alex Corrected");
  expect(f.intelligence.importDocument).toHaveBeenCalledTimes(1);
  expect(await f.adapter.load()).toBeNull();
  fireEvent.click(
    screen.getByRole("button", { name: "Finalizează verificarea" }),
  );
  await waitFor(
    async () =>
      expect(
        (await f.adapter.load())?.draft.importReview?.confirmedIds,
      ).toContain("name"),
    { timeout: 2500 },
  );
  second.unmount();
  window.location.hash = `#/profile/import/${source}`;
  render(app(f));
  await screen.findByRole("button", { name: "Editează: Nume" });
  expect(window.location.hash).toBe("#/profile");
  expect(
    screen.queryByRole("button", { name: "Finalizează verificarea" }),
  ).toBeNull();
});
it("discarding is durable, so another browser does not reopen the same review", async () => {
  const f = fixture(true);
  window.location.hash = "#/profile";
  const first = render(app(f));
  await screen.findByRole("heading", { name: "Verifică informațiile din CV" });
  fireEvent.click(
    screen.getByText("Detalii import și competențe", { exact: true }),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Renunță la verificare" }),
  );
  await screen.findByLabelText("Document CV");
  expect(f.intelligence.cancelImport).toHaveBeenCalledWith(
    operation,
    expect.any(AbortSignal),
  );
  first.unmount();
  window.location.hash = "#/profile";
  render(app(f));
  await screen.findByLabelText("Document CV");
  expect(window.location.hash).toBe("#/profile");
  expect(
    screen.queryByRole("button", { name: "Finalizează verificarea" }),
  ).toBeNull();
  expect(f.intelligence.importDocument).not.toHaveBeenCalled();
});
it("explicit resource URLs are preserved even when an unfinished review exists", async () => {
  const f = fixture(true);
  window.location.hash = "#/profile/history";
  render(app(f));
  await screen.findByRole("heading", { name: "Profilul meu" });
  expect(window.location.hash).toBe("#/profile/history");
  expect(f.intelligence.pendingImport).not.toHaveBeenCalled();
});
it("account discovery has a bounded wait and never starts an upload", async () => {
  vi.useFakeTimers();
  const f = fixture(true);
  vi.mocked(f.intelligence.pendingImport!).mockImplementation(
    () => new Promise(() => {}),
  );
  window.location.hash = "#/profile";
  render(app(f));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(15000);
  });
  expect(
    screen.queryByText("Verificăm dacă ai un CV în curs de verificare…"),
  ).toBeNull();
  expect(screen.getByLabelText("Document CV")).toBeTruthy();
  expect(f.intelligence.importDocument).not.toHaveBeenCalled();
});
it("late discovery cannot pull the user away from the page they selected", async () => {
  const f = fixture(true);
  let finish!: (value: any) => void;
  vi.mocked(f.intelligence.pendingImport!).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  window.location.hash = "#/profile";
  render(app(f));
  fireEvent.click(screen.getByRole("link", { name: "Joburile mele" }));
  await act(async () => {
    finish({ id: operation, state: "ready" });
  });
  expect(window.location.hash).toBe("#/jobs");
  expect(f.intelligence.importDocument).not.toHaveBeenCalled();
});
