import { useState } from "react";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";
import { App } from "../App";
import { MemoryBaseCvAdapter } from "../base/adapter";
import { applyAnswer } from "../base/enrichment";
import { setContributions } from "../base/editing";
import {
  allFacts,
  blankDraft,
  fact,
  newOptionalEntry,
  newRole,
  type BaseDraft,
} from "../base/model";
import { validateDraft } from "../base/validation";
import { HistoryScreen } from "./BaseScreens";
import { DocumentPreview } from "./DocumentPreview";
import { Editor } from "./Editor";
import { Enrichment } from "./Enrichment";
import { LanguageContext } from "./ui";

const asOf = { year: "2026", month: "10" };
const kinds = ["projects", "certifications", "volunteering", "custom"] as const;
function completeIdentity() {
  const d = blankDraft();
  d.nameParts = { first: "Ana", last: "Popescu" };
  d.name = fact("Ana Popescu");
  d.titles[0] = fact("Analist");
  for (const c of d.contacts)
    c.value = fact(
      c.kind === "email"
        ? "ana@example.test"
        : c.platform === "linkedin"
          ? "https://linkedin.com/in/synthetic"
          : "Synthetic contact",
    );
  return d;
}
function EnrichmentSurface({
  initial,
  changed,
}: {
  initial: BaseDraft;
  changed: (d: BaseDraft) => void;
}) {
  const [draft, setDraft] = useState(initial),
    [editing, setEditing] = useState(false);
  function change(next: BaseDraft) {
    setDraft(next);
    changed(next);
  }
  return (
    <LanguageContext.Provider value="en">
      {editing ? (
        <>
          <Editor draft={draft} issues={[]} change={change} />
          <DocumentPreview draft={draft} asOf={asOf} onEdit={() => {}} />
        </>
      ) : (
        <Enrichment
          draft={draft}
          change={change}
          goEdit={() => setEditing(true)}
          asOf={asOf}
        />
      )}
    </LanguageContext.Provider>
  );
}

it.each(kinds)(
  "edits pending and revisited %s answers in their own preview fields without changing original details",
  async (kind) => {
    const initial = blankDraft(),
      entry = newOptionalEntry();
    entry.title = fact("Synthetic entry");
    entry.details = fact("Original details");
    initial.optionalSections.push({
      id: kind,
      kind,
      label: "",
      entries: [entry],
    });
    initial.presentation.order.push(kind);
    let latest = initial;
    const user = userEvent.setup();
    render(
      <EnrichmentSurface
        initial={initial}
        changed={(d) => {
          latest = d;
        }}
      />,
    );
    const preview = screen.getByRole("complementary", { name: "CV preview" });
    const answer = screen.getByRole("textbox", {
      name: "What were your day-to-day responsibilities?",
    });
    await user.type(answer, "Pending answer");
    const pending = within(preview).getByText("Pending answer");
    expect(pending.getAttribute("role")).toBe("textbox");
    pending.textContent = "Edited pending answer";
    fireEvent.blur(pending);
    expect((answer as HTMLTextAreaElement).value).toBe("Edited pending answer");
    expect(latest.optionalSections.at(-1)!.entries[0].details.value).toBe(
      "Original details",
    );
    await user.keyboard("{Control>}{Enter}{/Control}");
    await user.keyboard("Second answer{Control>}{Enter}{/Control}");
    for (let i = 0; i < 5; i++)
      await user.keyboard("{Control>}{Shift>}j{/Shift}{/Control}");
    const revisited = screen.getByRole("textbox", {
      name: "What were your day-to-day responsibilities?",
    });
    expect((revisited as HTMLTextAreaElement).value).toBe(
      "Edited pending answer",
    );
    await user.clear(revisited);
    await user.type(revisited, "Revised first answer");
    expect(within(preview).queryByText("Edited pending answer")).toBeNull();
    expect(within(preview).getAllByText("Original details")).toHaveLength(1);
    expect(within(preview).getAllByText("Revised first answer")).toHaveLength(
      1,
    );
    await user.keyboard("{Control>}{Enter}{/Control}");
    const updated = latest.optionalSections.at(-1)!.entries[0];
    expect(updated.details).toEqual(entry.details);
    expect(updated.bullets?.map((f) => f.value)).toEqual([
      "Revised first answer",
      "Second answer",
    ]);
    for (const a of latest.answers.filter((a) => a.factId))
      expect(allFacts(latest).find((f) => f.id === a.factId)?.value).toBe(
        a.text,
      );
  },
);

