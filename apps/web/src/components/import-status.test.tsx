import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ImportDocument } from "./ImportDocument";
import { LanguageContext } from "./ui";
import type { IntelligenceClient, ImportStatus } from "../base/intelligence";
function setup(locale: "ro" | "en", result: ImportStatus | Error) {
  const start = vi.fn();
  const client = {
    listImports: vi.fn(async () => []),
    importDocument: vi.fn(async () => {
      if (result instanceof Error) throw result;
      return result;
    }),
    importStatus: vi.fn(
      async () => ({ id: "existing", state: "cancelled" }) as ImportStatus,
    ),
    cancelImport: vi.fn(async () => {}),
  } as unknown as IntelligenceClient;
  render(
    <LanguageContext value={locale}>
      <ImportDocument client={client} revision={3} start={start} />
    </LanguageContext>,
  );
  const file = new File(["%PDF-1.4\n%%EOF"], "sample.pdf", {
    type: "application/pdf",
  });
  const input = screen.getByLabelText(
    locale === "en" ? "CV document" : "Document CV",
  ) as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
  fireEvent.click(
    screen.getByRole("button", {
      name: locale === "en" ? "Upload and analyse" : "Încarcă și analizează",
    }),
  );
  return { client, start, file, input };
}
it.each(["ro", "en"] as const)(
  "keeps unknown request/file and checks the same operation without a duplicate upload (%s)",
  async (locale) => {
    const { client, input } = setup(locale, {
      id: "existing",
      state: "unknown",
      error: "PROCESSING_OUTCOME_UNKNOWN",
    });
    await waitFor(() => expect(input.disabled).toBe(true));
    expect(screen.getByRole("status").textContent).not.toContain(
      "PROCESSING_OUTCOME_UNKNOWN",
    );
    expect(screen.getByRole("status").textContent).toContain(
      locale === "en" ? "start over" : "de la capăt",
    );
    const calls = vi.mocked(client.importDocument).mock.calls;
    expect(calls).toHaveLength(1);
    const id = calls[0][1];
    fireEvent.click(
      screen.getByRole("button", {
        name: locale === "en" ? "Check operation" : "Verifică operațiunea",
      }),
    );
    await waitFor(() =>
      expect(client.importStatus).toHaveBeenCalledWith(
        id,
        expect.any(AbortSignal),
      ),
    );
    expect(client.importDocument).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(input.disabled).toBe(false));
  },
);
it("keeps a lost HTTP outcome unresolved and never automatically uploads or invokes AI again", async () => {
  const { client, input } = setup("en", new TypeError("Network unavailable"));
  await screen.findByText(/We could not complete your CV import/);
  expect(input.disabled).toBe(true);
  expect(client.importDocument).toHaveBeenCalledTimes(1);
  expect(
    screen.getByRole("button", { name: "Upload CV again" }),
  ).toHaveProperty("disabled", false);
  expect(client.importDocument).toHaveBeenCalledTimes(1);
});
it("offers an explicit restart after an unconfirmed upload without sending another request", async () => {
  const { client } = setup("en", {
    id: "existing",
    state: "unknown",
    error: "STORAGE_OUTCOME_UNKNOWN",
  });
  expect(
    await screen.findByText(/We could not complete your CV import/),
  ).toBeTruthy();
  expect(screen.getByRole("button", { name: "Upload CV again" })).toBeTruthy();
  expect(client.importDocument).toHaveBeenCalledTimes(1);
});
it("makes definite storage refusal distinct and permits selecting a new document only after the result is known", async () => {
  const { input } = setup("en", {
    id: "existing",
    state: "failed",
    error: "STORAGE_UPLOAD_REJECTED",
  });
  await screen.findByText(/The file could not be saved/);
  expect(input.disabled).toBe(false);
  expect(screen.getByRole("status").textContent).not.toContain(
    "STORAGE_UPLOAD_REJECTED",
  );
});
it("shows a clear unsupported-file explanation and retains manual entry as an option", async () => {
  setup("en", { id: "existing", state: "failed", error: "DOCUMENT_ENCRYPTED" });
  expect(
    (await screen.findByText(/This document cannot be processed safely/))
      .textContent,
  ).toContain("cannot be processed safely");
});
it("opens a successful reviewed import exactly once", async () => {
  const review = {
    id: crypto.randomUUID(),
    format: "pdf" as const,
    sourceHash: "a".repeat(64),
    parserVersion: "synthetic",
    pages: 1,
    admission: { kind: "cv" as const, reason: "Synthetic CV", pages: [1] },
    confirmedIds: [],
    extraction: {
      schemaVersion: "cv-extraction/1" as const,
      warnings: [],
      omittedPages: [],
      candidates: [
        {
          id: "name",
          path: "name",
          value: "Synthetic candidate",
          quote: "Synthetic candidate",
          page: 1,
          confidence: "high" as const,
        },
      ],
    },
  };
  const { start } = setup("en", { id: "existing", state: "ready", review });
  const confirm = await screen.findByRole("button", {
    name: "Finish review",
  });
  expect(start).not.toHaveBeenCalled();
  fireEvent.click(confirm);
  await waitFor(() => expect(start).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole("button", { name: "Finish review" }));
  expect(start).toHaveBeenCalledTimes(1);
});

it("does not unlock a duplicate upload when cancellation has an unknown outcome", async () => {
  const { client, input } = setup("en", {
    id: "existing",
    state: "unknown",
    error: "PROCESSING_OUTCOME_UNKNOWN",
  });
  await screen.findByText(/We could not complete your CV import/);
  vi.mocked(client.cancelImport).mockRejectedValueOnce(
    new TypeError("Synthetic lost cancellation response"),
  );
  fireEvent.click(screen.getByRole("button", { name: "Upload CV again" }));
  await screen.findByRole("alert");
  expect(input.disabled).toBe(true);
  expect(client.importDocument).toHaveBeenCalledTimes(1);
  const originalId = vi.mocked(client.importDocument).mock.calls[0][1];
  fireEvent.click(screen.getByRole("button", { name: "Check operation" }));
  await waitFor(() =>
    expect(client.importStatus).toHaveBeenCalledWith(
      originalId,
      expect.any(AbortSignal),
    ),
  );
  expect(client.importDocument).toHaveBeenCalledTimes(1);
});
