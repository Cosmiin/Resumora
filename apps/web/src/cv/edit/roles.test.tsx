import { useReducer } from "react";
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { emptyCv, type CvContent, type Experience } from "@resumora/shared";
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

function role(over: Partial<Experience> = {}): Experience {
  return {
    id: "r1",
    company: "Acme",
    title: "Designer",
    location: "Cluj",
    startDate: "2020-03",
    endDate: "2022-05",
    current: false,
    description: "",
    bullets: [{ id: "b1", text: "Shipped it" }],
    notes: [],
    ...over,
  };
}

function withRoles(...experience: Experience[]): CvContent {
  return { ...emptyCv(), experience };
}

describe("roles on the page", () => {
  it("+ Add role adds an empty role and focuses its title", async () => {
    render(<Harness initial={withRoles(role())} />);
    await userEvent.click(screen.getByRole("button", { name: "+ Add role" }));
    expect(state().experience[1]!.title).toBe("");
    const roles = document.querySelectorAll("[data-item]");
    expect(roles).toHaveLength(2);
    expect(document.activeElement).toBe(within(roles[1] as HTMLElement).getByRole("textbox", { name: "Role title" }));
  });

  it("title, company, location and description are editable", async () => {
    render(<Harness initial={withRoles(role())} />);
    await userEvent.type(screen.getByRole("textbox", { name: "Role title" }), "!");
    await userEvent.type(screen.getByRole("textbox", { name: "Company" }), "!");
    await userEvent.type(screen.getByRole("textbox", { name: "Role location" }), "!");
    await userEvent.type(screen.getByRole("textbox", { name: "Role description" }), "Led design");
    const r = state().experience[0]!;
    expect([r.title, r.company, r.location, r.description]).toEqual(["Designer!", "Acme!", "Cluj!", "Led design"]);
  });

  it("a current role shows Present instead of an end date", () => {
    render(<Harness initial={withRoles(role({ current: true, endDate: "" }))} />);
    expect(screen.getByText("Present")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "End date" })).not.toBeInTheDocument();
  });

  it("Present follows the CV language", () => {
    render(<Harness initial={{ ...withRoles(role({ current: true, endDate: "" })), locale: "ro" }} />);
    expect(screen.getByText("prezent")).toBeInTheDocument();
  });

  it("typing present in the end date marks the role current", async () => {
    render(<Harness initial={withRoles(role())} />);
    const end = screen.getByRole("textbox", { name: "End date" });
    await userEvent.clear(end);
    await userEvent.type(end, "present");
    expect(state().experience[0]).toMatchObject({ current: true, endDate: "" });
    expect(screen.getByText("Present")).toBeInTheDocument();
  });

  it("clicking Present brings the end date back", async () => {
    render(<Harness initial={withRoles(role({ current: true, endDate: "" }))} />);
    await userEvent.click(screen.getByRole("button", { name: "Present, click to set an end date" }));
    expect(state().experience[0]!.current).toBe(false);
    expect(screen.getByRole("textbox", { name: "End date" })).toBeInTheDocument();
  });

  it("a start date typed in free form is saved as YYYY-MM", async () => {
    render(<Harness initial={withRoles(role({ startDate: "" }))} />);
    await userEvent.type(screen.getByRole("textbox", { name: "Start date" }), "Mar 2021");
    expect(state().experience[0]!.startDate).toBe("2021-03");
  });

  it("removing a role takes it off the page", async () => {
    render(<Harness initial={withRoles(role(), role({ id: "r2", title: "Writer" }))} />);
    await userEvent.click(screen.getByRole("button", { name: "Remove Designer" }));
    expect(state().experience.map((r) => r.id)).toEqual(["r2"]);
  });
});

describe("education on the page", () => {
  it("every field is editable and + Add education adds a school", async () => {
    const cv = {
      ...emptyCv(),
      education: [{ id: "e1", school: "UBB", degree: "BSc", field: "CS", startDate: "", endDate: "", notes: "" }],
    };
    render(<Harness initial={cv} />);
    await userEvent.type(screen.getByRole("textbox", { name: "Degree" }), "!");
    await userEvent.type(screen.getByRole("textbox", { name: "School" }), "!");
    await userEvent.type(screen.getByRole("textbox", { name: "Field of study" }), "!");
    await userEvent.type(screen.getByRole("textbox", { name: "Education notes" }), "Thesis");
    await userEvent.type(screen.getByRole("textbox", { name: "Education start date" }), "2015");
    expect(state().education[0]).toMatchObject({
      degree: "BSc!",
      school: "UBB!",
      field: "CS!",
      notes: "Thesis",
      startDate: "2015",
    });
    await userEvent.click(screen.getByRole("button", { name: "+ Add education" }));
    expect(state().education).toHaveLength(2);
    expect(document.activeElement).toBe(
      within(document.querySelectorAll("[data-item]")[1] as HTMLElement).getByRole("textbox", { name: "Degree" }),
    );
  });
});

describe("skills on the page", () => {
  const cv = (): CvContent => ({ ...emptyCv(), technicalSkills: [{ id: "t1", name: "SQL" }] });

  it("typing a chip in Technical adds it there", async () => {
    render(<Harness initial={cv()} />);
    await userEvent.type(screen.getByRole("textbox", { name: "Add technical skill" }), "Python{Enter}");
    expect(state().technicalSkills.map((s) => s.name)).toEqual(["SQL", "Python"]);
    expect(state().professionalSkills).toEqual([]);
  });

  it("Professional has its own row", async () => {
    render(<Harness initial={cv()} />);
    await userEvent.type(screen.getByRole("textbox", { name: "Add professional skill" }), "Teamwork,");
    expect(state().professionalSkills.map((s) => s.name)).toEqual(["Teamwork"]);
  });

  it("To sort shows only when it has skills", () => {
    const { unmount } = render(<Harness initial={cv()} />);
    expect(screen.queryByText("To sort")).not.toBeInTheDocument();
    unmount();
    render(<Harness initial={{ ...cv(), unclearSkills: [{ id: "u1", name: "Vibes" }] }} />);
    expect(screen.getByText("To sort")).toBeInTheDocument();
    expect(screen.getByText("Vibes")).toBeInTheDocument();
  });

  it("the x on a chip removes it", async () => {
    render(<Harness initial={cv()} />);
    await userEvent.click(screen.getByRole("button", { name: "Remove SQL" }));
    expect(state().technicalSkills).toEqual([]);
  });
});
