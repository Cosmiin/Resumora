import { useState } from "react";
import {
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import { expect, it } from "vitest";
import { ProfileOverview, profileSectionStates } from "./ProfileOverview";
import { Editor } from "./Editor";
import { LanguageContext } from "./ui";
import { blankDraft, fact, newRole, type BaseDraft } from "../base/model";
function fixture() {
  const d = blankDraft();
  d.name = fact("Synthetic Owner");
  d.contacts[0].value = fact("owner@example.invalid");
  for (const title of ["Analyst", "Consultant"]) {
    const r = newRole();
    r.title = fact(title);
    r.company = fact("Example");
    r.context = fact("Original approved role description");
    r.start = fact({ year: "2020", month: "1" });
    r.end = fact({ year: "2022", month: "1" });
    d.roles.push(r);
  }
  return d;
}
function Harness({
  initial = fixture(),
  target,
}: {
  initial?: BaseDraft;
  target?: string;
}) {
  const [draft, change] = useState(initial),
    [enrichTarget, setTarget] = useState(target);
  return (
    <LanguageContext value="en">
      <ProfileOverview
        draft={draft}
        asOf={{ year: "2026", month: "10" }}
        editor={<Editor draft={draft} change={change} issues={[]} />}
        enrichTarget={enrichTarget}
        openEnrichment={setTarget}
        closeEnrichment={() => setTarget(undefined)}
        enrich={(id) => (
          <div data-testid={`questions-${id}`}>Optional role questions</div>
        )}
      />
    </LanguageContext>
  );
}
it("starts every Profile section collapsed without duplicate role cards or autofocus", () => {
  const { container } = render(<Harness />);
  expect(container.querySelectorAll(".editor-section[open]")).toHaveLength(0);
  expect(screen.queryByText("Edit profile information")).toBeNull();
  expect(
    screen.getAllByRole("heading", { name: "Analyst", hidden: true }),
  ).toHaveLength(1);
  expect(screen.getByText(/You can tailor your CV now/)).toBeTruthy();
});
it("marks missing structure without inventing content or treating optional sections as errors", () => {
  const d = fixture(),
    s = profileSectionStates(d);
  expect(s.summary.state).toBe("missing");
  expect(s.technicalSkills.state).toBe("missing");
  expect(s.experience.state).toBe("filled");
  d.roles[0].start.value = { year: "", month: "" };
  expect(profileSectionStates(d).experience.state).toBe("check");
  expect(d.summary.text).toBe("");
  expect(d.technicalSkills).toEqual([]);
});
it("keeps readable roles, editing and one question panel inside Experience", async () => {
  const d = fixture(),
    { container } = render(<Harness initial={d} />);
  const experience = container.querySelector<HTMLDetailsElement>(
    "#section-experience",
  )!;
  fireEvent.click(experience.querySelector("summary")!);
  expect(experience.open).toBe(true);
  fireEvent.click(
    within(experience).getAllByRole("button", { name: "Improve with AI" })[0],
  );
  expect(screen.getByTestId(`questions-${d.roles[0].id}`)).toBeTruthy();
  fireEvent.click(
    within(screen.getByRole("region", { name: "Consultant" })).getByRole(
      "button",
      { name: "Improve with AI" },
    ),
  );
  expect(screen.queryByTestId(`questions-${d.roles[0].id}`)).toBeNull();
  expect(screen.getByTestId(`questions-${d.roles[1].id}`)).toBeTruthy();
  fireEvent.click(
    within(experience).getAllByRole("button", { name: "Edit" })[0],
  );
  await waitFor(() =>
    expect(
      container.querySelector<HTMLDetailsElement>(`#entry-${d.roles[0].id}`)
        ?.open,
    ).toBe(true),
  );
  const input = within(experience).getAllByLabelText("Role *")[0];
  fireEvent.change(input, { target: { value: "Updated Analyst" } });
  expect(
    within(experience).getByRole("heading", { name: "Updated Analyst" }),
  ).toBeTruthy();
});
it("opens the correct section for a role enrichment deep link", async () => {
  const d = fixture(),
    { container } = render(<Harness initial={d} target={d.roles[1].id} />);
  await waitFor(() =>
    expect(
      container.querySelector<HTMLDetailsElement>("#section-experience")?.open,
    ).toBe(true),
  );
  expect(screen.getByTestId(`questions-${d.roles[1].id}`)).toBeTruthy();
  expect(container.querySelector("#section-identity[open]")).toBeNull();
});
