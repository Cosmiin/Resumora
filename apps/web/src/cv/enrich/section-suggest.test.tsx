import { useReducer } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { emptyCv, type CvContent } from "@resumora/shared";
import { cvReducer } from "../edit/cvReducer.ts";

const api = vi.hoisted(() => ({ suggestAchievements: vi.fn(), itemLines: vi.fn(), createVoiceSession: vi.fn() }));
vi.mock("./enrich-api.ts", () => api);

import { SectionTools } from "../panel/SectionTools.tsx";

const base: CvContent = {
  ...emptyCv("en"),
  experience: [{ id: "r1", company: "Acme", title: "Analyst", location: "", startDate: "2020-01", endDate: "", current: true,
    description: "", bullets: [{ id: "b1", text: "Cut costs by 10%." }], notes: [] }],
  courses: [{ id: "c1", name: "Excel for analysts", provider: "", date: "", bullets: [], hidden: false }],
};

function Harness({ focus, original }: { focus: { key: "achievements" | "courses"; itemId?: string }; original?: CvContent }) {
  const [cv, dispatch] = useReducer(cvReducer, base);
  return (
    <>
      <p data-testid="achievements">{cv.achievements.map((a) => a.text).join(" | ")}</p>
      <SectionTools cv={cv} dispatch={dispatch} focus={focus} onBack={() => {}} onFocusPage={() => {}} waitForSave={() => Promise.resolve()} original={original} />
    </>
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  api.suggestAchievements.mockResolvedValue({ suggestions: [{ text: "Cut costs by 10% in a year.", roleId: "r1" }, { text: "Trained the team.", roleId: "r1" }] });
});

describe("Suggest in the Key achievements section", () => {
  it("offers suggestions and adds the ticked ones", async () => {
    render(<Harness focus={{ key: "achievements" }} />);
    await userEvent.click(screen.getByRole("button", { name: "Suggest" }));
    await userEvent.click(await screen.findByRole("checkbox", { name: /Cut costs by 10% in a year\./ }));
    await userEvent.click(screen.getByRole("button", { name: "Add 1 achievement" }));
    expect(screen.getByTestId("achievements")).toHaveTextContent("Cut costs by 10% in a year.");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("says so when there is nothing to suggest", async () => {
    api.suggestAchievements.mockResolvedValue({ suggestions: [] });
    render(<Harness focus={{ key: "achievements" }} />);
    await userEvent.click(screen.getByRole("button", { name: "Suggest" }));
    expect(await screen.findByText(/No suggestions this time/)).toBeInTheDocument();
  });

  it("no longer shows the switched-off placeholder", () => {
    render(<Harness focus={{ key: "achievements" }} />);
    expect(screen.queryByText("Pull achievements from my roles")).toBeNull();
  });
});

describe("Suggest lines under a course", () => {
  it("opens the Tell us about box for that item", async () => {
    render(<Harness focus={{ key: "courses", itemId: "c1" }} />);
    await userEvent.click(screen.getByRole("button", { name: "Suggest lines" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("is not offered on the section without an item", () => {
    render(<Harness focus={{ key: "courses" }} />);
    expect(screen.queryByRole("button", { name: "Suggest lines" })).toBeNull();
  });
});

describe("on a tailored CV", () => {
  it("shows no Suggest button", () => {
    render(<Harness focus={{ key: "achievements" }} original={base} />);
    expect(screen.queryByRole("button", { name: "Suggest" })).toBeNull();
  });
});