it("shows preview corrections in the rich editor and keeps them when editing formatted contributions", async () => {
  const d = blankDraft(),
    role = newRole();
  role.title = fact("Analyst");
  role.company = fact("Synthetic Co");
  d.roles.push(role);
  const enriched = applyAnswer(
    d,
    {
      id: "answer",
      targetId: role.id,
      question: "context",
      text: "Old wording",
      status: "draft",
      mode: "append",
    },
    role.context.id,
  );
  const initial = setContributions(
    enriched,
    role.id,
    "<p><b>Old wording</b></p>",
  );
  let latest = initial;
  const user = userEvent.setup();
  render(
    <EnrichmentSurface
      initial={initial}
      changed={(next) => {
        latest = next;
      }}
    />,
  );
  const preview = screen.getByRole("complementary", { name: "CV preview" });
  const bullet = within(preview).getByText("Old wording");
  bullet.textContent = "Corrected wording";
  fireEvent.blur(bullet);
  expect(latest.answers[0].factId).toBe(latest.roles[0].bullets[0].id);
  await user.click(
    within(preview).getByRole("button", { name: "Synthetic Co" }),
  );
  await user.click(
    screen.getByText("Professional experience", { selector: "summary" }),
  );
  const rich = screen.getByRole("textbox", { name: "Contributions" });
  expect(rich.textContent).toBe("Corrected wording");
  expect(
    screen.getByRole("complementary", { name: "CV preview" }).textContent,
  ).not.toContain("Old wording");
  rich.innerHTML = "<p><i>Corrected wording</i> retained</p>";
  fireEvent.input(rich);
  expect(latest.roles[0].bullets.map((f) => f.value)).toEqual([
    "Corrected wording retained",
  ]);
  expect(latest.answers[0]).toMatchObject({
    text: "Corrected wording retained",
    factId: latest.roles[0].bullets[0].id,
  });
});

it("reveals missing languages on save, focuses Add, then focuses and explains an omitted proficiency", async () => {
  const adapter = new MemoryBaseCvAdapter();
  await adapter.save({
    draft: completeIdentity(),
    mode: "autosave",
    expectedRevision: 0,
    requestId: "initial",
  });
  window.location.hash = "#base";
  const user = userEvent.setup();
  render(<App adapter={adapter} />);
  await screen.findByRole("textbox", { name: /Prenume/ });
  await user.keyboard("{Control>}s{/Control}");
  const add = await screen.findByRole("button", { name: "Adaugă limbă" });
  await waitFor(() => expect(document.activeElement).toBe(add));
  expect(
    document.getElementById("section-languages")?.hasAttribute("open"),
  ).toBe(true);
  expect(
    screen.getByText("Adaugă cel puțin o limbă și alege nivelul autoevaluat."),
  ).toBeTruthy();
  await user.keyboard("{Enter}");
  await waitFor(() =>
    expect(document.activeElement).toBe(
      screen.getByRole("textbox", { name: "Limbă" }),
    ),
  );
  await user.keyboard("Română{Control>}s{/Control}");
  const level = screen.getByRole("combobox", { name: "Nivel autoevaluat" });
  await waitFor(() => expect(document.activeElement).toBe(level));
  expect(level.getAttribute("aria-invalid")).toBe("true");
  expect(
    screen.getByText("Alege un nivel autoevaluat: Nativ sau A1–C2."),
  ).toBeTruthy();
  await user.selectOptions(level, "Native");
  const preview = screen.getByRole("complementary", {
    name: "Previzualizare CV",
  });
  expect(within(preview).getByText("Nativ")).toBeTruthy();
  await user.keyboard("{Alt>}v{/Alt}");
  expect(within(preview).queryByText("Nativ")).toBeNull();
  await user.click(
    screen.getByRole("button", { name: "Arată: Nivel autoevaluat" }),
  );
  expect(within(preview).getByText("Nativ")).toBeTruthy();
});

it("keeps a legacy language level field stable and hideable when its proficiency fact is created", async () => {
  const initial = blankDraft(),
    entry = newOptionalEntry();
  entry.title = fact("Română");
  initial.optionalSections[0].entries.push(entry);
  function Surface() {
    const [draft, change] = useState(initial);
    return (
      <>
        <Editor draft={draft} change={change} issues={validateDraft(draft)} />
        <DocumentPreview draft={draft} asOf={asOf} onEdit={() => {}} />
      </>
    );
  }
  const user = userEvent.setup();
  render(<Surface />);
  await user.click(screen.getByText("Limbi", { selector: "summary" }));
  const level = screen.getByRole("combobox", { name: "Nivel autoevaluat" });
  const id = level.id;
  level.focus();
  await user.keyboard("{Alt>}v{/Alt}");
  await user.selectOptions(level, "C1");
  expect(level.id).toBe(id);
  const preview = screen.getByRole("complementary", {
    name: "Previzualizare CV",
  });
  expect(within(preview).queryByText("C1")).toBeNull();
  await user.keyboard("{Alt>}v{/Alt}");
  expect(within(preview).getByText("C1")).toBeTruthy();
});

