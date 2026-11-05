import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { emptyCv } from "@resumora/shared";
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
      <CvPage />
    </QueryClientProvider>,
  );
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
    await user.click(await screen.findByRole("button", { name: "Add experience" }));
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
    await user.type(await screen.findByLabelText("Full name"), "Mine");
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
        <CvPage />
      </QueryClientProvider>
    );
    const cvOf = (fullName: string) => ({
      content: { ...emptyCv(), basics: { ...emptyCv().basics, fullName } },
      version: 1,
      updatedAt: "2026-11-04T10:00:00Z",
    });

    api.getCv.mockResolvedValue(cvOf("User A"));
    const first = render(page());
    expect(await screen.findByDisplayValue("User A")).toBeInTheDocument();
    first.unmount(); // sign-out navigates away from the editor
    authState.userId = "user-b";

    api.getCv.mockResolvedValue(cvOf("User B"));
    render(page());
    expect(await screen.findByDisplayValue("User B")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("User A")).not.toBeInTheDocument();
  });

  it("stops adding at the CV limits", async () => {
    const bullets = Array.from({ length: 20 }, (_, i) => ({ id: `b${i}`, text: "x" }));
    api.getCv.mockResolvedValue({
      content: {
        ...emptyCv(),
        experience: [{ id: "e1", company: "Acme", title: "", location: "", startDate: "", endDate: "", current: false, bullets }],
      },
      version: 1,
      updatedAt: "2026-11-04T10:00:00Z",
    });
    renderPage();
    expect(await screen.findByRole("button", { name: "Add bullet" })).toBeDisabled();
    expect(screen.getByLabelText("Summary")).toHaveAttribute("maxLength", "4000");
    expect(screen.getByLabelText("Full name")).toHaveAttribute("maxLength", "2000");
  });

  it("shows a retry option when the CV cannot load", async () => {
    api.getCv.mockRejectedValueOnce(new ApiClientError(0, "network", "offline"));
    renderPage();
    const retry = await screen.findByRole("button", { name: "Try again" });
    await userEvent.click(retry);
    expect(await screen.findByLabelText("Full name")).toBeInTheDocument();
  });
});
