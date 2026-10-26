import { useState } from "react";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";
import { MonthYearField } from "./MonthYearField";
import { Editor } from "./Editor";
import { LanguageContext } from "./ui";
import { MemoryBaseCvAdapter } from "../base/adapter";
import {
  blankDraft,
  clone,
  fact,
  newEducation,
  newOptionalEntry,
  newRole,
  type BaseDraft,
  type PartialDate,
} from "../base/model";

function mountDate(initial: PartialDate) {
  let latest = initial,
    clicks = 0;
  function Surface() {
    const [value, setValue] = useState(initial);
    return (
      <LanguageContext.Provider value="en">
        <div
          onClick={(e) => {
            if (e.detail > 0) clicks++;
          }}
        >
          <MonthYearField
            id="start"
            label="Start"
            value={value}
            onChange={(next) => {
              latest = next;
              setValue(next);
            }}
          />
          <input aria-label="Next field" />
        </div>
      </LanguageContext.Provider>
    );
  }
  render(<Surface />);
  return {
    get value() {
      return latest;
    },
    get clicks() {
      return clicks;
    },
  };
}

it("opens without assigning a date and selects a year and month with two optional clicks and no confirmation", async () => {
  const result = mountDate({ year: "", month: "" }),
    user = userEvent.setup();
  await user.click(
    screen.getByRole("button", { name: "Choose month/year: Start" }),
  );
  const picker = screen.getByRole("dialog", { name: "Start" });
  const year = within(picker).getByRole("spinbutton", { name: "Year" });
  expect(document.activeElement).toBe(year);
  expect((year as HTMLInputElement).value).toBe("");
  expect(result.value).toEqual({ year: "", month: "" });
  const months = within(picker).getByRole("group", { name: "Month" });
  expect(within(months).getAllByRole("button")).toHaveLength(12);
  expect(
    (
      within(months).getByRole("button", {
        name: "January",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  expect(within(picker).getAllByRole("spinbutton")).toHaveLength(1);
  await user.keyboard("2024");
  expect(result.value).toEqual({ year: "2024", month: "" });
  await user.click(within(months).getByRole("button", { name: "March" }));
  expect(result.clicks).toBe(2);
  expect(result.value).toEqual({ year: "2024", month: "3" });
  expect(screen.queryByRole("dialog")).toBeNull();
  const input = screen.getByRole("textbox", { name: "Start" });
  expect(document.activeElement).toBe(input);
  expect((input as HTMLInputElement).value).toBe("03/2024");
});

it("keeps typed entry and Tab unchanged, opens by keyboard, and preserves year-only and unknown precision", async () => {
  const result = mountDate({ year: "2020", month: "" }),
    user = userEvent.setup();
  const input = screen.getByRole("textbox", { name: "Start" });
  input.focus();
  await user.keyboard("{Alt>}{ArrowDown}{/Alt}");
  expect(document.activeElement).toBe(
    screen.getByRole("spinbutton", { name: "Year" }),
  );
  expect(result.value).toEqual({ year: "2020", month: "" });
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.activeElement).toBe(input);
  await user.clear(input);
  await user.keyboard("2025");
  expect(result.value).toEqual({ year: "2025", month: "" });
  await user.tab();
  expect(document.activeElement).toBe(
    screen.getByRole("textbox", { name: "Next field" }),
  );
  input.focus();
  await user.keyboard("{Alt>}{ArrowDown}{/Alt}{Tab}{Enter}");
  expect(result.value).toEqual({ year: "2025", month: "1" });
  expect(document.activeElement).toBe(input);
  await user.click(
    screen.getByRole("button", { name: "Choose month/year: Start" }),
  );
  await user.click(screen.getByRole("button", { name: "Year only" }));
  expect(result.value).toEqual({ year: "2025", month: "" });
  await user.click(
    screen.getByRole("button", { name: "Choose month/year: Start" }),
  );
  await user.click(screen.getByRole("button", { name: "Unknown date" }));
  expect(result.value).toEqual({ year: "", month: "" });
  expect((input as HTMLInputElement).value).toBe("");
});

it("dismisses through Close, outside focus and Tab without changing the date or trapping focus", async () => {
  const result = mountDate({ year: "2022", month: "" }),
    user = userEvent.setup();
  const trigger = screen.getByRole("button", {
    name: "Choose month/year: Start",
  });
  await user.click(trigger);
  await user.click(
    screen.getByRole("button", { name: "Close month/year picker" }),
  );
  expect(document.activeElement).toBe(
    screen.getByRole("textbox", { name: "Start" }),
  );
  await user.click(trigger);
  const next = screen.getByRole("textbox", { name: "Next field" });
  await user.click(next);
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.activeElement).toBe(next);
  await user.click(trigger);
  screen.getByRole("button", { name: "Unknown date" }).focus();
  await user.tab();
  expect(document.activeElement).toBe(next);
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(result.value).toEqual({ year: "2022", month: "" });
});

it.each([
  "experience",
  "education",
  "projects",
  "certifications",
  "volunteering",
  "custom",
] as const)(
  "uses the same picker for %s while preserving ongoing dates, source lineage and restored precision",
  async (kind) => {
    const d = blankDraft();
    let entry:
      | ReturnType<typeof newRole>
      | ReturnType<typeof newEducation>
      | ReturnType<typeof newOptionalEntry>;
    let section: string,
      startLabel: string,
      endLabel: string,
      initialFocus: string;
    if (kind === "experience") {
      const role = newRole();
      role.title = fact("Role");
      role.company = fact("Company");
      d.roles.push(role, newRole());
      entry = role;
      section = "Professional experience";
      startLabel = "Start date";
      endLabel = "End date";
      initialFocus = role.location.fieldId;
    } else if (kind === "education") {
      const education = newEducation();
      education.institution = fact("School");
      d.education.push(education);
      entry = education;
      section = "Education";
      startLabel = "Education start";
      endLabel = "Education end";
      initialFocus = education.qualification.fieldId;
    } else {
      const optional = newOptionalEntry();
      optional.title = fact("Entry");
      entry = optional;
      d.optionalSections.push({
        id: kind,
        kind,
        label: "",
        entries: [optional],
      });
      d.presentation.order.push(kind);
      section = {
        projects: "Projects",
        certifications: "Certifications",
        volunteering: "Volunteering",
        custom: "Custom section",
      }[kind];
      startLabel = "Start";
      endLabel = "End";
      initialFocus = "";
    }
    entry.start = fact({ year: "2018", month: "" });
    entry.end = {
      ...fact({ year: "2021", month: "2" }),
      sourceId: "import",
      sourceClaimId: "end",
      status: "extracted_unconfirmed",
    };
    d.sources.push({
      id: "import",
      kind: "fixture",
      label: "Synthetic date source",
    });
    const original = clone(d),
      originalStart = clone(entry.start);
    const adapter = new MemoryBaseCvAdapter();
    const first = await adapter.save({
      draft: original,
      mode: "autosave",
      expectedRevision: 0,
      requestId: "first",
    });
    let latest = d,
      restore: (draft: BaseDraft) => void = () => {};
    function Surface() {
      const [draft, setDraft] = useState(d);
      restore = setDraft;
      return (
        <LanguageContext.Provider value="en">
          <Editor
            draft={draft}
            issues={[]}
            change={(next) => {
              latest = next;
              setDraft(next);
            }}
          />
        </LanguageContext.Provider>
      );
    }
    function current(draft = latest) {
      return kind === "experience"
        ? draft.roles[0]
        : kind === "education"
          ? draft.education[0]
          : draft.optionalSections.at(-1)!.entries[0];
    }
    const user = userEvent.setup();
    render(<Surface />);
    await user.click(screen.getByText(section, { selector: "summary" }));
    await waitFor(() =>
      expect(document.activeElement).toBe(
        initialFocus
          ? document.getElementById(initialFocus)
          : screen.getByRole("textbox", { name: "Section label" }),
      ),
    );
    const scope =
      kind === "experience" || kind === "education"
        ? document.getElementById(`entry-${entry.id}`)!
        : document.getElementById(`section-${kind}`)!;
    const start = within(scope).getByRole("textbox", { name: startLabel });
    start.focus();
    await user.keyboard("{Alt>}{ArrowDown}{/Alt}");
    expect(screen.getByRole("dialog", { name: startLabel })).toBeTruthy();
    await user.keyboard("{Escape}");
    expect(current().start).toEqual(originalStart);
    expect(latest.roles.map((r) => r.id)).toEqual(
      original.roles.map((r) => r.id),
    );
    await user.click(
      within(scope).getByRole("button", {
        name: `Choose month/year: ${endLabel}`,
      }),
    );
    await user.click(screen.getByRole("button", { name: "May" }));
    expect(current().end.value).toEqual({ year: "2021", month: "5" });
    expect(current().end.status).toBe("user_authored");
    expect(current().end.sourceLineage).toContainEqual({
      sourceId: "import",
      sourceClaimId: "end",
    });
    await user.click(
      within(scope).getByRole("button", {
        name: `Choose month/year: ${endLabel}`,
      }),
    );
    const ongoing = within(scope).getByRole("checkbox", {
      name: kind === "education" ? "Ongoing" : "Present / Ongoing",
    });
    await user.click(ongoing);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(within(scope).queryByRole("textbox", { name: endLabel })).toBeNull();
    expect(document.activeElement).toBe(ongoing);
    expect(current().end.value).toEqual({ year: "2021", month: "5" });
    await user.click(ongoing);
    const end = within(scope).getByRole("textbox", {
      name: endLabel,
    }) as HTMLInputElement;
    expect(end.value).toBe("05/2021");
    await user.clear(end);
    await user.keyboard("2026");
    expect(current().end.value).toEqual({ year: "2026", month: "" });
    await adapter.save({
      draft: latest,
      mode: "autosave",
      expectedRevision: 1,
      requestId: "second",
    });
    const restored = await adapter.restore({
      snapshotId: first.id,
      expectedRevision: 2,
      requestId: "restore",
    });
    await act(async () => restore(restored.draft));
    expect(
      (
        within(scope).getByRole("textbox", {
          name: endLabel,
        }) as HTMLInputElement
      ).value,
    ).toBe("02/2021");
    expect(current(restored.draft).end).toEqual(entry.end);
    expect((await adapter.history()).at(-1)).toEqual(first);
  },
);
