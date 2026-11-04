import { cvImportLimits } from "@resumora/contracts/intelligence/import-limits";
import { StrictMode } from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ImportDocument } from "./ImportDocument";
import { LanguageContext } from "./ui";
import {
  IntelligenceRequestError,
  type IntelligenceClient,
} from "../base/intelligence";
const id = "11111111-1111-4111-8111-111111111111";
afterEach(() => vi.useRealTimers());
function surface(
  client: IntelligenceClient,
  openImportId: string | undefined = id,
  opened = vi.fn(),
) {
  return (
    <StrictMode>
      <LanguageContext value="en">
        <ImportDocument
          client={client}
          revision={0}
          start={vi.fn()}
          instantUpload
          openImportId={openImportId}
          onOpenImport={opened}
        />
      </LanguageContext>
    </StrictMode>
  );
}
function clientWith(read: unknown) {
  return {
    listImports: vi.fn(async () => []),
    importStatus: vi.fn(read as () => Promise<never>),
    importDocument: vi.fn(async (_file, operation) => ({
      id: operation,
      state: "uploaded",
      stage: "queued",
    })),
    cancelImport: vi.fn(async () => {}),
  } as unknown as IntelligenceClient;
}
it("reopens an import under real Strict Mode instead of ignoring the only response forever", async () => {
  const client = clientWith(async () => ({
    id,
    state: "processing",
    stage: "extracting",
  }));
  render(surface(client));
  expect(
    await screen.findByText("Reading your experience, education and skills…"),
  ).toBeTruthy();
  expect(screen.queryByText("Opening saved import…")).toBeNull();
  expect(client.importStatus).toHaveBeenCalledTimes(2);
  expect(vi.mocked(client.importStatus).mock.calls[0][1]?.aborted).toBe(true);
  expect(client.importDocument).not.toHaveBeenCalled();
});
it("times out a hanging refresh read, then fences the old attempt before allowing a new file", async () => {
  vi.useFakeTimers();
  const opened = vi.fn(),
    client = clientWith(() => new Promise(() => {}));
  render(surface(client, id, opened));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(15000);
  });
  expect(screen.queryByText("Opening saved import…")).toBeNull();
  const retry = screen.getByRole("button", { name: "Upload CV again" });
  expect(retry).toHaveProperty("disabled", false);
  fireEvent.click(retry);
  await act(async () => {});
  expect(client.cancelImport).toHaveBeenCalledWith(id, expect.any(AbortSignal));
  expect(opened).toHaveBeenCalledWith("");
  const input = screen.getByLabelText("CV document");
  expect(input).toHaveProperty("disabled", false);
  expect(client.importDocument).not.toHaveBeenCalled();
  fireEvent.change(input, {
    target: {
      files: [new File(["%PDF-1.7"], "fresh.pdf", { type: "application/pdf" })],
    },
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  expect(client.importDocument).toHaveBeenCalledTimes(1);
  expect(vi.mocked(client.importDocument).mock.calls[0][1]).not.toBe(id);
});
it("a missing saved import can be restarted without waiting for cancellation of a nonexistent record", async () => {
  const client = clientWith(async () => {
    throw new IntelligenceRequestError("SNAPSHOT_NOT_FOUND");
  });
  render(surface(client));
  expect(
    await screen.findByText(/This import is no longer available/),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Upload CV again" }));
  await waitFor(() =>
    expect(screen.getByLabelText("CV document")).toHaveProperty(
      "disabled",
      false,
    ),
  );
  expect(client.cancelImport).not.toHaveBeenCalled();
});
it("a lost cancellation response cannot start another paid request and cannot trap the screen in loading", async () => {
  vi.useFakeTimers();
  const client = clientWith(async () => ({
    id,
    state: "unknown",
    error: "AI_TIMEOUT_UNKNOWN",
  }));
  vi.mocked(client.cancelImport).mockImplementation(
    () => new Promise(() => {}),
  );
  render(surface(client));
  await act(async () => {});
  fireEvent.click(screen.getByRole("button", { name: "Upload CV again" }));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(15000);
  });
  expect(screen.getByRole("alert").textContent).toContain(
    "Check your connection",
  );
  expect(
    screen.getByRole("button", { name: "Upload CV again" }),
  ).toHaveProperty("disabled", false);
  expect(client.importDocument).not.toHaveBeenCalled();
});
it("a processing status that never changes has a bounded wait and explicit restart", async () => {
  vi.useFakeTimers();
  const client = clientWith(async () => ({
    id,
    state: "processing",
    stage: "extracting",
  }));
  render(surface(client));
  await act(async () => {});
  await act(async () => {
    await vi.advanceTimersByTimeAsync(120000);
  });
  expect(
    screen.getByText("Reading your experience, education and skills…"),
  ).toBeTruthy();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(cvImportLimits.interfaceWaitMs - 120000);
  });
  expect(
    screen.getByText(/We could not finish reading your CV in time/),
  ).toBeTruthy();
  expect(
    screen.queryByText("Reading your experience, education and skills…"),
  ).toBeNull();
  expect(screen.getByRole("button", { name: "Upload CV again" })).toBeTruthy();
  expect(client.importDocument).not.toHaveBeenCalled();
});

it("ignores a retired client's late ready response after switching accounts", async () => {
  let resolve!: (value: unknown) => void;
  const old = clientWith(
    () =>
      new Promise((yes) => {
        resolve = yes;
      }),
  );
  const next = clientWith(async () => ({ id, state: "cancelled" }));
  const view = render(surface(old));
  view.rerender(surface(next));
  await screen.findByText(/Import cancelled/);
  await act(async () => {
    resolve({ id, state: "processing", stage: "extracting" });
  });
  expect(
    screen.queryByText("Reading your experience, education and skills…"),
  ).toBeNull();
  expect(next.importDocument).not.toHaveBeenCalled();
});

it("rejects malformed ready reviews instead of rendering or publishing them", async () => {
  const client = clientWith(async () => ({
    id,
    state: "ready",
    review: { id },
  }));
  render(surface(client));
  expect(
    await screen.findByText(/We could not complete your CV import/),
  ).toBeTruthy();
  expect(client.importDocument).not.toHaveBeenCalled();
});
