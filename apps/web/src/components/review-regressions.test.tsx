import { useState } from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { App } from "../App";
import { MemoryBaseCvAdapter } from "../base/adapter";
import {
  saveAnswer,
  addAnswerToCv,
  enrichmentTarget,
} from "../base/enrichment";
import {
  patchFact,
  readContributions,
  setContributions,
} from "../base/editing";
import { maraReviewDraft } from "../base/fixture";
import {
  allFacts,
  blankDraft,
  clone,
  fact,
  newEducation,
  newOptionalEntry,
  newRole,
  type BaseDraft,
} from "../base/model";
import { validateDraft } from "../base/validation";
import { HistoryScreen } from "./BaseScreens";
import { DocumentPreview } from "./DocumentPreview";
import { Editor } from "./Editor";
import { Enrichment } from "./Enrichment";
import { ChipInput } from "./InlineControls";
import { Review } from "./Review";
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

function saveAndAdd(
  d: BaseDraft,
  targetId: string,
  text: string,
  id = "answer",
  question: "context" | "tools" = "context",
) {
  const target = enrichmentTarget(d, targetId)!;
  const saved = saveAnswer(
    d,
    {
      id,
      targetId,
      question,
      questionText: `Full ${question} question?`,
      text,
      status: "draft",
    },
    target.field.id,
  );
  return addAnswerToCv(saved, id, target.field.id);
}
function textBox(preview: HTMLElement, value: string) {
  return within(preview)
    .getAllByRole("textbox")
    .find((el) => el.textContent === value)!;
}
it.each(["role", ...kinds] as const)(
  "saves %s career Q&A independently and adds, updates and removes a CV copy only explicitly",
  async (kind) => {
    const initial = blankDraft();
    let targetId: string;
    if (kind === "role") {
      const r = newRole();
      r.title = fact("Role");
      r.company = fact("Company");
      initial.roles.push(r);
      targetId = r.id;
    } else {
      const e = newOptionalEntry();
      e.title = fact("Entry");
      initial.optionalSections.push({
        id: kind,
        kind,
        label: "",
        entries: [e],
      });
      initial.presentation.order.push(kind);
      targetId = e.id;
    }
    enrichmentTarget(initial, targetId)!.field.value = "Original details";
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
    const question = screen.getByRole("textbox", {
      name: "What were your day-to-day responsibilities?",
    });
    await user.type(question, "Pending");
    const career = screen.getByRole("region", { name: "Career context" });
    const pending = within(career).getByRole("textbox", {
      name: "Answer preview",
    });
    pending.focus();
    pending.innerHTML = "First<br>Second";
    fireEvent.input(pending);
    expect(document.activeElement).toBe(pending);
    expect(latest.roles).toEqual(initial.roles);
    expect(latest.optionalSections).toEqual(initial.optionalSections);
    await user.keyboard("{Control>}{Enter}{/Control}");
    expect(
      screen.getByRole("textbox", {
        name: "What did you do yourself, with what autonomy?",
      }),
    ).toBe(document.activeElement);
    expect(latest.answers[0]).toMatchObject({
      questionText: "What were your day-to-day responsibilities?",
      text: "First\nSecond",
      status: "confirmed",
    });
    expect(enrichmentTarget(latest, targetId)!.entry.bullets ?? []).toEqual([]);
    const cv = screen.getByRole("complementary", { name: "CV preview" });
    expect(cv.textContent).not.toContain("First");
    await user.click(within(career).getByRole("button", { name: "Add to CV" }));
    const fieldId = latest.answers[0].cvFieldId;
    expect(enrichmentTarget(latest, targetId)!.entry.bullets).toHaveLength(1);
    const copy = textBox(cv, "First\nSecond");
    copy.textContent = "Independent CV wording";
    fireEvent.input(copy);
    expect(latest.answers[0].text).toBe("First\nSecond");
    await user.click(
      within(career).getByRole("button", { name: "Edit answer" }),
    );
    const revising = screen.getByRole("textbox", {
      name: "What were your day-to-day responsibilities?",
    });
    await user.clear(revising);
    await user.type(revising, "Revised context{Control>}{Enter}{/Control}");
    expect(enrichmentTarget(latest, targetId)!.entry.bullets![0].value).toBe(
      "Independent CV wording",
    );
    await user.click(
      within(career).getByRole("button", { name: "Update in CV" }),
    );
    expect(enrichmentTarget(latest, targetId)!.entry.bullets).toHaveLength(1);
    expect(enrichmentTarget(latest, targetId)!.entry.bullets![0]).toMatchObject(
      { fieldId, value: "Revised context" },
    );
    await user.click(
      within(career).getByRole("button", { name: "Remove from CV" }),
    );
    expect(latest.answers[0].text).toBe("Revised context");
    expect(latest.answers[0].questionText).toBe(
      "What were your day-to-day responsibilities?",
    );
    expect(enrichmentTarget(latest, targetId)!.field.value).toBe(
      "Original details",
    );
    expect(enrichmentTarget(latest, targetId)!.entry.bullets).toEqual([]);
    const activePreview = within(career).getByRole("textbox", {
      name: "Answer preview",
    });
    activePreview.focus();
    await user.keyboard("{Control>}{Shift>}k{/Shift}{/Control}");
    expect(
      latest.answers.some(
        (a) => a.question === "ownership" && a.status === "unknown",
      ),
    ).toBe(true);
    textBox(cv, "Original details").focus();
    await user.keyboard("{Control>}{Shift>}j{/Shift}{/Control}");
    expect(
      latest.answers.some(
        (a) => a.question === "tools" && a.status === "skipped",
      ),
    ).toBe(true);
  },
);

