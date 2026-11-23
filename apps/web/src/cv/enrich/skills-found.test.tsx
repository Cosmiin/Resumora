import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { emptyCv, type CvContent, type Experience } from "@resumora/shared";
import type { SkillSuggestion } from "./enrich-api.ts";
import { SkillsFound } from "./SkillsFound.tsx";

const role: Experience = {
  id: "r1", company: "Gameloft", title: "Talent Acquisition Manager", location: "", startDate: "2022-01", endDate: "", current: true,
  description: "", bullets: [{ id: "b1", text: "Led a team of four recruiters." }], notes: [],
};
const cv: CvContent = { ...emptyCv("en"), experience: [role] };
const skill = (name: string, group: SkillSuggestion["group"], over: Partial<SkillSuggestion> = {}): SkillSuggestion =>
  ({ name, group, lines: [{ roleId: "r1", text: `Line for ${name}` }], picked: false, ...over });
const twelve: SkillSuggestion[] = [
  ...["Gem", "Pin", "Excel", "Workday"].map((n) => skill(n, "technicalSkills")),
  skill("Team leadership", "professionalSkills", { lines: [{ roleId: "r1", text: "Led a team of four" }] }),
  ...["Recruitment", "Onboarding", "KPI reporting", "Interviewing", "Employer branding", "HR policy", "Payroll"].map((n) => skill(n, "professionalSkills")),
];

function renderFound(suggestions: SkillSuggestion[] = twelve, on: CvContent = cv) {
  const onAdd = vi.fn();
  const view = render(<SkillsFound cv={on} suggestions={suggestions} onAdd={onAdd} />);
  return { onAdd, view };
}

describe("SkillsFound", () => {
  it("closed: title, counts, the first 9 tags, +N more, and Add all adds every one", async () => {
    const { onAdd } = renderFound();
    expect(screen.getByRole("heading", { name: "Your roles show 12 skills" })).toBeInTheDocument();
    expect(screen.getByText("4 technical · 8 professional")).toBeInTheDocument();
    expect(document.querySelectorAll(".sf-tag:not(.is-more)")).toHaveLength(9);
    expect(screen.getByText("+3 more")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Add all 12" }));
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd.mock.calls[0]![0]).toHaveLength(12);
    expect(onAdd.mock.calls[0]![0][0]).toEqual({ name: "Gem", group: "technicalSkills" });
    expect(screen.getByRole("status")).toHaveTextContent("12 skills added to your CV.");
  });

  it("one suggestion reads Your roles show 1 skill and Add to my CV", async () => {
    const { onAdd } = renderFound([skill("Gem", "technicalSkills")]);
    expect(screen.getByRole("heading", { name: "Your roles show 1 skill" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Add to my CV" }));
    expect(onAdd).toHaveBeenCalledWith([{ name: "Gem", group: "technicalSkills" }]);
    expect(screen.getByRole("status")).toHaveTextContent("1 skill added to your CV.");
  });

  it("Look through: remove one, see a skill's lines, Add 11; Back restores the removed one", async () => {
    const { onAdd } = renderFound();
    await userEvent.click(screen.getByRole("button", { name: "Look through" }));
    expect(screen.getByText("Remove any you don't want. Tap one to see the line it came from.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Technical" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Professional" })).toBeInTheDocument();
    const lead = screen.getByRole("button", { name: "Team leadership" });
    expect(lead).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(lead);
    expect(lead).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("“Led a team of four”")).toBeInTheDocument();
    expect(screen.getByText("Talent Acquisition Manager · Gameloft")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Remove Payroll" }));
    expect(screen.queryByRole("button", { name: "Payroll" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    await userEvent.click(screen.getByRole("button", { name: "Look through" }));
    expect(screen.getByRole("button", { name: "Payroll" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Remove Payroll" }));
    await userEvent.click(screen.getByRole("button", { name: "Add 11" }));
    expect(onAdd.mock.calls[0]![0]).toHaveLength(11);
    expect(onAdd.mock.calls[0]![0].map((s: { name: string }) => s.name)).not.toContain("Payroll");
    expect(screen.getByRole("status")).toHaveTextContent("11 skills added to your CV.");
  });

  it("Add is disabled once every skill is removed", async () => {
    renderFound([skill("Gem", "technicalSkills")]);
    await userEvent.click(screen.getByRole("button", { name: "Look through" }));
    await userEvent.click(screen.getByRole("button", { name: "Remove Gem" }));
    expect(screen.getByRole("button", { name: "Add 0" })).toBeDisabled();
  });

  it("a picked tool shows you picked", async () => {
    renderFound([skill("Gem", "technicalSkills", { picked: true }), skill("Excel", "technicalSkills")]);
    await userEvent.click(screen.getByRole("button", { name: "Look through" }));
    expect(within(screen.getByRole("button", { name: /^Gem/ })).getByText("you picked")).toBeInTheDocument();
    expect(within(screen.getByRole("button", { name: "Excel" })).queryByText("you picked")).toBeNull();
  });

  it("a suggestion already on the CV is left out, and with none left it renders nothing", () => {
    const listed = { ...cv, technicalSkills: [{ id: "s1", name: "gem " }] };
    const { view } = renderFound([skill("Gem", "technicalSkills"), skill("Team leadership", "professionalSkills")], listed);
    expect(screen.getByRole("heading", { name: "Your roles show 1 skill" })).toBeInTheDocument();
    view.unmount();
    const all = { ...listed, professionalSkills: [{ id: "s2", name: "Team Leadership" }] };
    const { view: empty } = renderFound([skill("Gem", "technicalSkills"), skill("Team leadership", "professionalSkills")], all);
    expect(empty.container).toBeEmptyDOMElement();
  });
});
