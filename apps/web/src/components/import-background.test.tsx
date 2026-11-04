import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ImportDocument } from "./ImportDocument";
import { LanguageContext } from "./ui";
import {
  IntelligenceRequestError,
  type IntelligenceClient,
  type ImportStatus,
} from "../base/intelligence";
const id = "11111111-1111-4111-8111-111111111111";
afterEach(() => vi.useRealTimers());
function surface(
  client: IntelligenceClient,
  openImportId?: string,
  onOpenImport = vi.fn(),
) {
  return (
    <LanguageContext value="en">
      <ImportDocument
        client={client}
        revision={0}
        start={vi.fn()}
        instantUpload
        openImportId={openImportId}
        onOpenImport={onOpenImport}
      />
    </LanguageContext>
  );
}
it("acknowledges upload, polls real stages, and reopens the same operation without another upload", async () => {
  vi.useFakeTimers();
  let result: ImportStatus = { id, state: "uploaded", stage: "queued" };
  const client = {
    listImports: vi.fn(async () => []),
    importDocument: vi.fn(
      async (_file, operationId) => (result = { ...result, id: operationId }),
    ),
    importStatus: vi.fn(async () => result),
    cancelImport: vi.fn(async () => {}),
  } as unknown as IntelligenceClient;
  const opened = vi.fn(),
    view = render(surface(client, undefined, opened));
  fireEvent.change(screen.getByLabelText("CV document"), {
    target: {
      files: [
        new File(["%PDF-1.7"], "synthetic.pdf", { type: "application/pdf" }),
      ],
    },
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  expect(
    screen.getByText("Your CV is uploaded. Getting ready to read it…"),
  ).toBeTruthy();
  expect(opened).toHaveBeenCalledWith(result.id);
  const operationId = result.id;
  result = { id: operationId, state: "processing", stage: "extracting" };
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1500);
  });
  expect(
    screen.getByText("Reading your experience, education and skills…"),
  ).toBeTruthy();
  expect(screen.getByText(/can take a few minutes/)).toBeTruthy();
  view.unmount();
  render(surface(client, operationId));
  await act(async () => {});
  expect(
    screen.getByText("Reading your experience, education and skills…"),
  ).toBeTruthy();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(31000);
  });
  expect(screen.getByText(/still reading your CV carefully/)).toBeTruthy();
  expect(client.importDocument).toHaveBeenCalledTimes(1);
  expect(
    vi
      .mocked(client.importStatus)
      .mock.calls.every((call) => call[0] === operationId),
  ).toBe(true);
});
it("stops after a failed progress read and offers a fresh upload", async () => {
  vi.useFakeTimers();
  const client = {
    listImports: vi.fn(async () => []),
    importStatus: vi
      .fn()
      .mockResolvedValueOnce({ id, state: "processing", stage: "checking" })
      .mockRejectedValue(new IntelligenceRequestError("UNAVAILABLE")),
    importDocument: vi.fn(),
  } as unknown as IntelligenceClient;
  render(surface(client, id));
  await act(async () => {});
  expect(screen.getByText("Checking your document…")).toBeTruthy();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1500);
  });
  expect(screen.getByText(/We could not complete your CV import/)).toBeTruthy();
  expect(screen.getByRole("button", { name: "Upload CV again" })).toBeTruthy();
  const reads = vi.mocked(client.importStatus).mock.calls.length;
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10000);
  });
  expect(client.importStatus).toHaveBeenCalledTimes(reads);
  expect(client.importDocument).not.toHaveBeenCalled();
});
it("explains a timeout while retaining the operation and never resubmits paid work", async () => {
  const client = {
    listImports: vi.fn(async () => []),
    importStatus: vi.fn(async () => ({
      id,
      state: "unknown",
      error: "AI_TIMEOUT_UNKNOWN",
    })),
    importDocument: vi.fn(),
  } as unknown as IntelligenceClient;
  render(surface(client, id));
  expect(
    await screen.findByText(/We could not finish reading your CV in time/),
  ).toBeTruthy();
  expect(client.importDocument).not.toHaveBeenCalled();
  expect(screen.getByLabelText("CV document")).toHaveProperty("disabled", true);
});
