import { useReducer } from "react";
import { describe, expect, it } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { emptyCv, type CvContent } from "@resumora/shared";
import { EditablePage } from "./EditablePage.tsx";
import { useOpenedSections } from "./useOpenedSections.ts";
import { cvReducer } from "./cvReducer.ts";

function Harness({ initial }: { initial: CvContent }) {
  const [cv, dispatch] = useReducer(cvReducer, initial);
  const [opened, onOpen] = useOpenedSections();
  return (
    <>
      <EditablePage cv={cv} dispatch={dispatch} opened={opened} onOpen={onOpen} />
      <output data-testid="json">{JSON.stringify(cv)}</output>
    </>
  );
}

const state = () => JSON.parse(screen.getByTestId("json").textContent ?? "{}") as CvContent;

function withSummary(): CvContent {
  const cv = emptyCv();
  return { ...cv, basics: { ...cv.basics, summary: "Product person." } };
}

describe("EditablePage", () => {
  it("every header field is editable", async () => {
    render(<Harness initial={emptyCv()} />);
    const fields: [string, (cv: CvContent) => string, string][] = [
      ["Full name", (cv) => cv.basics.fullName, "Ana Pop"],
      ["Title 1", (cv) => cv.basics.titles[0] ?? "", "Designer"],
      ["Title 2", (cv) => cv.basics.titles[1] ?? "", "Writer"],
      ["Email", (cv) => cv.basics.email, "ana@example.com"],
      ["Phone", (cv) => cv.basics.phone, "0712"],
      ["Location", (cv) => cv.basics.location, "Cluj"],
      ["Website", (cv) => cv.basics.website, "ana.dev"],
      ["LinkedIn", (cv) => cv.basics.linkedin, "in/ana"],
    ];
    for (const [label, read, text] of fields) {
      await userEvent.type(screen.getByRole("textbox", { name: label }), text);
      expect(read(state())).toBe(text);
    }
  });

  it("typing in the summary updates it", async () => {
    render(<Harness initial={withSummary()} />);
    await userEvent.type(screen.getByRole("textbox", { name: "Summary" }), " More.");
    expect(state().basics.summary).toBe("Product person. More.");
  });

  it("renaming a heading shows the new name and clearing it brings the standard one back", async () => {
    render(<Harness initial={withSummary()} />);
    const heading = screen.getByRole("textbox", { name: "Summary heading" });
    expect(heading).toHaveValue("");
    expect(heading).toHaveAttribute("placeholder", "Summary");
    await userEvent.type(heading, "About me");
    expect(heading).toHaveValue("About me");
    expect(state().layout.titles.summary).toBe("About me");
    await userEvent.clear(heading);
    expect(heading).toHaveValue("");
    expect(heading).toHaveAttribute("placeholder", "Summary");
    expect(state().layout.titles.summary).toBeUndefined();
  });

  it("a missing section shows a box with Add, and Add puts the cursor in the new section", async () => {
    render(<Harness initial={emptyCv()} />);
    const box = screen.getByRole("group", { name: "Summary" });
    expect(within(box).getByText(/Recruiters read this first/)).toBeInTheDocument();
    expect(document.querySelector('[data-section="summary"]')).toBeNull();
    await userEvent.click(within(box).getByRole("button", { name: "Add" }));
    expect(screen.queryByRole("group", { name: "Summary" })).toBeNull();
    const section = document.querySelector<HTMLElement>('[data-section="summary"]')!;
    expect(section).not.toBeNull();
    await waitFor(() => expect(within(section).getByRole("textbox", { name: "Summary" })).toHaveFocus());
  });

  it("Add on a list section puts the cursor in its first line", async () => {
    render(<Harness initial={emptyCv()} />);
    await userEvent.click(within(screen.getByRole("group", { name: "Languages" })).getByRole("button", { name: "Add" }));
    expect(state().languages).toHaveLength(1);
    const section = document.querySelector<HTMLElement>('[data-section="languages"]')!;
    await waitFor(() => expect(within(section).getByRole("textbox", { name: "Language" })).toHaveFocus());
  });

  it("a hidden section shows neither the section nor its box", () => {
    const cv = withSummary();
    const hiddenFull = { ...cv, layout: { ...cv.layout, hidden: ["summary" as const, "languages" as const] } };
    render(<Harness initial={hiddenFull} />);
    expect(document.querySelector('[data-section="summary"]')).toBeNull();
    expect(screen.queryByRole("group", { name: "Summary" })).toBeNull();
    expect(screen.queryByRole("group", { name: "Languages" })).toBeNull();
  });

  it("+ Add item is reachable with Tab and adds a line", async () => {
    const cv = { ...emptyCv(), languages: [{ id: "l1", name: "French", level: "B2" }] };
    render(<Harness initial={cv} />);
    const level = screen.getByRole("textbox", { name: "Language level" });
    await userEvent.click(level);
    await userEvent.tab();
    const add = screen.getByRole("button", { name: "+ Add item" });
    expect(add).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    expect(state().languages).toHaveLength(2);
  });

  it("an item's two fields are editable", async () => {
    const cv = { ...emptyCv(), languages: [{ id: "l1", name: "French", level: "B2" }] };
    render(<Harness initial={cv} />);
    await userEvent.type(screen.getByRole("textbox", { name: "Language level" }), "+");
    expect(state().languages[0]?.level).toBe("B2+");
    await userEvent.click(screen.getByRole("button", { name: "Remove French" }));
    expect(state().languages).toHaveLength(0);
  });

  it("every text field of every list item is visible and editable", async () => {
    const cv: CvContent = {
      ...emptyCv(),
      certifications: [{ id: "c1", name: "AWS", issuer: "Amazon", date: "2021-03" }],
      projects: [{ id: "p1", name: "Site", description: "Built it", url: "site.dev" }],
      awards: [{ id: "a1", name: "Prize", issuer: "Org", date: "2020-05", description: "For work" }],
      courses: [{ id: "k1", name: "Course", provider: "School", date: "2019-01" }],
      publications: [{ id: "u1", title: "Paper", publisher: "Journal", date: "2018-02", url: "paper.org" }],
    };
    render(<Harness initial={cv} />);
    const checks: [string, string, (c: CvContent) => string, string][] = [
      ["Certification", "AWS", (c) => c.certifications[0]!.name, "!"],
      ["Certification issuer", "Amazon", (c) => c.certifications[0]!.issuer, "!"],
      ["Project", "Site", (c) => c.projects[0]!.name, "!"],
      ["Project description", "Built it", (c) => c.projects[0]!.description, "!"],
      ["Project link", "site.dev", (c) => c.projects[0]!.url, "!"],
      ["Award", "Prize", (c) => c.awards[0]!.name, "!"],
      ["Award issuer", "Org", (c) => c.awards[0]!.issuer, "!"],
      ["Award description", "For work", (c) => c.awards[0]!.description, "!"],
      ["Course", "Course", (c) => c.courses[0]!.name, "!"],
      ["Course provider", "School", (c) => c.courses[0]!.provider, "!"],
      ["Publication", "Paper", (c) => c.publications[0]!.title, "!"],
      ["Publisher", "Journal", (c) => c.publications[0]!.publisher, "!"],
      ["Publication link", "paper.org", (c) => c.publications[0]!.url, "!"],
    ];
    for (const [label, shown, read, add] of checks) {
      const box = screen.getByRole("textbox", { name: label });
      expect(box).toHaveValue(shown);
      await userEvent.type(box, add);
      expect(read(state())).toBe(shown + add);
    }
    for (const label of ["Certification date", "Award date", "Course date", "Publication date"]) {
      expect(screen.getByRole("textbox", { name: label })).toBeInTheDocument();
    }
  });

  it('a typed date "03/2021" is saved as 2021-03', async () => {
    const cv: CvContent = { ...emptyCv(), certifications: [{ id: "c1", name: "AWS", issuer: "", date: "" }] };
    render(<Harness initial={cv} />);
    await userEvent.type(screen.getByRole("textbox", { name: "Certification date" }), "03/2021");
    expect(state().certifications[0]?.date).toBe("2021-03");
  });

  it("a custom section keeps its own heading", async () => {
    const cv = { ...emptyCv(), custom: [{ id: "c1", title: "Hobbies", details: "Chess" }] };
    render(<Harness initial={cv} />);
    const section = document.querySelector<HTMLElement>('[data-section="other"]')!;
    const title = within(section).getByRole("textbox", { name: "Custom section title" });
    expect(title).toHaveValue("Hobbies");
    await userEvent.type(within(section).getByRole("textbox", { name: "Hobbies details" }), "!");
    expect(state().custom[0]?.details).toBe("Chess!");
    await userEvent.type(title, "2");
    expect(state().custom[0]?.title).toBe("Hobbies2");
  });

  it("interests are chips and achievements are bullets", async () => {
    const cv = { ...emptyCv(), achievements: [{ id: "a1", text: "Won" }], interests: [{ id: "i1", name: "Go" }] };
    render(<Harness initial={cv} />);
    await userEvent.click(screen.getByRole("button", { name: "+ Add item" }));
    expect(state().achievements).toHaveLength(2);
    await userEvent.type(screen.getByRole("textbox", { name: "Interests" }), "Chess{Enter}");
    expect(state().interests.map((i) => i.name)).toEqual(["Go", "Chess"]);
  });
});
