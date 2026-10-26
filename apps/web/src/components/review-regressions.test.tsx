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
import { applyAnswer, enrichmentTarget } from "../base/enrichment";
import { patchFact, setContributions } from "../base/editing";
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
    fireEvent.input(pending);
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
  fireEvent.input(bullet);
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

it("preserves answer identity when inserting a native rich-text line before existing answers", async () => {
  const d = completeIdentity(),
    role = newRole();
  role.title = fact("Analist");
  role.company = fact("Synthetic Co");
  d.roles.push(role);
  let enriched = d;
  for (const [id, question, text] of [
    ["a", "context", "Answer A"],
    ["b", "tools", "Answer B"],
  ] as const)
    enriched = applyAnswer(
      enriched,
      {
        id,
        question,
        text,
        targetId: role.id,
        status: "draft",
        mode: "append",
      },
      role.context.id,
    );
  const adapter = new MemoryBaseCvAdapter();
  await adapter.save({
    draft: enriched,
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
  rich.innerHTML = "New<div>Answer A</div><div>Answer B</div>";
  fireEvent.input(rich);
  await user.click(screen.getByRole("link", { name: "Îmbunătățește" }));
  const answer = await screen.findByRole("textbox", {
    name: "Care erau responsabilitățile tale de zi cu zi?",
  });
  expect((answer as HTMLTextAreaElement).value).toBe("Answer A");
  const preview = screen.getByRole("complementary", {
    name: "Previzualizare CV",
  });
  expect(within(preview).getByText("New")).toBeTruthy();
  await user.clear(answer);
  await user.type(answer, "Revised A{Control>}{Enter}{/Control}");
  expect(within(preview).getAllByText("Revised A")).toHaveLength(1);
  expect(within(preview).getAllByText("Answer B")).toHaveLength(1);
  expect(within(preview).queryByText("Answer A")).toBeNull();
  await waitFor(
    async () => {
      const saved = (await adapter.load())!.draft;
      expect(saved.roles[0].bullets.map((f) => f.value)).toEqual([
        "New",
        "Revised A",
        "Answer B",
      ]);
      expect(saved.answers.find((a) => a.id === "b")!.factId).toBe(
        enriched.answers.find((a) => a.id === "b")!.factId,
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
  "publishes %s preview input before autosave and keyboard save, retains focus and accepts its local destination edit",
  async (kind) => {
    const d = completedDraft();
    let targetId: string;
    if (kind === "role") {
      const role = newRole();
      role.title = fact("Analist");
      role.company = fact("Synthetic Co");
      d.roles.push(role);
      targetId = role.id;
    } else {
      const entry = newOptionalEntry();
      entry.title = fact("Synthetic entry");
      d.optionalSections.push({ id: kind, kind, label: "", entries: [entry] });
      d.presentation.order.push(kind);
      targetId = entry.id;
    }
    const target = enrichmentTarget(d, targetId)!;
    target.field.value = "Original context";
    const initial = applyAnswer(
      d,
      {
        id: "tools-answer",
        targetId,
        question: "tools",
        text: "Original answer",
        status: "draft",
        mode: "append",
      },
      target.field.id,
    );
    const adapter = new MemoryBaseCvAdapter();
    await adapter.save({
      draft: initial,
      mode: "checkpoint",
      expectedRevision: 0,
      requestId: "initial",
    });
    window.location.hash = "#enrich";
    const user = userEvent.setup();
    render(<App adapter={adapter} />);
    const question = await screen.findByRole("textbox", {
      name: "Care erau responsabilitățile tale de zi cu zi?",
    });
    const preview = screen.getByRole("complementary", {
      name: "Previzualizare CV",
    });
    const context = within(preview).getByText("Original context");
    context.focus();
    context.textContent = "";
    fireEvent.input(context);
    expect(context.isConnected).toBe(true);
    expect(document.activeElement).toBe(context);
    context.innerHTML = "First<br>Second";
    fireEvent.input(context);
    expect(document.activeElement).toBe(context);
    await waitFor(
      async () => {
        const saved = (await adapter.load())!;
        expect(saved.reason).toBe("autosave");
        expect(enrichmentTarget(saved.draft, targetId)!.field.value).toBe(
          "First\nSecond",
        );
      },
      { timeout: 2000 },
    );
    const bullet = within(preview).getByText("Original answer");
    bullet.focus();
    bullet.innerHTML = "Updated<div>Answer</div>";
    fireEvent.input(bullet);
    expect(document.activeElement).toBe(bullet);
    await user.keyboard("{Control>}s{/Control}");
    await waitFor(async () => {
      const saved = (await adapter.load())!;
      expect(saved.reason).toBe("save");
      const entry = enrichmentTarget(saved.draft, targetId)!.entry;
      expect(entry.bullets!.map((f) => f.value)).toEqual(["Updated\nAnswer"]);
      expect(
        saved.draft.answers.find((a) => a.id === "tools-answer"),
      ).toMatchObject({
        text: "Updated\nAnswer",
        factId: entry.bullets![0].id,
      });
    });
    await user.type(question, "Pending text");
    const pending = within(preview).getByText("Pending text");
    pending.focus();
    pending.textContent = "";
    fireEvent.input(pending);
    expect(pending.isConnected).toBe(true);
    pending.innerHTML = "Pending<br>Answer";
    fireEvent.input(pending);
    expect(document.activeElement).toBe(pending);
    expect((question as HTMLTextAreaElement).value).toBe("Pending\nAnswer");
    await user.keyboard("{Control>}s{/Control}");
    await waitFor(async () =>
      expect(
        (await adapter.load())!.draft.answers.find(
          (a) => a.question === "context",
        )!.text,
      ).toBe("Pending\nAnswer"),
    );
    question.focus();
    await user.keyboard("{Control>}{Enter}{/Control}");
    expect(
      await screen.findByRole("textbox", {
        name: "Ce ai făcut tu, cu ce autonomie?",
      }),
    ).toBe(document.activeElement);
    expect(screen.queryByText(/Destinația s-a schimbat/)).toBeNull();
    await waitFor(
      async () =>
        expect(
          enrichmentTarget(
            (await adapter.load())!.draft,
            targetId,
          )!.entry.bullets!.map((f) => f.value),
        ).toEqual(["Updated\nAnswer", "Pending\nAnswer"]),
      { timeout: 2000 },
    );
  },
);

it("retains a genuinely stale destination signature after a later local preview edit", async () => {
  const d = blankDraft(),
    role = newRole();
  role.title = fact("Role");
  role.company = fact("Company");
  role.context = fact("Original context");
  d.roles.push(role);
  let externalChange: (next: BaseDraft) => void = () => {};
  let latest = d;
  function Surface() {
    const [draft, setDraft] = useState(d);
    externalChange = setDraft;
    return (
      <LanguageContext.Provider value="en">
        <Enrichment
          draft={draft}
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