it("shows factual preview corrections in the rich editor while preserving the independent answer", async () => {
  const d = blankDraft(),
    r = newRole();
  r.title = fact("Analyst");
  r.company = fact("Synthetic Co");
  d.roles.push(r);
  const initial = saveAndAdd(d, r.id, "Old wording");
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
  const cv = screen.getByRole("complementary", { name: "CV preview" });
  const copy = textBox(cv, "Old wording");
  copy.textContent = "Corrected wording";
  fireEvent.input(copy);
  expect(latest.answers[0].text).toBe("Old wording");
  await user.click(within(cv).getByRole("button", { name: "Synthetic Co" }));
  await waitFor(() =>
    expect(document.activeElement).toBe(
      screen.getByRole("textbox", { name: /^Company/ }),
    ),
  );
  const rich = screen.getByRole("textbox", { name: "Contributions" });
  expect(rich.textContent).toBe("Corrected wording");
  rich.querySelector<HTMLElement>("[data-contribution]")!.innerHTML =
    "<i>Corrected wording</i> retained";
  fireEvent.input(rich);
  expect(latest.roles[0].bullets.map((f) => f.value)).toEqual([
    "Corrected wording retained",
  ]);
  expect(latest.answers[0].text).toBe("Old wording");
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
    await waitFor(() =>
      expect(document.activeElement).toBe(
        within(section).getByRole("textbox", { name: "Section label" }),
      ),
    );
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

it("keeps explicit associations through native rich insertion and later context revision", async () => {
  const d = completeIdentity(),
    role = newRole();
  role.title = fact("Analist");
  role.company = fact("Synthetic Co");
  d.roles.push(role);
  let initial = saveAndAdd(d, role.id, "Answer A", "a");
  initial = saveAndAdd(initial, role.id, "Answer B", "b", "tools");
  const adapter = new MemoryBaseCvAdapter();
  await adapter.save({
    draft: initial,
    expectedRevision: 0,
    mode: "autosave",
    requestId: "initial",
  });
  window.location.hash = "#base";
  const user = userEvent.setup();
  render(<App adapter={adapter} />);
  await user.click(
    await screen.findByText("Experiență profesională", { selector: "summary" }),
  );
  const rich = screen.getByRole("textbox", { name: "Contribuții" });
  const leading = document.createElement("p");
  leading.textContent = "New";
  rich.prepend(leading);
  fireEvent.input(rich);
  await user.click(screen.getByRole("link", { name: "Îmbunătățește" }));
  const answer = await screen.findByRole("textbox", {
    name: "Full context question?",
  });
  expect((answer as HTMLTextAreaElement).value).toBe("Answer A");
  await user.clear(answer);
  await user.type(answer, "Revised A{Control>}{Enter}{/Control}");
  const cv = screen.getByRole("complementary", { name: "Previzualizare CV" });
  expect(textBox(cv, "Answer A")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Actualizează în CV" }));
  expect(textBox(cv, "Revised A")).toBeTruthy();
  expect(textBox(cv, "Answer B")).toBeTruthy();
  await waitFor(
    async () => {
      const saved = (await adapter.load())!.draft;
      expect(saved.roles[0].bullets.map((f) => f.value)).toEqual([
        "New",
        "Revised A",
        "Answer B",
      ]);
      expect(saved.answers.find((a) => a.id === "b")!.cvFieldId).toBe(
        initial.answers.find((a) => a.id === "b")!.cvFieldId,
      );
    },
    { timeout: 2000 },
  );
});

it("saves education with an inactive partial end date and focuses that retained date when ongoing is cleared", async () => {
  const d = completeIdentity(),
    education = newEducation(),
    language = newOptionalEntry();
  education.institution = fact("Synthetic University");
  education.start = fact({ year: "2020", month: "" });
  education.end = fact({ year: "", month: "2" });
  d.education.push(education);
  language.title = fact("Română");
  language.proficiency = fact("Native");
  d.optionalSections[0].entries.push(language);
  const adapter = new MemoryBaseCvAdapter();
  await adapter.save({
    draft: d,
    expectedRevision: 0,
    mode: "autosave",
    requestId: "initial",
  });
  window.location.hash = "#base";
  const user = userEvent.setup();
  render(<App adapter={adapter} />);
  await user.click(await screen.findByText("Studii", { selector: "summary" }));
  await user.click(screen.getByRole("checkbox", { name: "În curs" }));
  await user.keyboard("{Control>}s{/Control}");
  await waitFor(async () =>
    expect((await adapter.load())!.reason).toBe("save"),
  );
  expect(screen.queryByRole("textbox", { name: "Sfârșit studii" })).toBeNull();
  expect((await adapter.load())!.draft.education[0].end.value).toEqual({
    year: "",
    month: "2",
  });
  await user.click(screen.getByRole("checkbox", { name: "În curs" }));
  await user.keyboard("{Control>}s{/Control}");
  const end = screen.getByRole("textbox", { name: "Sfârșit studii" });
  await waitFor(() => expect(document.activeElement).toBe(end));
  expect((end as HTMLInputElement).value).toBe("02/");
  expect(end.getAttribute("aria-invalid")).toBe("true");
});

it("refreshes History after autosave and ignores an older history response arriving later", async () => {
  const adapter = new MemoryBaseCvAdapter();
  await adapter.save({
    draft: completeIdentity(),
    expectedRevision: 0,
    mode: "autosave",
    requestId: "initial",
  });
  const history = adapter.history.bind(adapter);
  let releaseHistory: () => void = () => {};
  vi.spyOn(adapter, "history").mockImplementationOnce(async () => {
    const older = await history();
    await new Promise<void>((resolve) => {
      releaseHistory = resolve;
    });
    return older;
  });
  window.location.hash = "#base";
  const user = userEvent.setup();
  render(<App adapter={adapter} />);
  const first = await screen.findByRole("textbox", { name: /Prenume/ });
  fireEvent.change(first, { target: { value: "Mira" } });
  await user.click(screen.getByRole("button", { name: "Istoric" }));
  await screen.findByRole(
    "button",
    { name: "Inspectează v2" },
    { timeout: 2000 },
  );
  await act(async () => releaseHistory());
  await user.click(screen.getByRole("button", { name: "Inspectează v2" }));
  const preview = screen.getByRole("complementary", {
    name: "Previzualizare CV",
  });
  expect(within(preview).getByText("Mira Popescu")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Inspectează v1" })).toBeTruthy();
  expect((await adapter.load())!.revision).toBe(2);
});

function completedDraft() {
  const d = completeIdentity(),
    language = newOptionalEntry();
  language.title = fact("Română");
  language.proficiency = fact("Native");
  d.optionalSections[0].entries.push(language);
  return d;
}

it.each(["role", ...kinds] as const)(
  "publishes %s CV edits and career-context preview edits before save without coupling them",
  async (kind) => {
    const d = completedDraft();
    let targetId: string;
    if (kind === "role") {
      const r = newRole();
      r.title = fact("Analist");
      r.company = fact("Synthetic Co");
      d.roles.push(r);
      targetId = r.id;
    } else {
      const e = newOptionalEntry();
      e.title = fact("Entry");
      d.optionalSections.push({ id: kind, kind, label: "", entries: [e] });
      d.presentation.order.push(kind);
      targetId = e.id;
    }
    enrichmentTarget(d, targetId)!.field.value = "Original context";
    const initial = saveAndAdd(
      d,
      targetId,
      "Original answer",
      "tools-answer",
      "tools",
    );
    const adapter = new MemoryBaseCvAdapter();
    await adapter.save({
      draft: initial,
      expectedRevision: 0,
      requestId: "initial",
    });
    window.location.hash = "#enrich";
    const user = userEvent.setup();
    render(<App adapter={adapter} />);
    await screen.findByRole("textbox", {
      name: "Care erau responsabilitățile tale de zi cu zi?",
    });
    const cv = screen.getByRole("complementary", { name: "Previzualizare CV" });
    const context = textBox(cv, "Original context");
    context.focus();
    context.textContent = "";
    fireEvent.input(context);
    expect(context.isConnected).toBe(true);
    context.innerHTML = "First<br>Second";
    fireEvent.input(context);
    expect(document.activeElement).toBe(context);
    await waitFor(
      async () =>
        expect(
          enrichmentTarget((await adapter.load())!.draft, targetId)!.field
            .value,
        ).toBe("First\nSecond"),
      { timeout: 2000 },
    );
    const copy = textBox(cv, "Original answer");
    copy.focus();
    copy.innerHTML = "Updated<div>Answer</div>";
    fireEvent.input(copy);
    await user.keyboard("{Control>}s{/Control}");
    await waitFor(async () => {
      const saved = (await adapter.load())!;
      expect(saved.reason).toBe("save");
      expect(
        enrichmentTarget(saved.draft, targetId)!.entry.bullets![0].value,
      ).toBe("Updated\nAnswer");
      expect(
        saved.draft.answers.find((a) => a.id === "tools-answer")!.text,
      ).toBe("Original answer");
    });
    const pending = screen.getByRole("textbox", {
      name: "Previzualizare răspuns",
    });
    pending.focus();
    pending.innerHTML = "Pending<br>Answer";
    fireEvent.input(pending);
    expect(document.activeElement).toBe(pending);
    await user.keyboard("{Control>}s{/Control}");
    await waitFor(async () =>
      expect(
        (await adapter.load())!.draft.answers.find(
          (a) => a.question === "context",
        )!.text,
      ).toBe("Pending\nAnswer"),
    );
    await user.keyboard("{Control>}{Enter}{/Control}");
    expect(
      await screen.findByRole("textbox", {
        name: "Ce ai făcut tu, cu ce autonomie?",
      }),
    ).toBe(document.activeElement);
    expect(screen.queryByText(/Destinația s-a schimbat/)).toBeNull();
    await waitFor(
      async () => {
        const saved = (await adapter.load())!.draft;
        expect(
          saved.answers.find((a) => a.question === "context")!.status,
        ).toBe("confirmed");
        expect(
          enrichmentTarget(saved, targetId)!.entry.bullets!.map((f) => f.value),
        ).toEqual(["Updated\nAnswer"]);
      },
      { timeout: 2000 },
    );
  },
);

it.each(["professionalSkills", "technicalSkills"] as const)(
  "saves active existing and new %s text without blur, retaining focus and Escape cancellation",
  async (kind) => {
    const d = completedDraft();
    const original = fact("SQL");
    d[kind] = [original];
    const adapter = new MemoryBaseCvAdapter();
    const initial = await adapter.save({
      draft: d,
      expectedRevision: 0,
      requestId: "initial",
    });
    window.location.hash = "#base";
    const user = userEvent.setup();
    render(<App adapter={adapter} />);
    await user.click(
      await screen.findByText(
        kind === "technicalSkills"
          ? "Competențe tehnice"
          : "Competențe profesionale",
        { selector: "summary" },
      ),
    );
    const input = screen.getByRole("textbox", {
      name:
        kind === "technicalSkills"
          ? "Competențe tehnice"
          : "Competențe profesionale",
    });
    await waitFor(() => expect(document.activeElement).toBe(input));
    await user.click(screen.getByRole("button", { name: "SQL" }));
    const edit = screen.getByRole("textbox", { name: "Editează competența" });
    for (const [mode, value] of [
      ["shortcut", "PostgreSQL"],
      ["autosave", "Postgres"],
      ["button", "PostgreSQL 17"],
    ] as const) {
      fireEvent.change(edit, { target: { value } });
      if (mode === "shortcut") await user.keyboard("{Control>}s{/Control}");
      if (mode === "button")
        fireEvent.click(screen.getByRole("button", { name: /Salvează acum/ }));
      await waitFor(
        async () => {
          const saved = (await adapter.load())!;
          expect(saved.draft[kind].map((f) => f.value)).toEqual([value]);
          expect(saved.draft[kind][0].fieldId).toBe(original.fieldId);
          expect(saved.reason).toBe(mode === "autosave" ? "autosave" : "save");
        },
        { timeout: 2000 },
      );
      expect(document.activeElement).toBe(edit);
    }
    await user.keyboard("{Escape}");
    expect(document.activeElement).toBe(input);
    await waitFor(
      async () =>
        expect((await adapter.load())!.draft[kind]).toEqual([original]),
      { timeout: 2000 },
    );
    for (const [mode, value] of [
      ["shortcut", "React"],
      ["autosave", "React Native"],
      ["button", "React 19"],
    ] as const) {
      fireEvent.change(input, { target: { value } });
      if (mode === "shortcut") await user.keyboard("{Meta>}s{/Meta}");
      if (mode === "button")
        fireEvent.click(screen.getByRole("button", { name: /Salvează acum/ }));
      await waitFor(
        async () => {
          const saved = (await adapter.load())!;
          expect(saved.draft[kind].map((f) => f.value)).toEqual(["SQL", value]);
          expect(saved.reason).toBe(mode === "autosave" ? "autosave" : "save");
        },
        { timeout: 2000 },
      );
      expect(document.activeElement).toBe(input);
    }
    await user.keyboard("{Escape}");
    expect(document.activeElement).toBe(input);
    await waitFor(
      async () =>
        expect((await adapter.load())!.draft[kind]).toEqual([original]),
      { timeout: 2000 },
    );
    expect((await adapter.history()).at(-1)).toEqual(initial);
  },
);

it.each(["professionalSkills", "technicalSkills"] as const)(
  "undoes a %s edit or addition on the first click despite chip finalization",
  async (kind) => {
    const d = completedDraft();
    const original = fact("SQL");
    d[kind] = [original];
    const adapter = new MemoryBaseCvAdapter();
    await adapter.save({ draft: d, expectedRevision: 0, requestId: "initial" });
    const save = vi.spyOn(adapter, "save");
    window.location.hash = "#base";
    const user = userEvent.setup();
    render(<App adapter={adapter} />);
    const label =
      kind === "technicalSkills"
        ? "Competențe tehnice"
        : "Competențe profesionale";
    await user.click(await screen.findByText(label, { selector: "summary" }));
    const input = screen.getByRole("textbox", {
      name: label,
    }) as HTMLInputElement;
    await waitFor(() => expect(document.activeElement).toBe(input));
    const undo = screen.getByRole("button", {
      name: "Anulează ultima modificare",
    });
    await user.click(screen.getByRole("button", { name: "SQL" }));
    const edit = screen.getByRole("textbox", {
      name: "Editează competența",
    }) as HTMLInputElement;
    edit.setSelectionRange(0, edit.value.length);
    await user.paste("PostgreSQL");
    await user.click(undo);
    expect(screen.getByRole("button", { name: "SQL" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "PostgreSQL" })).toBeNull();
    input.focus();
    await user.paste("React");
    await user.click(undo);
    expect(screen.queryByRole("button", { name: "React" })).toBeNull();
    expect(input.value).toBe("");
    input.focus();
    await user.paste("Node");
    await user.keyboard("{Enter}");
    expect(screen.getByRole("button", { name: "Node" })).toBeTruthy();
    expect(input.value).toBe("");
    expect(document.activeElement).toBe(input);
    await user.click(undo);
    expect(screen.queryByRole("button", { name: "Node" })).toBeNull();
    expect(undo.hasAttribute("disabled")).toBe(true);
    await user.click(screen.getByRole("button", { name: /Salvează acum/ }));
    await waitFor(() =>
      expect(save.mock.calls.at(-1)?.[0].draft[kind]).toEqual([original]),
    );
  },
);

it.each(["role", ...kinds] as const)(
  "requires explicit reselection after Undo removes the selected %s entry, retaining its answer separately",
  async (kind) => {
    const d = completedDraft();
    let remainingId: string;
    if (kind === "role") {
      const role = newRole();
      role.title = fact("Remaining role");
      role.company = fact("Company");
      d.roles.push(role);
      remainingId = role.id;
    } else {
      const entry = newOptionalEntry();
      entry.title = fact("Remaining entry");
      d.optionalSections.push({ id: kind, kind, label: "", entries: [entry] });
      d.presentation.order.push(kind);
      remainingId = entry.id;
    }
    const adapter = new MemoryBaseCvAdapter();
    const first = await adapter.save({
      draft: d,
      expectedRevision: 0,
      requestId: "initial",
    });
    window.location.hash = "#base";
    const user = userEvent.setup();
    render(<App adapter={adapter} />);
    const label = {
      role: "Experiență profesională",
      projects: "Proiecte",
      certifications: "Certificări",
      volunteering: "Voluntariat",
      custom: "Secțiune proprie",
    }[kind];
    await user.click(await screen.findByText(label, { selector: "summary" }));
    await user.click(
      screen.getByRole("button", {
        name: kind === "role" ? "Adaugă experiență" : "Adaugă intrare",
      }),
    );
    await user.click(screen.getByRole("link", { name: "Îmbunătățește" }));
    const select = screen.getByRole("combobox", {
      name: "Intrare",
    }) as HTMLSelectElement;
    const removedId = Array.from(select.options).find(
      (option) => option.value !== remainingId,
    )!.value;
    await user.selectOptions(select, removedId);
    await user.click(
      screen.getByRole("button", { name: "Anulează ultima modificare" }),
    );
    expect(select.value).toBe("");
    expect(select.selectedOptions[0].textContent).toBe("Selectează o intrare");
    const question = screen.getByRole("textbox", {
      name: "Care erau responsabilitățile tale de zi cu zi?",
    });
    fireEvent.change(question, {
      target: { value: "Answer for the removed entry" },
    });
    await user.click(
      screen.getByRole("button", { name: /Salvează și continuă/ }),
    );
    expect(screen.getByRole("alert").textContent).toContain(
      "Destinația s-a schimbat",
    );
    await user.selectOptions(select, remainingId);
    expect((question as HTMLTextAreaElement).value).toBe("");
    fireEvent.change(question, {
      target: { value: "Answer for the remaining entry" },
    });
    await user.click(
      screen.getByRole("button", { name: /Salvează și continuă/ }),
    );
    expect(screen.queryByText(/Destinația s-a schimbat/)).toBeNull();
    await user.click(screen.getByRole("button", { name: "Adaugă în CV" }));
    await user.keyboard("{Control>}s{/Control}");
    await waitFor(
      async () => {
        const saved = (await adapter.load())!.draft;
        expect(enrichmentTarget(saved, removedId)).toBeNull();
        expect(
          saved.answers.find((a) => a.targetId === removedId),
        ).toMatchObject({
          text: "Answer for the removed entry",
          status: "draft",
        });
        expect(
          saved.answers.find((a) => a.targetId === remainingId),
        ).toMatchObject({
          text: "Answer for the remaining entry",
          status: "confirmed",
        });
        expect(
          enrichmentTarget(saved, remainingId)!.entry.bullets!.map(
            (f) => f.value,
          ),
        ).toEqual(["Answer for the remaining entry"]);
      },
      { timeout: 2000 },
    );
    expect((await adapter.history()).at(-1)).toEqual(first);
  },
);

it.each(["role", ...kinds] as const)(
  "refreshes an authorized Undo signature for one %s target through context save and explicit CV add/update",
  async (kind) => {
    const d = completedDraft();
    let targetId: string;
    if (kind === "role") {
      const role = newRole();
      role.title = fact("Role");
      role.company = fact("Company");
      d.roles.push(role);
      targetId = role.id;
    } else {
      const entry = newOptionalEntry();
      entry.title = fact("Entry");
      d.optionalSections.push({ id: kind, kind, label: "", entries: [entry] });
      d.presentation.order.push(kind);
      targetId = entry.id;
    }
    enrichmentTarget(d, targetId)!.field.value = "Original context";
    const original = clone(enrichmentTarget(d, targetId)!.field);
    const adapter = new MemoryBaseCvAdapter();
    const first = await adapter.save({
      draft: d,
      expectedRevision: 0,
      requestId: "initial",
    });
    window.location.hash = "#enrich";
    const user = userEvent.setup();
    render(<App adapter={adapter} />);
    const question = await screen.findByRole("textbox", {
      name: "Care erau responsabilitățile tale de zi cu zi?",
    });
    fireEvent.change(question, { target: { value: "Reusable answer" } });
    const preview = screen.getByRole("complementary", {
      name: "Previzualizare CV",
    });
    async function editAndUndo() {
      const context = textBox(preview, "Original context");
      context.textContent = "Local correction";
      fireEvent.input(context);
      await user.click(
        screen.getByRole("button", { name: "Anulează ultima modificare" }),
      );
      expect(textBox(preview, "Original context")).toBeTruthy();
    }
    await editAndUndo();
    await user.click(
      screen.getByRole("button", { name: /Salvează și continuă/ }),
    );
    expect(screen.queryByText(/Destinația s-a schimbat/)).toBeNull();
    await editAndUndo();
    await user.click(screen.getByRole("button", { name: "Adaugă în CV" }));
    expect(textBox(preview, "Reusable answer")).toBeTruthy();
    await user.click(
      screen.getByRole("button", { name: "Editează răspunsul" }),
    );
    fireEvent.change(
      screen.getByRole("textbox", {
        name: "Care erau responsabilitățile tale de zi cu zi?",
      }),
      { target: { value: "Revised context answer" } },
    );
    await user.click(
      screen.getByRole("button", { name: /Salvează și continuă/ }),
    );
    expect(textBox(preview, "Reusable answer")).toBeTruthy();
    await editAndUndo();
    await user.click(
      screen.getByRole("button", { name: "Actualizează în CV" }),
    );
    expect(screen.queryByText(/Destinația s-a schimbat/)).toBeNull();
    await user.keyboard("{Control>}s{/Control}");
    await waitFor(
      async () => {
        const saved = (await adapter.load())!.draft;
        const destination = enrichmentTarget(saved, targetId)!;
        expect(destination.field).toEqual(original);
        expect(destination.entry.bullets!.map((f) => f.value)).toEqual([
          "Revised context answer",
        ]);
        expect(saved.answers).toHaveLength(1);
        expect(saved.answers[0].text).toBe("Revised context answer");
        expect(saved.answers[0].cvFieldId).toBe(
          destination.entry.bullets![0].fieldId,
        );
        expect(
          saved.sources.filter((s) => s.kind === "answer").map((s) => s.text),
        ).toEqual(["Reusable answer", "Revised context answer"]);
      },
      { timeout: 2000 },
    );
    expect((await adapter.history()).at(-1)).toEqual(first);
  },
);

it("retains a genuinely stale destination signature after a later local preview edit and Undo", async () => {
  const d = blankDraft(),
    role = newRole();
  role.title = fact("Role");
  role.company = fact("Company");
  role.context = fact("Original context");
  d.roles.push(role);
  let externalChange: (next: BaseDraft) => void = () => {};
  let undo: () => void = () => {};
  let latest = d;
  function Surface() {
    const [draft, setDraft] = useState(d);
    const [undoFrom, setUndoFrom] = useState<BaseDraft | null>(null);
    externalChange = setDraft;
    undo = () => {
      setUndoFrom(draft);
      setDraft(changed);
    };
    return (
      <LanguageContext.Provider value="en">
        <Enrichment
          draft={draft}
          undoFrom={undoFrom}
          change={(next) => {
            latest = next;
            setDraft(next);
          }}
          goEdit={() => {}}
          asOf={asOf}
        />
      </LanguageContext.Provider>
    );
  }
  const user = userEvent.setup();
  render(<Surface />);
  await user.type(
    screen.getByRole("textbox", {
      name: "What were your day-to-day responsibilities?",
    }),
    "Retained answer",
  );
  const changed = patchFact(
    latest,
    latest.roles[0].context,
    "External context",
  );
  await act(async () => externalChange(changed));
  const context = within(
    screen.getByRole("complementary", { name: "CV preview" }),
  ).getByText("External context");
  context.textContent = "Later local edit";
  fireEvent.input(context);
  await act(async () => undo());
  await user.click(screen.getByRole("button", { name: /Save and next/ }));
  expect(screen.getByRole("alert").textContent).toContain("The target changed");
  expect(latest.roles[0].bullets).toEqual([]);
  expect(latest.answers[0].text).toBe("Retained answer");
});

it("inspects autosaved extracted text, dates, pending summary and formatted contributions without attesting them", async () => {
  const d = maraReviewDraft();
  d.summary.text = "Pending own summary";
  d.summary.approval = "pending";
  d.roles[0].start.status = "extracted_unconfirmed";
  d.roles[0].ongoing.value = true;
  d.roles[0].ongoing.status = "extracted_unconfirmed";
  d.roles[0].bullets[0].status = "extracted_unconfirmed";
  d.presentation.contributionHtml = {
    [d.roles[0].id]: `<p><b>${d.roles[0].bullets[0].value}</b></p>`,
  };
  const adapter = new MemoryBaseCvAdapter();
  const saved = await adapter.save({
    draft: d,
    mode: "autosave",
    expectedRevision: 0,
    requestId: "mara",
  });
  const original = clone(saved);
  const unconfirmed = allFacts(d).find(
    (f) => f.sourceClaimId === "claim_resp_a",
  )!;
  render(
    <LanguageContext.Provider value="en">
      <HistoryScreen
        draft
        versions={[saved]}
        head={saved}
        inspected={saved}
        setInspected={() => {}}
        restore={() => {}}
        go={() => {}}
        asOf={asOf}
      />
    </LanguageContext.Provider>,
  );
  const preview = screen.getByRole("complementary", { name: "CV preview" });
  expect(preview.textContent).toContain(unconfirmed.value);
  expect(preview.textContent).toContain("Pending own summary");
  expect(preview.textContent).toContain(d.roles[0].start.value.year);
  expect(preview.textContent).toContain("Present");
  expect(preview.querySelector("b")?.textContent).toBe(
    d.roles[0].bullets[0].value,
  );
  expect(preview.textContent).not.toContain(d.referenceProse[0].text);
  expect(await adapter.load()).toEqual(original);
  expect(saved).toEqual(original);
});

it.each(["Professional skills", "Technical skills"])(
  "respects selections and carets when pasting into %s",
  async (label) => {
    let values: string[] = [];
    function Surface() {
      const [items, setItems] = useState<ReturnType<typeof fact<string>>[]>([]);
      return (
        <LanguageContext.Provider value="en">
          <ChipInput
            label={label}
            items={items}
            change={(next) => {
              values = next.map((f) => f.value);
              setItems(next);
            }}
          />
        </LanguageContext.Provider>
      );
    }
    const user = userEvent.setup();
    render(<Surface />);
    const input = screen.getByRole("textbox", {
      name: label,
    }) as HTMLInputElement;
    await user.type(input, "Java");
    input.setSelectionRange(0, 4);
    await user.paste("React, Node");
    expect(values).toEqual(["React", "Node"]);
    await user.type(input, "TypeScript");
    input.setSelectionRange(4, 4);
    await user.paste("Safe, Java");
    expect(values).toEqual(["React", "Node", "TypeSafe", "JavaScript"]);
    await user.type(input, "BeforeAfter");
    input.setSelectionRange(0, 6);
    await user.paste("One\nTwo");
    expect(values).toEqual([
      "React",
      "Node",
      "TypeSafe",
      "JavaScript",
      "One",
      "TwoAfter",
    ]);
  },
);

it("reviews a valid authored checkpoint without requesting confirmation and still flags incompleteness or extracted facts", async () => {
  const adapter = new MemoryBaseCvAdapter(),
    d = completedDraft();
  await adapter.save({
    draft: d,
    expectedRevision: 0,
    requestId: "checkpoint",
  });
  window.location.hash = "#review";
  render(<App adapter={adapter} />);
  const heading = await screen.findByRole("heading", { name: "Conținut" });
  const content = within(heading.closest("section")!);
  expect(content.getByText("Informații auto-declarate")).toBeTruthy();
  expect(content.queryByText(/așteaptă confirmarea/)).toBeNull();
});

it.each(["incomplete", "extracted"] as const)(
  "flags %s content using current Review semantics",
  (state) => {
    const d = completedDraft();
    if (state === "incomplete") d.titles[0].value = "";
    else d.titles[0].status = "extracted_unconfirmed";
    render(
      <LanguageContext.Provider value="en">
        <Review draft={d} edit={() => {}} enrich={() => {}} />
      </LanguageContext.Provider>,
    );
    const content = within(
      screen.getByRole("heading", { name: "Content" }).closest("section")!,
    );
    expect(content.getByText("Needs action")).toBeTruthy();
    expect(
      content.getByText(
        state === "incomplete"
          ? "1 fields need completion."
          : "1 facts need review.",
      ),
    ).toBeTruthy();
  },
);

it("reveals and marks the combined Contributions control after a preview copy is cleared, preserving its saved Q&A", async () => {
  const d = completedDraft(),
    r = newRole();
  r.title = fact("Analist");
  r.company = fact("Company");
  d.roles.push(r);
  const initial = saveAndAdd(d, r.id, "Saved career context");
  const adapter = new MemoryBaseCvAdapter();
  await adapter.save({
    draft: initial,
    expectedRevision: 0,
    requestId: "initial",
  });
  window.location.hash = "#enrich";
  const user = userEvent.setup();
  render(<App adapter={adapter} />);
  await screen.findByRole("textbox", { name: "Full context question?" });
  const cv = screen.getByRole("complementary", { name: "Previzualizare CV" });
  const copy = textBox(cv, "Saved career context");
  copy.focus();
  copy.textContent = "";
  fireEvent.input(copy);
  await user.keyboard("{Control>}s{/Control}");
  const rich = await screen.findByRole("textbox", { name: "Contribuții" });
  await waitFor(() => expect(document.activeElement).toBe(rich));
  expect(rich.getAttribute("aria-invalid")).toBe("true");
  const error = document.getElementById(
    rich.getAttribute("aria-describedby")!,
  )!;
  expect(error.textContent).toContain("Completează câmpul");
  expect(rich.closest("details")!.open).toBe(true);
  rich.innerHTML = "";
  fireEvent.input(rich);
  await user.keyboard("{Control>}s{/Control}");
  await waitFor(async () => {
    const saved = (await adapter.load())!.draft;
    expect(saved.roles[0].bullets).toEqual([]);
    expect(saved.answers[0].text).toBe("Saved career context");
    expect(saved.answers[0].cvFieldId).toBeUndefined();
  });
});

it("focuses the first empty field after inserting each optional section", async () => {
  function Surface() {
    const [draft, change] = useState(blankDraft);
    return (
      <LanguageContext.Provider value="en">
        <Editor draft={draft} change={change} issues={[]} />
      </LanguageContext.Provider>
    );
  }
  const user = userEvent.setup();
  render(<Surface />);
  await user.click(screen.getByText("Add section", { selector: "summary" }));
  for (const name of [
    "Projects",
    "Certifications",
    "Volunteering",
    "Custom section",
  ]) {
    await user.click(screen.getByRole("button", { name }));
    const section = screen.getByText(name, {
      selector: ".editor-section > summary",
    }).parentElement!;
    const label = within(section).getByRole("textbox", {
      name: "Section label",
    });
    await waitFor(() => expect(document.activeElement).toBe(label));
    expect(label.closest("details:not([open])")).toBeNull();
    await user.keyboard(`My ${name}`);
    expect((label as HTMLInputElement).value).toBe(`My ${name}`);
  }
});

it.each(["experience", "education"] as const)(
  "reveals the first empty field in collapsed %s entries on section and entry opening",
  async (kind) => {
    const d = blankDraft();
    let firstId: string, secondId: string, secondEntry: string;
    if (kind === "experience") {
      for (const n of [1, 2]) {
        const r = newRole();
        r.title = fact(`Role ${n}`);
        r.company = fact("Company");
        r.location = fact("City");
        r.start = fact({ year: "2020", month: "" });
        r.end = fact({ year: "2021", month: "" });
        d.roles.push(r);
      }
      firstId = d.roles[0].context.fieldId;
      secondId = d.roles[1].context.fieldId;
      secondEntry = d.roles[1].id;
    } else {
      for (const n of [1, 2]) {
        const e = newEducation();
        e.institution = fact(`School ${n}`);
        e.qualification = fact("Degree");
        e.field = fact("Field");
        e.location = fact("City");
        e.start = fact({ year: "2015", month: "" });
        e.end = fact({ year: "2019", month: "" });
        d.education.push(e);
      }
      firstId = d.education[0].details.fieldId;
      secondId = d.education[1].details.fieldId;
      secondEntry = d.education[1].id;
    }
    function Surface() {
      const [draft, change] = useState(d);
      return (
        <LanguageContext.Provider value="en">
          <Editor draft={draft} change={change} issues={[]} />
        </LanguageContext.Provider>
      );
    }
    const user = userEvent.setup();
    render(<Surface />);
    await user.click(
      screen.getByText(
        kind === "experience" ? "Professional experience" : "Education",
        { selector: "summary" },
      ),
    );
    await waitFor(() => expect(document.activeElement?.id).toBe(firstId));
    expect(document.activeElement?.closest("details:not([open])")).toBeNull();
    const second = document.getElementById(`entry-${secondEntry}`)!;
    await user.click(second.querySelector("summary")!);
    await waitFor(() => expect(document.activeElement?.id).toBe(secondId));
    expect(document.activeElement?.closest("details:not([open])")).toBeNull();
  },
);

it.each(["name", "skills", "role", "education", "project", "summary"] as const)(
  "navigates the %s preview block from Review to its focused editor control",
  async (kind) => {
    const d = completedDraft(),
      r = newRole(),
      e = newEducation(),
      project = newOptionalEntry();
    r.title = fact("Analist");
    r.company = fact("Preview Company");
    r.ongoing = fact(true);
    d.roles.push(r);
    e.institution = fact("Preview School");
    e.ongoing = fact(true);
    d.education.push(e);
    project.title = fact("Project");
    project.details = fact("Project details");
    d.optionalSections.push({
      id: "projects",
      kind: "projects",
      label: "",
      entries: [project],
    });
    d.presentation.order.push("projects");
    d.technicalSkills = [fact("React")];
    d.summary.text = "Own summary";
    const name = {
      name: "Editează: Prenume",
      skills: "Editează: Competențe tehnice",
      role: "Preview Company",
      education: "În curs",
      project: "Project details",
      summary: "Editează: Rezumat profesional",
    }[kind];
    const expected = {
      name: "first-name",
      skills: "chip-Competențe tehnice",
      role: r.company.fieldId,
      education: e.ongoing.fieldId,
      project: project.details.fieldId,
      summary: "summary",
    }[kind];
    const adapter = new MemoryBaseCvAdapter();
    await adapter.save({ draft: d, expectedRevision: 0, requestId: "initial" });
    window.location.hash = "#review";
    const user = userEvent.setup();
    render(<App adapter={adapter} />);
    const preview = await screen.findByRole("complementary", {
      name: "Previzualizare CV",
    });
    await user.click(within(preview).getByRole("button", { name }));
    await waitFor(() => expect(document.activeElement?.id).toBe(expected));
    expect(window.location.hash).toBe("#base");
    expect(document.activeElement?.closest("details:not([open])")).toBeNull();
  },
);

it("retains reusable questions and answers after their role is deleted", async () => {
  const d = completedDraft(),
    r = newRole();
  r.title = fact("Role");
  r.company = fact("Company");
  d.roles.push(r);
  const initial = saveAndAdd(d, r.id, "Reusable context");
  const adapter = new MemoryBaseCvAdapter();
  await adapter.save({
    draft: initial,
    expectedRevision: 0,
    requestId: "initial",
  });
  window.location.hash = "#base";
  const user = userEvent.setup();
  render(<App adapter={adapter} />);
  await user.click(
    await screen.findByText("Experiență profesională", { selector: "summary" }),
  );
  await user.click(screen.getByRole("button", { name: "Elimină experiența" }));
  await user.click(screen.getByRole("link", { name: "Îmbunătățește" }));
  const context = screen.getByRole("region", { name: "Context profesional" });
  expect(within(context).getByText("Reusable context")).toBeTruthy();
  expect(within(context).getByText("Full context question?")).toBeTruthy();
  await waitFor(
    async () => {
      const saved = (await adapter.load())!.draft;
      expect(saved.roles).toEqual([]);
      expect(saved.answers[0].text).toBe("Reusable context");
      expect(saved.answers[0].cvFieldId).toBeUndefined();
    },
    { timeout: 2000 },
  );
});

it("inspects full saved Q&A independently of CV wording in immutable history snapshots", async () => {
  const d = completedDraft(),
    role = newRole();
  role.title = fact("Role");
  role.company = fact("Company");
  d.roles.push(role);
  const contextOnly = saveAnswer(
    d,
    {
      id: "context",
      targetId: role.id,
      question: "context",
      questionText: "What did you personally own?",
      text: "First\nSecond",
      status: "draft",
    },
    role.context.id,
  );
  const adapter = new MemoryBaseCvAdapter();
  const first = await adapter.save({
    draft: contextOnly,
    mode: "autosave",
    expectedRevision: 0,
    requestId: "one",
  });
  const withCopy = addAnswerToCv(contextOnly, "context", role.context.id);
  const edited = patchFact(
    withCopy,
    withCopy.roles[0].bullets[0],
    "Independent CV wording",
  );
  const second = await adapter.save({
    draft: edited,
    mode: "autosave",
    expectedRevision: 1,
    requestId: "two",
  });
  const versions = await adapter.history();
  function Surface() {
    const [inspected, setInspected] = useState<typeof first | null>(first);
    return (
      <LanguageContext.Provider value="en">
        <HistoryScreen
          draft
          versions={versions}
          head={second}
          inspected={inspected}
          setInspected={setInspected}
          restore={() => {}}
          go={() => {}}
          asOf={asOf}
        />
      </LanguageContext.Provider>
    );
  }
  const user = userEvent.setup();
  render(<Surface />);
  expect(
    screen.getByRole("complementary", { name: "CV preview" }).textContent,
  ).not.toContain("First");
  const context = screen.getByRole("region", { name: "Saved career context" });
  expect(
    within(context).getByText("What did you personally own?"),
  ).toBeTruthy();
  expect(context.textContent).toContain("First\nSecond");
  await user.click(screen.getByRole("button", { name: "Inspect v2" }));
  expect(
    screen.getByRole("complementary", { name: "CV preview" }).textContent,
  ).toContain("Independent CV wording");
  expect(
    screen.getByRole("region", { name: "Saved career context" }).textContent,
  ).toContain("First\nSecond");
  expect((await adapter.history())[1]).toEqual(first);
});

it("preserves unrelated bold, italic and ordered-list rendering through explicit CV actions and preview editing", async () => {
  const d = blankDraft(),
    role = newRole();
  role.title = fact("Role");
  role.company = fact("Company");
  role.bullets = [fact("Kept bold"), fact("Kept italic")];
  d.roles.push(role);
  const root = document.createElement("div");
  root.innerHTML = `<ol><li data-contribution="${role.bullets[0].fieldId}"><b>Kept bold</b></li><li data-contribution="${role.bullets[1].fieldId}"><i>Kept italic</i></li></ol>`;
  const initial = setContributions(d, role.id, readContributions(root));
  let latest = initial;
  function Surface() {
    const [draft, setDraft] = useState(initial);
    return (
      <LanguageContext.Provider value="en">
        <section aria-label="Improve">
          <Enrichment
            draft={draft}
            change={(next) => {
              latest = next;
              setDraft(next);
            }}
            goEdit={() => {}}
            asOf={asOf}
          />
        </section>
        <section aria-label="Rendered CV">
          <DocumentPreview draft={draft} asOf={asOf} />
        </section>
      </LanguageContext.Provider>
    );
  }
  const user = userEvent.setup();
  render(<Surface />);
  function check() {
    const cv = screen.getByRole("region", { name: "Rendered CV" });
    expect(cv.querySelectorAll("ol>li")).toHaveLength(2);
    expect(cv.querySelector("ol b")?.textContent).toBe("Kept bold");
    expect(cv.querySelector("ol i")?.textContent).toBe("Kept italic");
    return cv;
  }
  await user.type(
    screen.getByRole("textbox", {
      name: "What were your day-to-day responsibilities?",
    }),
    "Added copy{Control>}{Enter}{/Control}",
  );
  await user.click(screen.getByRole("button", { name: "Add to CV" }));
  expect(check().textContent).toContain("Added copy");
  const preview = within(
    screen.getByRole("region", { name: "Improve" }),
  ).getByRole("complementary", { name: "CV preview" });
  const copy = textBox(preview, "Added copy");
  copy.textContent = "Preview correction";
  fireEvent.input(copy);
  expect(check().textContent).toContain("Preview correction");
  expect(check().textContent).not.toContain("Added copy");
  expect(latest.answers[0].text).toBe("Added copy");
  await user.click(screen.getByRole("button", { name: "Edit answer" }));
  const question = screen.getByRole("textbox", {
    name: "What were your day-to-day responsibilities?",
  });
  await user.clear(question);
  await user.type(question, "Updated copy{Control>}{Enter}{/Control}");
  expect(check().textContent).toContain("Preview correction");
  await user.click(screen.getByRole("button", { name: "Update in CV" }));
  expect(check().textContent).toContain("Updated copy");
  expect(check().textContent).not.toContain("Preview correction");
  await user.click(screen.getByRole("button", { name: "Remove from CV" }));
  expect(check().textContent).not.toContain("Updated copy");
  expect(latest.answers[0].text).toBe("Updated copy");
  expect(latest.answers[0].questionText).toBe(
    "What were your day-to-day responsibilities?",
  );
});
