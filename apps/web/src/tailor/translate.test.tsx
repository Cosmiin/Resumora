import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";

const tailoredApi = vi.hoisted(() => ({ listTailored: vi.fn(), translate: vi.fn() }));
vi.mock("./tailored-api.ts", () => tailoredApi);

import { LanguageMenu } from "./TailorToolbar.tsx";

function Where() {
  const location = useLocation();
  return <p>At {location.pathname}{location.search}</p>;
}

function renderMenu() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/jobs/job-1/cv"]}>
        <Routes>
          <Route path="/jobs/:id/cv" element={<><LanguageMenu jobId="job-1" current={{ id: "tc-en", language: "en" }} /><Where /></>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  tailoredApi.listTailored.mockResolvedValue([
    { id: "tc-en", language: "en", translatedFrom: null, updatedAt: "2026-11-08T09:00:00Z" },
    { id: "tc-fr", language: "fr", translatedFrom: "tc-en", updatedAt: "2026-11-08T09:30:00Z" },
  ]);
  tailoredApi.translate.mockResolvedValue({ tailoredCvId: "tc-de", flagged: 0 });
});

const open = async () => {
  await userEvent.click(screen.getByRole("button", { name: "Language ▾" }));
  return screen.findByRole("list", { name: "Languages" });
};

describe("Language menu", () => {
  it("lists existing copies to open and missing languages to translate", async () => {
    renderMenu();
    const list = await open();
    const french = within(list).getByText("French").closest("li")!;
    expect(within(french).getByRole("button", { name: "Open" })).toBeInTheDocument();
    expect(within(french).getByRole("button", { name: "Translate again" })).toBeInTheDocument();
    expect(within(list).queryByText("English")).not.toBeInTheDocument();
    const german = within(list).getByText("German").closest("li")!;
    expect(within(german).queryByRole("button", { name: "Open" })).not.toBeInTheDocument();
    await userEvent.click(within(german).getByRole("button", { name: "Translate" }));
    expect(tailoredApi.translate).toHaveBeenCalledWith("tc-en", "de");
    expect(await screen.findByText("At /jobs/job-1/cv?cv=tc-de")).toBeInTheDocument();
  });

  it("opens an existing copy", async () => {
    renderMenu();
    const list = await open();
    await userEvent.click(within(within(list).getByText("French").closest("li")!).getByRole("button", { name: "Open" }));
    expect(screen.getByText("At /jobs/job-1/cv?cv=tc-fr")).toBeInTheDocument();
    expect(tailoredApi.translate).not.toHaveBeenCalled();
  });

  it("asks before Translate again, because it replaces the copy's edits", async () => {
    renderMenu();
    const list = await open();
    const french = within(list).getByText("French").closest("li")!;
    await userEvent.click(within(french).getByRole("button", { name: "Translate again" }));
    expect(tailoredApi.translate).not.toHaveBeenCalled();
    expect(within(french).getByText("This replaces your edits in the French copy.")).toBeInTheDocument();
    await userEvent.click(within(french).getByRole("button", { name: "Replace it" }));
    expect(tailoredApi.translate).toHaveBeenCalledWith("tc-en", "fr");
  });

  it("shows an error and stays put when translating fails", async () => {
    tailoredApi.translate.mockRejectedValue(new Error("502"));
    renderMenu();
    const list = await open();
    await userEvent.click(within(within(list).getByText("Spanish").closest("li")!).getByRole("button", { name: "Translate" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't translate. Try again");
    expect(screen.getByText("At /jobs/job-1/cv")).toBeInTheDocument();
  });
});
