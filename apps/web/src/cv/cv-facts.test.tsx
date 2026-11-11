import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { emptyCv, type CvContent, type Experience, type RoleResult } from "@resumora/shared";
import type { RoleScoreState } from "./enrich/useRoleScores.ts";

const account = vi.hoisted(() => ({
  getPreferences: vi.fn(),
  savePreferences: vi.fn(),
  preferencesKey: (id: string | undefined) => ["account", "preferences", id ?? "signed-out"] as const,
}));
vi.mock("../account/account-api.ts", () => account);
vi.mock("../auth/AuthProvider.tsx", () => ({ useAuth: () => ({ loading: false, session: { user: { id: "u1" } } }) }));

import { CvFacts, isBlankCv, useStartTemplate } from "./CvFacts.tsx";

const role = (id: string): Experience => ({
  id, company: "Acme", title: `Role ${id}`, location: "", startDate: "2020", endDate: "", current: true, description: "",
  bullets: [{ id: `${id}-b`, text: "Did things." }], notes: [],
});
const ready = (score: number): RoleScoreState => ({
  state: "ready",
  result: { roleId: "x", policy: "p", fingerprint: "x", score, bullets: [], nextStep: null, questions: [], roleQuestions: [], thin: false } satisfies RoleResult,
});
const cv: CvContent = { ...emptyCv(), experience: [role("a"), role("b"), role("c")] };

function Host({ scores }: { scores: Map<string, RoleScoreState> }) {
  const start = useStartTemplate(true);
  return <CvFacts cv={cv} scores={scores} template={start.template} onTemplate={start.choose} templateFailed={start.failed} />;
}
const show = (scores: Map<string, RoleScoreState>) => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><Host scores={scores} /></QueryClientProvider>,
);

beforeEach(() => {
  vi.resetAllMocks();
  account.getPreferences.mockResolvedValue({ displayName: null, defaultTemplate: "modern", tailoringLanguage: "job" });
});

describe("the facts beside the base CV", () => {
  it("shows the CV's strength as the average of its scored roles, and how many still have questions", async () => {
    show(new Map([["a", ready(90)], ["b", ready(60)], ["c", ready(72)]]));
    expect(screen.getByText("74")).toBeInTheDocument();
    expect(screen.getByText("2 roles still have questions waiting.")).toBeInTheDocument();
    expect(screen.getByText("English")).toBeInTheDocument();
  });

  it("says so when every role reads clearly, and when nothing is scored yet", () => {
    const view = show(new Map([["a", ready(90)], ["b", ready(80)], ["c", ready(85)]]));
    expect(screen.getByText("Every role reads clearly.")).toBeInTheDocument();
    view.unmount();
    show(new Map([["a", { state: "scoring" }]]));
    expect(screen.getByText("The score appears once your roles are saved.")).toBeInTheDocument();
  });

  it("shows the template the person's CVs start with, and saves another choice as their preference", async () => {
    account.savePreferences.mockResolvedValue({ displayName: null, defaultTemplate: "compact", tailoringLanguage: "job" });
    show(new Map());
    const select = screen.getByRole("combobox", { name: "Template" });
    await waitFor(() => expect(select).toHaveValue("modern"));
    await userEvent.selectOptions(select, "compact");
    expect(account.savePreferences).toHaveBeenCalledWith({ defaultTemplate: "compact" });
    await waitFor(() => expect(select).toHaveValue("compact"));
  });

  it("says when the template could not be saved, and keeps the saved one", async () => {
    account.savePreferences.mockRejectedValue(new Error("down"));
    show(new Map());
    const select = screen.getByRole("combobox", { name: "Template" });
    await waitFor(() => expect(select).toHaveValue("modern"));
    await userEvent.selectOptions(select, "compact");
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't save the template. Choose it again.");
    expect(select).toHaveValue("modern");
  });
});

describe("isBlankCv", () => {
  it("is true only for a CV with no name, summary or entries", () => {
    expect(isBlankCv(emptyCv())).toBe(true);
    expect(isBlankCv({ ...emptyCv(), basics: { ...emptyCv().basics, fullName: "Ana" } })).toBe(false);
    expect(isBlankCv(cv)).toBe(false);
    expect(isBlankCv({ ...emptyCv(), technicalSkills: [{ id: "s", name: "SQL" }] })).toBe(false);
    expect(isBlankCv({ ...emptyCv(), basics: { ...emptyCv().basics, email: "ana@example.com" } })).toBe(false);
    expect(isBlankCv({ ...emptyCv(), interests: [{ id: "i", name: "Chess" }] })).toBe(false);
  });
});
