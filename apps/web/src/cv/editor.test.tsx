import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { MAX_ITEMS, emptyCv } from "@resumora/shared";
import { ApiClientError } from "../lib/api-error.ts";

const api = vi.hoisted(() => ({ getCv: vi.fn(), saveCv: vi.fn() }));
vi.mock("./cv-api.ts", () => api);
const authState = vi.hoisted(() => ({ userId: "user-a" }));
vi.mock("../auth/AuthProvider.tsx", () => ({
  useAuth: () => ({ loading: false, session: { user: { id: authState.userId } } }),
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

async function addSection(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(await screen.findByRole("button", { name: "+ Add a section" }));
  await user.click(screen.getByRole("button", { name }));
}

beforeEach(() => {
  vi.resetAllMocks();
  authState.userId = "user-a";
  api.getCv.mockResolvedValue({ content: emptyCv(), version: 0, updatedAt: "2026-11-04T10:00:00Z" });
  api.saveCv.mockResolvedValue({ version: 1, updatedAt: "2026-11-04T10:01:00Z" });
});

describe("CV editor", () => {
  it("adds an experience and a bullet", async () => {
    const user = userEvent.setup();
    renderPage();
    await addSection(user, "Experience");
    await user.type(screen.getByLabelText("Company"), "Acme");
    await user.click(screen.getByRole("button", { name: "Add bullet" }));
    await user.type(screen.getByLabelText("Bullet 1"), "Led a team of 5");

    await waitFor(() => expect(screen.getByText("Saved")).toBeInTheDocument(), { timeout: 3000 });
    const [content] = api.saveCv.mock.lastCall!;
    expect(content.experience).toHaveLength(1);
    expect(content.experience[0]).toMatchObject({ company: "Acme" });
    expect(content.experience[0].bullets).toEqual([{ id: expect.any(String), text: "Led a team of 5" }]);
  });

  it("shows conflict banner", async () => {
    const user = userEvent.setup();
    api.saveCv.mockRejectedValue(
      new ApiClientError(409, "version_conflict", "Saved elsewhere", {
        current: { version: 4, updatedAt: "2026-11-04T10:05:00Z" },
      }),
    );
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Add your name" }));
    await user.type(screen.getByLabelText("Full name"), "Mine");
    expect(
      await screen.findByText("This CV was saved in another tab or device.", {}, { timeout: 3000 }),
    ).toBeInTheDocument();

    api.getCv.mockResolvedValue({
      content: { ...emptyCv(), basics: { ...emptyCv().basics, fullName: "Server" } },
      version: 4,
      updatedAt: "2026-11-04T10:05:00Z",
    });
    await user.click(screen.getByRole("button", { name: "Load latest" }));
    await waitFor(() => expect(screen.getByLabelText("Full name")).toHaveValue("Server"));
    expect(screen.queryByText("This CV was saved in another tab or device.")).not.toBeInTheDocument();
  });

  it("a new sign-in loads that user's CV, not a cached one", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const page = () => (
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <CvPage />
        </MemoryRouter>
      </QueryClientProvider>
    );
    const cvOf = (fullName: string) => ({
      content: { ...emptyCv(), basics: { ...emptyCv().basics, fullName } },
      version: 1,
      updatedAt: "2026-11-04T10:00:00Z",
    });

    api.getCv.mockResolvedValue(cvOf("User A"));
    const first = render(page());
    expect(await screen.findByText("User A")).toBeInTheDocument();
    first.unmount(); // sign-out navigates away from the editor
    authState.userId = "user-b";

    api.getCv.mockResolvedValue(cvOf("User B"));
    render(page());
    expect(await screen.findByText("User B")).toBeInTheDocument();
    expect(screen.queryByText("User A")).not.toBeInTheDocument();
  });

  it("stops adding at the CV limits", async () => {
    const user = userEvent.setup();
    const bullets = Array.from({ length: 20 }, (_, i) => ({ id: `b${i}`, text: "x" }));
    const role = (i: number) => ({ id: `e${i}`, company: `Acme ${i}`, title: "", location: "", startDate: "", endDate: "", current: false, description: "", bullets: i === 0 ? bullets : [] });
    api.getCv.mockResolvedValue({
      content: { ...emptyCv(), experience: Array.from({ length: MAX_ITEMS }, (_, i) => role(i)) },
      version: 1,
      updatedAt: "2026-11-04T10:00:00Z",
    });
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Edit Acme 0" }));
    expect(screen.getByRole("button", { name: "Add bullet" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add another" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Add a short summary" }));
    expect(screen.getByLabelText("Summary")).toHaveAttribute("maxLength", "4000");
    await user.click(screen.getByRole("button", { name: "Add your name" }));
    expect(screen.getByLabelText("Full name")).toHaveAttribute("maxLength", "2000");
  });

  it("shows a retry option when the CV cannot load", async () => {
    api.getCv.mockRejectedValueOnce(new ApiClientError(0, "network", "offline"));
    renderPage();
    const retry = await screen.findByRole("button", { name: "Try again" });
    await userEvent.click(retry);
    expect(await screen.findByRole("button", { name: "Add your name" })).toBeInTheDocument();
  });
});

describe("CV format v2 in the editor", () => {
  const withCv = (overrides: Partial<ReturnType<typeof emptyCv>>) =>
    api.getCv.mockResolvedValue({ content: { ...emptyCv(), ...overrides }, version: 1, updatedAt: "2026-11-04T10:00:00Z" });

  it("edits two titles", async () => {
    const user = userEvent.setup();
    withCv({ basics: { ...emptyCv().basics, fullName: "Ana" } });
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Edit your details" }));
    expect(screen.getByLabelText("Title 1")).toBeInTheDocument();
    expect(screen.getByLabelText("Title 2")).toBeInTheDocument();
    expect(screen.queryByLabelText("Title 3")).not.toBeInTheDocument();
  });

  it("sorts an unclear skill", async () => {
    const user = userEvent.setup();
    withCv({ unclearSkills: [{ id: "s1", name: "Management" }] });
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Edit skills" }));
    expect(screen.getByRole("heading", { name: "Skills to sort" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Move Management to technical" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Move Management to professional" }));

    await waitFor(() => expect(api.saveCv).toHaveBeenCalled(), { timeout: 3000 });
    const [content] = api.saveCv.mock.lastCall!;
    expect(content.professionalSkills).toEqual([{ id: "s1", name: "Management" }]);
    expect(content.unclearSkills).toEqual([]);
    expect(screen.queryByRole("heading", { name: "Skills to sort" })).not.toBeInTheDocument();
  });

  it("unclear group is hidden when empty", async () => {
    const user = userEvent.setup();
    renderPage();
    await addSection(user, "Skills");
    expect(screen.getByRole("heading", { name: "Technical skills" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Professional skills" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Skills to sort" })).not.toBeInTheDocument();
  });

  it("adds a custom section", async () => {
    const user = userEvent.setup();
    renderPage();
    await addSection(user, "Other section");
    await user.type(screen.getByLabelText("Section title"), "Volunteering");
    await user.type(screen.getByLabelText("Details"), "Red Cross");
    await waitFor(() => expect(api.saveCv).toHaveBeenCalled(), { timeout: 3000 });
    const [content] = api.saveCv.mock.lastCall!;
    expect(content.custom).toEqual([{ id: expect.any(String), title: "Volunteering", details: "Red Cross" }]);
  });

  it("date fields accept a year", async () => {
    const user = userEvent.setup();
    renderPage();
    await addSection(user, "Experience");
    const start = screen.getByLabelText("Start");
    expect(start).toHaveAttribute("placeholder", "YYYY-MM");
    await user.type(start, "2019");
    await waitFor(() => expect(screen.getByText("Saved")).toBeInTheDocument(), { timeout: 3000 });
    expect(api.saveCv.mock.lastCall![0].experience[0].startDate).toBe("2019");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
