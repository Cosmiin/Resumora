import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { emptyCv } from "@resumora/shared";
import { ApiClientError } from "../lib/api-error.ts";
import { sampleCv } from "../test/sample-cv.ts";

const api = vi.hoisted(() => ({ getCv: vi.fn(), saveCv: vi.fn() }));
vi.mock("./cv-api.ts", () => api);
vi.mock("../auth/AuthProvider.tsx", () => ({
  useAuth: () => ({ loading: false, session: { user: { id: "user-a" } } }),
}));

import { CvPage } from "./CvPage.tsx";

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

const page = () => screen.getByRole("article", { name: "CV page" });
const panel = (name: RegExp) => screen.getByRole("complementary", { name });

beforeEach(() => {
  vi.resetAllMocks();
  api.getCv.mockResolvedValue({ content: sampleCv(), version: 1, updatedAt: "2026-11-04T10:00:00Z" });
  api.saveCv.mockResolvedValue({ version: 2, updatedAt: "2026-11-04T10:01:00Z" });
});

describe("side panel", () => {
  it("clicking a role opens its fields and edits update the page", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Edit Senior Product Manager" }));
    const title = within(panel(/experience/i)).getByLabelText("Job title");
    expect(title).toHaveValue("Senior Product Manager");
    await user.type(title, " II");
    expect(within(page()).getByRole("button", { name: "Edit Senior Product Manager II" })).toBeInTheDocument();
    await waitFor(() => expect(api.saveCv).toHaveBeenCalled(), { timeout: 3000 });
    expect(api.saveCv.mock.lastCall![0].experience[0].title).toBe("Senior Product Manager II");
  });

  it("Escape closes the panel and returns focus", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Edit Senior Product Manager" }));
    expect(within(panel(/experience/i)).getByLabelText("Company")).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit Senior Product Manager" })).toHaveFocus();
  });

  it("Next moves to the following role", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Edit Senior Product Manager" }));
    expect(panel(/experience/i)).toHaveTextContent("role 1 of 3");
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByLabelText("Job title")).toHaveValue("Product Analyst");
    expect(panel(/experience/i)).toHaveTextContent("role 2 of 3");
  });

  it("removing the only education closes the panel", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Edit Babes-Bolyai University" }));
    await user.click(within(panel(/education/i)).getByRole("button", { name: "Remove" }));
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
    expect(within(page()).queryByText("Babes-Bolyai University")).not.toBeInTheDocument();
  });

  it("panel closes when the selected role disappears", async () => {
    const user = userEvent.setup();
    api.saveCv.mockRejectedValue(
      new ApiClientError(409, "version_conflict", "Saved elsewhere", {
        current: { version: 4, updatedAt: "2026-11-04T10:05:00Z" },
      }),
    );
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Edit Senior Product Manager" }));
    await user.type(screen.getByLabelText("Company"), "!");
    expect(
      await screen.findByText("This CV was saved in another tab or device.", {}, { timeout: 3000 }),
    ).toBeInTheDocument();
    expect(panel(/experience/i)).toBeInTheDocument();

    const latest = sampleCv();
    api.getCv.mockResolvedValue({
      content: { ...latest, experience: latest.experience.slice(1) },
      version: 4,
      updatedAt: "2026-11-04T10:05:00Z",
    });
    await user.click(screen.getByRole("button", { name: "Load latest" }));
    await waitFor(() => expect(screen.queryByRole("complementary")).not.toBeInTheDocument());
    expect(within(page()).queryByText("Senior Product Manager")).not.toBeInTheDocument();
  });

  it("an empty CV starts from Add your name", async () => {
    const user = userEvent.setup();
    api.getCv.mockResolvedValue({ content: emptyCv(), version: 0, updatedAt: "2026-11-04T10:00:00Z" });
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Add your name" }));
    await user.type(screen.getByLabelText("Full name"), "Ana");
    expect(within(page()).getByText("Ana")).toBeInTheDocument();
  });

  it("Add a section adds a role and opens it", async () => {
    const user = userEvent.setup();
    api.getCv.mockResolvedValue({ content: emptyCv(), version: 0, updatedAt: "2026-11-04T10:00:00Z" });
    renderPage();
    await user.click(await screen.findByRole("button", { name: "+ Add a section" }));
    await user.click(screen.getByRole("button", { name: "Experience" }));
    expect(within(panel(/experience/i)).getByLabelText("Job title")).toHaveValue("");
  });

  it("shows the conflict banner inside the open panel", async () => {
    const user = userEvent.setup();
    api.saveCv.mockRejectedValue(
      new ApiClientError(409, "version_conflict", "Saved elsewhere", {
        current: { version: 4, updatedAt: "2026-11-04T10:05:00Z" },
      }),
    );
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Edit Senior Product Manager" }));
    await user.type(screen.getByLabelText("Company"), "!");
    const open = panel(/experience/i);
    expect(
      await within(open).findByText("This CV was saved in another tab or device.", {}, { timeout: 3000 }),
    ).toBeInTheDocument();
    expect(within(open).getByRole("button", { name: "Load latest" })).toBeInTheDocument();
    expect(within(open).getByRole("button", { name: "Keep my version" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Load latest" })).toHaveLength(1);
  });

  it("shows why the CV can't be saved inside the open panel", async () => {
    const user = userEvent.setup();
    api.saveCv.mockRejectedValue(new ApiClientError(400, "invalid_cv", "a field is too long."));
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Edit Senior Product Manager" }));
    await user.type(screen.getByLabelText("Company"), "!");
    expect(
      await within(panel(/experience/i)).findByText(/can't be saved yet — a field is too long/, {}, { timeout: 3000 }),
    ).toBeInTheDocument();
  });

  it("Move up keeps focus on a move button", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Edit Product Analyst" }));
    expect(panel(/experience/i)).toHaveTextContent("role 2 of 3");
    await user.click(screen.getByRole("button", { name: "Move up" }));
    expect(panel(/experience/i)).toHaveTextContent("role 1 of 3");
    expect(screen.getByRole("button", { name: "Move up" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move down" })).toHaveFocus();
  });

  it("a new blank role has a name on the page and reopens", async () => {
    const user = userEvent.setup();
    api.getCv.mockResolvedValue({ content: emptyCv(), version: 0, updatedAt: "2026-11-04T10:00:00Z" });
    renderPage();
    await user.click(await screen.findByRole("button", { name: "+ Add a section" }));
    await user.click(screen.getByRole("button", { name: "Experience" }));
    await user.keyboard("{Escape}");
    const block = within(page()).getByRole("button", { name: "Edit New entry" });
    expect(block).toHaveTextContent("New entry");
    await user.click(block);
    expect(within(panel(/experience/i)).getByLabelText("Job title")).toHaveValue("");
  });
});
