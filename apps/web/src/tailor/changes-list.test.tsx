import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { emptyCv, type CvContent, type TailoredCv } from "@resumora/shared";

vi.mock("./tailored-api.ts", () => ({ reviewItem: vi.fn() }));
import { reviewItem } from "./tailored-api.ts";
import { ChangesList } from "./ChangesList.tsx";

const role = (id: string, title: string, company: string, lines: string[]) => ({
  id, company, title, location: "", startDate: "2021-03", endDate: "", current: true, description: "", notes: [],
  bullets: lines.map((text, i) => ({ id: `${id}-b${i + 1}`, text })),
});
const own: CvContent = {
  ...emptyCv("en"),
  basics: { ...emptyCv("en").basics, fullName: "Ana Pop", titles: ["Business Analyst", "Solution Architect"], summary: "Analyst for operations teams." },
  experience: [role("r1", "Business Analyst", "Emedi", ["Made weekly reports", "Ran workshops"]), role("r2", "Intern", "Acme", ["Filed invoices"])],
  technicalSkills: [{ id: "s1", name: "Excel" }],
  interests: [{ id: "i1", name: "Knitting" }, { id: "i2", name: "Chess" }],
};
const newOrder = ["skills", ...own.layout.order.filter((key) => key !== "skills")];
const kept = (text: string, over: object = {}) => ({ kept: true, inferred: false, reviewed: false, text, ...over });

/** A tailored CV: one line reworded, a skill added, an interest hidden, the sections reordered, a headline proposed. */
function tailored(over: { content?: Partial<CvContent>; review?: Record<string, unknown>; version?: number } = {}): TailoredCv {
  const content: CvContent = {
    ...own,
    experience: [role("r1", "Business Analyst", "Emedi", ["Made weekly KPI reports for operations", "Ran workshops"]), own.experience[1]!],
    technicalSkills: [...own.technicalSkills, { id: "n1", name: "Zendesk" }],
    interests: [{ id: "i1", name: "Knitting", hidden: true }, { id: "i2", name: "Chess" }],
    layout: { ...own.layout, order: newOrder as CvContent["layout"]["order"] },
    ...over.content,
  };
  return {
    id: "cv1", version: over.version ?? 3, content, baseSnapshot: own, review: {
      experience: {
        "r1-b1": kept("Made weekly KPI reports for operations"),
        // Proposed, but left out by the checks: the line reads as the person wrote it, so it is no change.
        "r1-b2": { kept: false, inferred: false, reviewed: false, text: "Ran KissFlow workshops" },
      },
      skills: { "new-skill:Zendesk": kept("Zendesk") },
      interests: { "hide:i1": kept("Not about the job") },
      layout: { layout: kept(newOrder.join(",")), headline: { kept: false, inferred: false, reviewed: false, text: "Business Analyst for Operations" } },
      ...over.review,
    },
  } as unknown as TailoredCv;
}

function show(cv = tailored()) {
  const onChange = vi.fn<(cv: TailoredCv) => void>();
  function Harness() {
    const [doc, setDoc] = useState(cv);
    return <ChangesList cv={doc} onChange={(next) => { onChange(next); setDoc(next); }} />;
  }
  render(<Harness />);
  return { onChange, group: (name: string) => within(screen.getByRole("group", { name })) };
}

beforeEach(() => { vi.resetAllMocks(); });

