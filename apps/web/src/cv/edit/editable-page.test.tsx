import { useReducer } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { emptyCv, type CvContent } from "@resumora/shared";
import { EditablePage } from "./EditablePage.tsx";
import { useOpenedSections } from "./useOpenedSections.ts";
import { cvReducer } from "./cvReducer.ts";

const signPhoto = vi.hoisted(() => vi.fn());
vi.mock("../../lib/supabase.ts", () => ({
  supabase: { storage: { from: () => ({ createSignedUrl: signPhoto }) } },
}));

beforeEach(() => {
  signPhoto.mockReset().mockResolvedValue({ data: { signedUrl: "https://example.test/photo" }, error: null });
});

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
  it.each(["classic", "modern"] as const)("shows the tailored %s photo before the name without photo controls", async (template) => {
    const cv = emptyCv();
    cv.basics.fullName = "Ana Pop";
    cv.basics.photo = { path: "user-a/photo.jpg", x: 25, y: 75, zoom: 2 };
    const { container } = render(<EditablePage cv={cv} dispatch={vi.fn()} opened={new Set()} onOpen={vi.fn()} tailored template={template} />);
    const image = await screen.findByRole("img", { name: "CV photo" });
    const name = screen.getByRole("textbox", { name: "Full name" });
    expect(image.closest(".cv-header")).toBe(name.closest(".cv-header"));
    expect(image.parentElement?.parentElement).toBe(name.parentElement);
    expect(image.compareDocumentPosition(name) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(image.parentElement).toHaveStyle({ width: "96px", height: "96px", float: "right", overflow: "hidden" });
    expect(image).toHaveStyle({ objectPosition: "25% 75%", transform: "scale(2)", transformOrigin: "25% 75%" });
    expect(image).toHaveAttribute("draggable", "false");
    expect(signPhoto).toHaveBeenCalledWith(cv.basics.photo.path, 3600);
    expect(container.querySelector('input[type="file"]')).toBeNull();
    expect(screen.queryByRole("slider", { name: "Photo zoom" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove photo" })).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Photo position" })).not.toBeInTheDocument();
    expect(screen.queryByText("Drag the photo or use the arrow keys to adjust its position.")).not.toBeInTheDocument();
  });

  it.each(["with a photo", "without a photo"])("shows no photo controls on a tailored Compact page %s", (scenario) => {
    const cv = emptyCv();
    if (scenario === "with a photo") cv.basics.photo = { path: "user-a/photo.jpg", x: 50, y: 50, zoom: 1 };
    const { container } = render(<EditablePage cv={cv} dispatch={vi.fn()} opened={new Set()} onOpen={vi.fn()} tailored template="compact" />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(signPhoto).not.toHaveBeenCalled();
    expect(container.querySelector('input[type="file"]')).toBeNull();
    expect(screen.queryByRole("slider", { name: "Photo zoom" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove photo" })).not.toBeInTheDocument();
    expect(screen.queryByText("Drag the photo or use the arrow keys to adjust its position.")).not.toBeInTheDocument();
  });

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
      projects: [{ id: "p1", title: "Site", company: "", location: "", startDate: "", endDate: "", current: false, description: "Built it", bullets: [], notes: [], url: "site.dev" }],
      awards: [{ id: "a1", name: "Prize", issuer: "Org", date: "2020-05", description: "For work" }],
      courses: [{ id: "k1", name: "Course", provider: "School", date: "2019-01" }],
      publications: [{ id: "u1", title: "Paper", publisher: "Journal", date: "2018-02", url: "paper.org" }],
    };
    render(<Harness initial={cv} />);
    const checks: [string, string, (c: CvContent) => string, string][] = [
      ["Certification", "AWS", (c) => c.certifications[0]!.name, "!"],
      ["Certification issuer", "Amazon", (c) => c.certifications[0]!.issuer, "!"],
      ["Project name", "Site", (c) => c.projects[0]!.title, "!"],
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

  it("a project shows like a short role under Projects, with editable bullets", async () => {
    const project = {
      id: "p1", title: "Forecast", company: "Personal project", location: "", startDate: "2023", endDate: "", current: false,
      description: "", notes: [], url: "github.com/x",
      bullets: [{ id: "b1", text: "Built a script" }, { id: "b2", text: "Saved 2 hours" }],
    };
    const cv: CvContent = { ...emptyCv(), projects: [project], layout: { ...emptyCv().layout, order: ["projects", ...emptyCv().layout.order.filter((k) => k !== "projects")] } };
    render(<Harness initial={cv} />);
    expect(screen.getByRole("textbox", { name: "Project name" })).toHaveValue("Forecast");
    expect(screen.getByRole("textbox", { name: "Project link" })).toHaveValue("github.com/x");
    const second = screen.getByRole("textbox", { name: "Bullet 2 of Forecast" });
    expect(second).toHaveValue("Saved 2 hours");
    await userEvent.type(second, "!");
    expect(state().projects[0]!.bullets[1]!.text).toBe("Saved 2 hours!");
    expect(screen.queryByRole("textbox", { name: "Role title" })).not.toBeInTheDocument();
  });

  it("lines under a course and an interest can be edited and deleted", async () => {
    const cv: CvContent = {
      ...emptyCv(),
      courses: [{ id: "k1", name: "Power BI", provider: "Microsoft", date: "2025", bullets: [{ id: "l1", text: "Dashboards" }, { id: "l2", text: "DAX" }] }],
      interests: [{ id: "i1", name: "Running", bullets: [{ id: "l3", text: "Half marathons" }] }],
    };
    render(<Harness initial={cv} />);
    await userEvent.type(screen.getByRole("textbox", { name: "Bullet 1 of Power BI" }), "!");
    expect(state().courses[0]!.bullets![0]!.text).toBe("Dashboards!");
    const second = screen.getByRole("textbox", { name: "Bullet 2 of Power BI" });
    await userEvent.clear(second);
    await userEvent.type(second, "{Backspace}");
    expect(state().courses[0]!.bullets!.map((b) => b.text)).toEqual(["Dashboards!"]);
    await userEvent.type(screen.getByRole("textbox", { name: "Bullet 1 of Running" }), "!");
    expect(state().interests[0]!.bullets![0]!.text).toBe("Half marathons!");
  });

  it("a hidden course or interest stays in the editor and Show on CV brings it back; a course can be hidden (E6 Task 10a)", async () => {
    const cv: CvContent = {
      ...emptyCv(),
      courses: [{ id: "k1", name: "Pottery class", provider: "", date: "", hidden: true }, { id: "k2", name: "SQL basics", provider: "", date: "" }],
      interests: [{ id: "i1", name: "Knitting", hidden: true }],
    };
    render(<Harness initial={cv} />);
    const pottery = screen.getByRole("group", { name: "Pottery class" });
    expect(pottery).toHaveClass("is-hidden");
    await userEvent.click(within(pottery).getByRole("button", { name: "Show Pottery class on CV" }));
    expect(state().courses[0]!.hidden).toBeUndefined();
    await userEvent.click(within(screen.getByRole("group", { name: "SQL basics" })).getByRole("button", { name: "Hide SQL basics on CV" }));
    expect(state().courses[1]!.hidden).toBe(true);
    await userEvent.click(screen.getByRole("button", { name: "Show Knitting on CV" }));
    expect(state().interests[0]!.hidden).toBeUndefined();
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