it("reaches section visibility by Tab and toggles it with Enter and Space", async () => {
  const user = userEvent.setup();
  function Surface() {
    const [draft, change] = useState(blankDraft());
    return <Editor draft={draft} change={change} issues={[]} />;
  }
  render(<Surface />);
  await user.click(
    screen.getByText("Structura CV-ului", { selector: "summary" }),
  );
  screen.getByRole("button", { name: "Reordonează: Despre tine" }).focus();
  await user.tab();
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: "Ascunde: Despre tine" }),
  );
  await user.keyboard("{Enter}");
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: "Arată: Despre tine" }),
  );
  await user.keyboard(" ");
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: "Ascunde: Despre tine" }),
  );
});

it.each(kinds)(
  "preserves %s end-date input when ongoing and projects the ongoing state in live and saved previews",
  async (kind) => {
    const initial = blankDraft(),
      entry = newOptionalEntry();
    entry.title = fact("Synthetic entry");
    entry.start = fact({ year: "2020", month: "" });
    initial.optionalSections.push({
      id: kind,
      kind,
      label: "",
      entries: [entry],
    });
    initial.presentation.order.push(kind);
    initial.language = "en";
    let latest = initial;
    function Surface() {
      const [draft, setDraft] = useState(initial);
      return (
        <LanguageContext.Provider value="en">
          <Editor
            draft={draft}
            issues={validateDraft(draft)}
            change={(next) => {
              setDraft(next);
              latest = next;
            }}
          />
          <DocumentPreview draft={draft} asOf={asOf} onEdit={() => {}} />
          <DocumentPreview draft={draft} asOf={asOf} />
        </LanguageContext.Provider>
      );
    }
    const user = userEvent.setup();
    render(<Surface />);
    const section = document.getElementById(`section-${kind}`)!;
    await user.click(section.querySelector("summary")!);
    await user.type(screen.getByRole("textbox", { name: "End" }), "02/");
    await user.click(
      screen.getByRole("checkbox", { name: "Present / Ongoing" }),
    );
    expect(screen.queryByRole("textbox", { name: "End" })).toBeNull();
    const savedEntry = latest.optionalSections.at(-1)!.entries[0];
    expect(savedEntry.end.value).toEqual({ year: "", month: "2" });
    expect(
      validateDraft(latest).some((i) => i.field === savedEntry.end.fieldId),
    ).toBe(false);
    for (const preview of screen.getAllByRole("complementary", {
      name: "CV preview",
    }))
      expect(within(preview).getByText(/Ongoing$/)).toBeTruthy();
    await user.click(
      screen.getByRole("checkbox", { name: "Present / Ongoing" }),
    );
    expect(
      (screen.getByRole("textbox", { name: "End" }) as HTMLInputElement).value,
    ).toBe("02/");
    expect(validateDraft(latest)).toContainEqual({
      field: savedEntry.end.fieldId,
      code: "date",
    });
  },
);

it("labels autosave, explicit save and restore snapshots distinctly in history", async () => {
  const adapter = new MemoryBaseCvAdapter(),
    draft = completeIdentity(),
    entry = newOptionalEntry();
  entry.title = fact("Română");
  entry.proficiency = fact("Native");
  draft.optionalSections[0].entries.push(entry);
  const first = await adapter.save({
    draft,
    mode: "autosave",
    expectedRevision: 0,
    requestId: "auto",
  });
  draft.titles[0] = fact("Updated title");
  await adapter.save({
    draft,
    mode: "checkpoint",
    expectedRevision: 1,
    requestId: "save",
  });
  const restored = await adapter.restore({
    snapshotId: first.id,
    expectedRevision: 2,
    requestId: "restore",
  });
  render(
    <LanguageContext.Provider value="en">
      <HistoryScreen
        draft
        versions={await adapter.history()}
        head={restored}
        inspected={null}
        setInspected={() => {}}
        restore={() => {}}
        go={() => {}}
        asOf={asOf}
      />
    </LanguageContext.Provider>,
  );
  const cards = Array.from(document.querySelectorAll(".version-card"));
  expect(cards[0].textContent).toContain("Restore · new copy");
  expect(cards[1].textContent).toContain("Explicit save");
  expect(cards[2].textContent).toContain("Autosave");
  expect(cards[2].textContent).not.toContain("Explicit save");
});