describe("the list of changes on the final page", () => {
  it("shows every change with the person's wording and the new one, grouped, and names what was left alone", () => {
    const { group } = show();
    expect(screen.getAllByRole("group").map((g) => g.getAttribute("aria-label"))).toEqual(["Headline", "Business Analyst · Emedi", "Skills", "Interests", "Section order"]);

    const line = group("Business Analyst · Emedi");
    expect(line.getAllByRole("listitem")).toHaveLength(1);
    expect(line.getByText("Made weekly reports").tagName).toBe("S");
    expect(line.getByText("Made weekly KPI reports for operations")).toBeInTheDocument();
    expect(line.getByRole("button", { name: "Undo" })).toBeInTheDocument();

    expect(group("Skills").getByText("Added skill: Zendesk")).toBeInTheDocument();
    expect(group("Skills").getByRole("button", { name: "Remove" })).toBeInTheDocument();
    expect(group("Interests").getByText("Hidden for this job: Knitting")).toBeInTheDocument();
    expect(group("Interests").getByRole("button", { name: "Show it" })).toBeInTheDocument();

    // Only the sections a reader sees are named: this CV has a summary, experience, skills and interests.
    const order = group("Section order");
    expect(order.getByText("Skills · Summary · Experience · Interests")).toBeInTheDocument();
    expect(order.getByText("Yours: Summary · Experience · Skills · Interests")).toBeInTheDocument();
    expect(order.getByRole("button", { name: "Use this order" })).toHaveAttribute("aria-pressed", "true");
    expect(order.getByRole("button", { name: "Keep mine" })).toHaveAttribute("aria-pressed", "false");

    expect(screen.getByText("Left as you wrote them: Intern · Acme, Summary.")).toBeInTheDocument();
  });

  it("the headline is a choice the person makes: nothing is picked for them, and either pick is saved", async () => {
    const user = userEvent.setup();
    const used = tailored({ version: 4, content: { basics: { ...own.basics, titles: ["Business Analyst for Operations", "Solution Architect"] } },
      review: { layout: { layout: kept(newOrder.join(",")), headline: kept("Business Analyst for Operations", { reviewed: true }) } } });
    const mine = tailored({ version: 5, review: { layout: { layout: kept(newOrder.join(",")),
      headline: { kept: false, inferred: false, reviewed: true, text: "Business Analyst for Operations" } } } });
    vi.mocked(reviewItem).mockResolvedValueOnce(used).mockResolvedValueOnce(mine);
    const { group } = show();
    const headline = group("Headline");
    expect(headline.getByText("Business Analyst for Operations")).toBeInTheDocument();
    expect(headline.getByText("Yours: Business Analyst")).toBeInTheDocument();
    expect(headline.queryByRole("button", { pressed: true })).toBeNull();

    await user.click(headline.getByRole("button", { name: "Use this headline" }));
    expect(reviewItem).toHaveBeenLastCalledWith("cv1", { section: "layout", key: "headline", action: "keep", version: 3 });
    expect(group("Headline").getByRole("button", { name: "Use this headline" })).toHaveAttribute("aria-pressed", "true");

    await user.click(group("Headline").getByRole("button", { name: "Keep mine" }));
    expect(reviewItem).toHaveBeenLastCalledWith("cv1", { section: "layout", key: "headline", action: "remove", version: 4 });
    expect(group("Headline").getByRole("button", { name: "Keep mine" })).toHaveAttribute("aria-pressed", "true");
  });

  it("Undo puts the person's wording back and says so; the row has no way forward again", async () => {
    const user = userEvent.setup();
    const undone = tailored({ version: 4, content: { experience: own.experience },
      review: { experience: { "r1-b1": { kept: false, inferred: false, reviewed: true, text: "Made weekly KPI reports for operations" } } } });
    vi.mocked(reviewItem).mockResolvedValue(undone);
    const { group, onChange } = show();
    await user.click(group("Business Analyst · Emedi").getByRole("button", { name: "Undo" }));
    expect(reviewItem).toHaveBeenCalledWith("cv1", { section: "experience", key: "r1-b1", action: "remove", version: 3 });
    expect(onChange).toHaveBeenCalledWith(undone);
    const row = group("Business Analyst · Emedi");
    expect(row.getByText("Made weekly reports")).toBeInTheDocument();
    expect(row.getByText("Kept your wording")).toBeInTheDocument();
    expect(row.queryByRole("button")).toBeNull();
    // The role has no change on it any more, so it is named with the parts left alone.
    expect(screen.getByText("Left as you wrote them: Business Analyst · Emedi, Intern · Acme, Summary.")).toBeInTheDocument();
  });

  it("an undo that fails says so and leaves the row as it was", async () => {
    const user = userEvent.setup();
    vi.mocked(reviewItem).mockRejectedValue(new Error("offline"));
    const { group, onChange } = show();
    await user.click(group("Skills").getByRole("button", { name: "Remove" }));
    expect(group("Skills").getByRole("alert")).toHaveTextContent("That didn't save, so nothing changed. Try again.");
    expect(group("Skills").getByText("Added skill: Zendesk")).toBeInTheDocument();
    expect(group("Skills").getByRole("button", { name: "Remove" })).toBeEnabled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("leaves out a change the CV no longer has as it was made, and says when nothing changed at all", () => {
    // The line was edited on the CV after the tailoring: it can't be undone from here.
    const edited = tailored({ content: { experience: [role("r1", "Business Analyst", "Emedi", ["My own new line", "Ran workshops"]), own.experience[1]!] } });
    show(edited);
    expect(screen.queryByRole("group", { name: "Business Analyst · Emedi" })).toBeNull();
    expect(screen.getByRole("group", { name: "Skills" })).toBeInTheDocument();
  });

  it("says so when the job needed no change", () => {
    show({ ...tailored(), content: own, review: {} } as unknown as TailoredCv);
    expect(screen.getByText("Nothing needed changing for this job.")).toBeInTheDocument();
    expect(screen.queryByRole("group")).toBeNull();
  });
});
