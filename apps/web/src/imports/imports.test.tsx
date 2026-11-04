import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { emptyCv, type CvContent, type ImportResponse } from "@resumora/shared";
import { ApiClientError } from "../lib/api-error.ts";

const cvApi = vi.hoisted(() => ({ getCv: vi.fn(), saveCv: vi.fn(), listHistory: vi.fn(), getHistoryItem: vi.fn(), restoreHistory: vi.fn() }));
vi.mock("../cv/cv-api.ts", () => cvApi);
const importsApi = vi.hoisted(() => ({ startImport: vi.fn(), getImport: vi.fn(), applyImport: vi.fn() }));
vi.mock("./imports-api.ts", () => importsApi);

import { CvPage } from "../cv/CvPage.tsx";

const named = (fullName: string): CvContent => ({ ...emptyCv(), basics: { ...emptyCv().basics, fullName } });
const imported: CvContent = {
  ...named("Ana Popescu"),
  basics: { ...named("Ana Popescu").basics, titles: ["Senior Product Manager"] },
  experience: [
    { id: "e1", company: "Acme SRL", title: "Product Manager", location: "", startDate: "2019", endDate: "2024-03", current: false, description: "Owned onboarding.", bullets: [{ id: "b1", text: "Led the redesign." }] },
  ],
  technicalSkills: [{ id: "s1", name: "SQL" }],
  professionalSkills: [{ id: "s2", name: "Team leadership" }],
  unclearSkills: [{ id: "s3", name: "Management" }],
  custom: [{ id: "c1", title: "Volunteering", details: "Red Cross" }],
};
const imp = (status: ImportResponse["status"], extra: Partial<ImportResponse> = {}): ImportResponse => ({
  id: "imp-1", status, fileName: "cv.pdf", error: null, result: null, createdAt: "2026-11-04T10:00:00Z", ...extra,
});
const ready = imp("ready", { result: { content: imported, warnings: ["Check the dates of Acme SRL."] } });
const pdf = () => new File(["%PDF-1.4 test"], "cv.pdf", { type: "application/pdf" });

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <CvPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

let user: ReturnType<typeof userEvent.setup>;

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  user = userEvent.setup({ applyAccept: false, advanceTimers: vi.advanceTimersByTime });
  cvApi.getCv.mockResolvedValue({ content: named("Current"), version: 3, updatedAt: "2026-11-04T10:00:00Z" });
  cvApi.saveCv.mockResolvedValue({ version: 4, updatedAt: "2026-11-04T10:01:00Z" });
  importsApi.startImport.mockResolvedValue(imp("queued"));
});
afterEach(() => vi.useRealTimers());

async function chooseFile(file: File) {
  await user.upload(await screen.findByLabelText("Choose a CV file"), file);
}
const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

describe("CV import", () => {
  it("rejects a .png before uploading", async () => {
    renderPage();
    await chooseFile(new File(["x"], "photo.png", { type: "image/png" }));
    expect(await screen.findByText("Upload your CV as a PDF or Word (.docx) file.")).toBeInTheDocument();
    expect(importsApi.startImport).not.toHaveBeenCalled();
  });

  it("rejects a file over 5 MB before uploading", async () => {
    renderPage();
    await chooseFile(new File([new Uint8Array(5 * 1024 * 1024 + 1)], "cv.pdf"));
    expect(await screen.findByText("This file is too large. The limit is 5 MB.")).toBeInTheDocument();
    expect(importsApi.startImport).not.toHaveBeenCalled();
  });

  it("shows the server's reason when the upload is refused", async () => {
    importsApi.startImport.mockRejectedValue(new ApiClientError(429, "import_limit", "You can import up to 10 CVs per day."));
    renderPage();
    await chooseFile(pdf());
    expect(await screen.findByText("You can import up to 10 CVs per day.")).toBeInTheDocument();
  });

  it("shows progress then the review", async () => {
    importsApi.getImport.mockResolvedValueOnce(imp("queued")).mockResolvedValueOnce(imp("processing")).mockResolvedValue(ready);
    renderPage();
    await chooseFile(pdf());
    const dialog = await screen.findByRole("dialog", { name: "Import CV" });
    expect(within(dialog).getByText("Reading your CV…")).toBeInTheDocument();

    await advance(2000);
    await advance(2000);
    expect(await within(dialog).findByText("Ana Popescu")).toBeInTheDocument();
    expect(within(dialog).getByText("Senior Product Manager")).toBeInTheDocument();
    expect(within(dialog).getByText("Check the dates of Acme SRL.")).toBeInTheDocument();
    expect(within(dialog).getByText("Led the redesign.")).toBeInTheDocument();
    expect(within(dialog).getByText("Red Cross")).toBeInTheDocument();
    expect(within(dialog).getByText("This replaces your current CV. Your current version stays in History.")).toBeInTheDocument();
    const calls = importsApi.getImport.mock.calls.length;
    await advance(6000);
    expect(importsApi.getImport.mock.calls.length).toBe(calls); // stops checking once ready
  });

  it("shows skills to sort in the review", async () => {
    importsApi.getImport.mockResolvedValue(ready);
    renderPage();
    await chooseFile(pdf());
    const dialog = await screen.findByRole("dialog", { name: "Import CV" });
    expect(await within(dialog).findByRole("heading", { name: "Skills to sort" })).toBeInTheDocument();
    expect(within(dialog).getByText("Management")).toBeInTheDocument();
    expect(within(dialog).getByText("SQL")).toBeInTheDocument();
    expect(within(dialog).getByText("Team leadership")).toBeInTheDocument();
  });

  it("shows the not-a-CV message", async () => {
    importsApi.getImport.mockResolvedValue(
      imp("failed", { error: { code: "not_a_cv", message: "This doesn't look like a CV. Upload your CV as PDF or Word." } }),
    );
    renderPage();
    await chooseFile(pdf());
    const dialog = await screen.findByRole("dialog", { name: "Import CV" });
    expect(await within(dialog).findByText("This doesn't look like a CV. Upload your CV as PDF or Word.")).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Use this CV" })).not.toBeInTheDocument();
  });

  it("applies and replaces the editor content", async () => {
    importsApi.getImport.mockResolvedValue(ready);
    importsApi.applyImport.mockResolvedValue({ version: 4, updatedAt: "2026-11-04T10:05:00Z" });
    renderPage();
    await chooseFile(pdf());
    const dialog = await screen.findByRole("dialog", { name: "Import CV" });
    await user.click(await within(dialog).findByRole("button", { name: "Use this CV" }));

    expect(importsApi.applyImport).toHaveBeenCalledWith("imp-1", 3);
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Import CV" })).not.toBeInTheDocument());
    expect(screen.getByLabelText("Full name")).toHaveValue("Ana Popescu");
    expect(screen.getByLabelText("Title 1")).toHaveValue("Senior Product Manager");
    expect(screen.getByText("Saved")).toBeInTheDocument();
  });

  it("waits for pending saves before applying", async () => {
    let finishSave!: (v: { version: number; updatedAt: string }) => void;
    cvApi.saveCv.mockReturnValue(new Promise((resolve) => (finishSave = resolve)));
    importsApi.getImport.mockResolvedValue(ready);
    importsApi.applyImport.mockResolvedValue({ version: 5, updatedAt: "2026-11-04T10:05:00Z" });
    renderPage();
    await user.type(await screen.findByLabelText("Full name"), "!");
    await chooseFile(pdf());
    const dialog = await screen.findByRole("dialog", { name: "Import CV" });
    const useIt = await within(dialog).findByRole("button", { name: "Use this CV" });
    expect(useIt).toBeDisabled();
    expect(within(dialog).getByText("Saving your changes first…")).toBeInTheDocument();

    await advance(1000); // autosave starts
    await act(async () => finishSave({ version: 4, updatedAt: "2026-11-04T10:01:00Z" }));
    await waitFor(() => expect(useIt).toBeEnabled());
    await user.click(useIt);
    expect(importsApi.applyImport).toHaveBeenCalledWith("imp-1", 4);
  });

  it("conflict on apply shows the conflict banner", async () => {
    importsApi.getImport.mockResolvedValue(ready);
    importsApi.applyImport.mockRejectedValue(
      new ApiClientError(409, "version_conflict", "Saved elsewhere", { current: { version: 9, updatedAt: "2026-11-04T10:09:00Z" } }),
    );
    renderPage();
    await chooseFile(pdf());
    await user.click(await within(await screen.findByRole("dialog", { name: "Import CV" })).findByRole("button", { name: "Use this CV" }));
    expect(await screen.findByText("This CV was saved in another tab or device.")).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Import CV" })).not.toBeInTheDocument();
  });

  it("keeps waiting for a slow import, then stops after 20 minutes", async () => {
    importsApi.getImport.mockResolvedValue(imp("processing"));
    renderPage();
    await chooseFile(pdf());
    const dialog = await screen.findByRole("dialog", { name: "Import CV" });
    await advance(5 * 60_000);
    expect(within(dialog).getByText("Reading your CV…")).toBeInTheDocument();
    await advance(15 * 60_000);
    expect(await within(dialog).findByText("This is taking longer than expected. Try again.")).toBeInTheDocument();
    const calls = importsApi.getImport.mock.calls.length;
    await advance(10_000);
    expect(importsApi.getImport.mock.calls.length).toBe(calls);
  });

  it("cancel closes without changing the CV", async () => {
    importsApi.getImport.mockResolvedValue(ready);
    renderPage();
    await chooseFile(pdf());
    const dialog = await screen.findByRole("dialog", { name: "Import CV" });
    await within(dialog).findByText("Ana Popescu");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog", { name: "Import CV" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Full name")).toHaveValue("Current");
    expect(importsApi.applyImport).not.toHaveBeenCalled();
  });
});
