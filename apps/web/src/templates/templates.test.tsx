import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { TemplateChooser } from "./TemplateChooser";
import { App } from "../App";
import { MemoryBaseCvAdapter } from "../base/adapter";
import { prepareDraft } from "../base/editing";
import { maraReviewDraft } from "../base/fixture";
import { clone, fact, newOptionalEntry } from "../base/model";
import { acceptWording } from "../base/wording";
import { DocumentPreview } from "../components/DocumentPreview";
import { LanguageContext } from "../components/ui";
import { decodeDraft, encodeDraft } from "@resumora/contracts/editor/transport";
import { chooseTemplate, cvTemplates } from "./registry";

const asOf = { year: "2026", month: "10" };
const plain = (text: string | null) => (text ?? "").replace(/\s+/g, " ").trim();

it.each(cvTemplates)(
  "$name keeps the same user facts and reading sequence",
  (template) => {
    const original = maraReviewDraft();
    original.summary.text = "Synthetic professional profile.";
    const draft = chooseTemplate(original, template.versionId);
    const before = clone(draft);
    const { container } = render(<DocumentPreview draft={draft} asOf={asOf} />);
    const paper = container.querySelector("article.document")!;
    const text = plain(paper.textContent);
    const sequence = [
      "Mara Ionescu",
      "Automation Engineer",
      "Business Systems Analyst",
      "mara@example.test",
      "Synthetic professional profile.",
      "Professional Skills",
      "Technical Skills",
      "Experience",
      "Education",
    ];
    const positions = sequence.map((value) =>
      text.toLowerCase().indexOf(value.toLowerCase()),
    );
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(
      within(paper as HTMLElement).getByText("SQL, Power Automate"),
    ).toBeTruthy();
    for (const [index, entry] of [
      ...paper.querySelectorAll(".document-experience .document-entry"),
    ].entries()) {
      expect(
        plain(entry.querySelector(".document-entry-head")?.textContent ?? ""),
      ).toContain(original.roles[index].title.value);
      expect(
        plain(entry.querySelector(".document-entry-head")?.textContent ?? ""),
      ).toContain(original.roles[index].company.value);
      for (const bullet of original.roles[index].bullets)
        expect(entry.textContent).toContain(bullet.value);
    }
    expect(paper.querySelector("table, canvas, iframe, script")).toBeNull();
    expect(draft).toEqual(before);
    expect(original.presentation.templateVersionId).toBeUndefined();
  },
);

it.each(cvTemplates)(
  "$name preserves approved wording, rich text and visibility",
  (template) => {
    const source = maraReviewDraft();
    const role = source.roles[0];
    role.context = fact("Authored role context.");
    role.bullets[0].status = "user_confirmed";
    source.presentation.contributionHtml = {
      [role.id]: `<ul><li><strong>${role.bullets[0].value}</strong></li></ul><script>untrusted()</script>`,
    };
    const approved = acceptWording(source, role.id, {
      text: "Approved scoped wording.",
      sources: [
        {
          id: role.bullets[0].id,
          text: role.bullets[0].value,
          sourceId: role.bullets[0].sourceId,
        },
      ],
    });
    const draft = chooseTemplate(approved, template.versionId);
    const { container, rerender } = render(
      <DocumentPreview draft={draft} asOf={asOf} />,
    );
    const paper = () => container.querySelector("article.document")!;
    expect(paper().textContent).toContain("Approved scoped wording.");
    expect(paper().querySelector("strong")?.textContent).toBe(
      role.bullets[0].value,
    );
    expect(paper().querySelector("script")).toBeNull();
    const hidden = clone(draft);
    hidden.presentation.hiddenFields = [
      role.bullets[0].fieldId,
      hidden.contacts[0].value.fieldId,
    ];
    rerender(<DocumentPreview draft={hidden} asOf={asOf} />);
    expect(paper().textContent).not.toContain("Approved scoped wording.");
    expect(paper().textContent).not.toContain(role.bullets[0].value);
    expect(paper().textContent).not.toContain(hidden.contacts[0].value.value);
    expect(paper().textContent).toContain("Authored role context.");
    hidden.presentation.hidden = ["experience"];
    rerender(<DocumentPreview draft={hidden} asOf={asOf} />);
    expect(paper().querySelector(".document-experience")).toBeNull();
    expect(draft.presentation.approvedWording).toEqual(
      approved.presentation.approvedWording,
    );
  },
);

it("keeps legacy layout and unknown saved versions without rewriting content", () => {
  const draft = maraReviewDraft();
  const { container, rerender } = render(
    <DocumentPreview draft={draft} asOf={asOf} />,
  );
  expect(container.querySelector(".document-template")).toBeNull();
  const legacyText = plain(
    container.querySelector("article.document")!.textContent,
  );
  draft.presentation.templateVersionId = "template_future_9_0_0";
  const future = decodeDraft(encodeDraft(draft));
  rerender(
    <DocumentPreview draft={future} asOf={asOf} onTemplateChange={() => {}} />,
  );
  expect(container.querySelector(".document-template")).toBeNull();
  expect(plain(container.querySelector("article.document")!.textContent)).toBe(
    legacyText,
  );
  expect(screen.getByRole("status").textContent).toContain(
    "alegerea salvată se păstrează",
  );
  expect(
    (screen.getByRole("combobox", { name: "Șablon" }) as HTMLSelectElement)
      .value,
  ).toBe("template_future_9_0_0");
  expect(future).toEqual(draft);
});

it("uses CV language independently and offers exactly the five selected templates", () => {
  const draft = chooseTemplate(maraReviewDraft(), cvTemplates[0].versionId);
  draft.language = "ro";
  render(
    <LanguageContext.Provider value="en">
      <DocumentPreview draft={draft} asOf={asOf} onTemplateChange={() => {}} />
    </LanguageContext.Provider>,
  );
  expect(screen.getByRole("combobox", { name: "Template" })).toBeTruthy();
  expect(
    screen.getByRole("heading", { name: "Experiență profesională" }),
  ).toBeTruthy();
  expect(
    screen.getAllByRole("option").map((option) => option.textContent),
  ).toEqual(["Folio", "Meridian", "Signal", "Archive", "Monograph"]);
});

it("autosaves the native chooser through App, reopens it and restores versioned history", async () => {
  const adapter = new MemoryBaseCvAdapter();
  const original = prepareDraft(maraReviewDraft());
  const first = await adapter.save({
    draft: original,
    mode: "autosave",
    expectedRevision: 0,
    requestId: crypto.randomUUID(),
  });
  window.location.hash = "#base";
  const view = render(<App adapter={adapter} />);
  const select = await screen.findByRole("combobox", { name: "Șablon" });
  fireEvent.change(select, { target: { value: cvTemplates[3].versionId } });
  await waitFor(
    async () =>
      expect((await adapter.load())?.draft.presentation.templateVersionId).toBe(
        cvTemplates[3].versionId,
      ),
    { timeout: 3000 },
  );
  const saved = (await adapter.load())!;
  expect(saved.draft.roles).toEqual(original.roles);
  expect(saved.draft.sources).toEqual(original.sources);
  expect(saved.draft.contacts).toEqual(original.contacts);
  view.unmount();
  render(<App adapter={adapter} />);
  expect(
    (
      (await screen.findByRole("combobox", {
        name: "Șablon",
      })) as HTMLSelectElement
    ).value,
  ).toBe(cvTemplates[3].versionId);
  const restored = await adapter.restore({
    snapshotId: first.id,
    expectedRevision: saved.revision,
    requestId: crypto.randomUUID(),
  });
  expect(restored.draft.presentation.templateVersionId).toBeUndefined();
  expect(
    (await adapter.history()).find((row) => row.id === saved.id)?.draft
      .presentation.templateVersionId,
  ).toBe(cvTemplates[3].versionId);
});

it("uses the same executing renderer and envelope for independent tailored content", () => {
  const base = chooseTemplate(maraReviewDraft(), cvTemplates[0].versionId);
  const beforeBase = clone(base);
  const tailored = clone(base);
  tailored.id = "synthetic_job_document";
  tailored.summary.text =
    "Tailored synthetic profile, retaining the supplied career facts.";
  tailored.roles[0].context = fact("Tailored experience context.");
  tailored.roles[0].bullets[0].status = "user_confirmed";
  const source = tailored.roles[0].bullets[0];
  const withWording = acceptWording(tailored, tailored.roles[0].id, {
    text: "Approved tailored experience wording.",
    sources: [{ id: source.id, text: source.value, sourceId: source.sourceId }],
  });
  const before = clone(withWording);
  const selected = decodeDraft(
    encodeDraft(chooseTemplate(withWording, cvTemplates[4].versionId)),
  );
  expect(selected).toEqual({
    ...before,
    presentation: {
      ...before.presentation,
      templateVersionId: cvTemplates[4].versionId,
    },
  });
  expect(base).toEqual(beforeBase);
  expect(
    chooseTemplate(base, cvTemplates[1].versionId).presentation
      .templateVersionId,
  ).toBe(cvTemplates[1].versionId);
  expect(selected.presentation.templateVersionId).toBe(
    cvTemplates[4].versionId,
  );
  const { container } = render(
    <DocumentPreview draft={selected} asOf={asOf} />,
  );
  const paper = container.querySelector("article.document")!;
  expect(paper.textContent).toContain(selected.summary.text);
  expect(paper.textContent).toContain("Approved tailored experience wording.");
  expect(paper.textContent).toContain("SQL, Power Automate");
  expect(paper.textContent).toContain(selected.professionalSkills[0].value);
});

it("keeps authored section order and modular content when applying a layout", () => {
  const draft = maraReviewDraft();
  const project = newOptionalEntry();
  project.title.value = "Synthetic project";
  project.details.value = "Authored project details.";
  draft.optionalSections.push({
    id: "project_example",
    kind: "projects",
    label: "Selected projects",
    entries: [project],
  });
  draft.presentation.order = [
    "identity",
    "project_example",
    "technicalSkills",
    "experience",
    "professionalSkills",
    "education",
  ];
  const { container } = render(
    <DocumentPreview
      draft={chooseTemplate(draft, cvTemplates[2].versionId)}
      asOf={asOf}
    />,
  );
  const paper = container.querySelector("article.document")!;
  expect(
    [...paper.querySelectorAll(":scope > section")]
      .map((section) => section.querySelector("h3")?.textContent)
      .filter(Boolean),
  ).toEqual([
    "Selected projects",
    "Technical skills",
    "Professional experience",
    "Professional skills",
    "Education",
  ]);
  expect(paper.textContent).toContain("Synthetic project");
  expect(paper.textContent).toContain("Authored project details.");
});

it("keeps legacy and unknown choices display-only until selecting a registered version", () => {
  const draft = maraReviewDraft();
  draft.presentation.photo = {
    assetId: "11111111-1111-4111-8111-111111111111",
    crop: { version: 1, centerX: 0.5, centerY: 0.5, zoom: 2 },
    visible: false,
    shape: "circle",
  };
  draft.presentation.hidden = ["education"];
  draft.presentation.hiddenFields = [draft.contacts[0].value.fieldId];
  draft.presentation.approvedWording = {
    field: { text: "Keep wording", sources: [] },
  };
  const original = clone(draft);
  const onChange = vi.fn();
  const { rerender } = render(<TemplateChooser onChange={onChange} />);
  const selectable = () =>
    Array.from((screen.getByRole("combobox") as HTMLSelectElement).options)
      .filter((option) => !option.disabled)
      .map((option) => option.value);
  expect(selectable()).toEqual([
    "template_folio_2_1_0",
    "template_meridian_2_1_0",
    "template_signal_2_1_0",
    "template_archive_2_1_0",
    "template_monograph_2_1_0",
  ]);
  expect(onChange).not.toHaveBeenCalled();
  draft.presentation.templateVersionId = "template_future_9_0_0";
  rerender(
    <TemplateChooser
      value={draft.presentation.templateVersionId}
      onChange={onChange}
    />,
  );
  expect(selectable()).toHaveLength(5);
  expect(onChange).not.toHaveBeenCalled();
  fireEvent.change(screen.getByRole("combobox"), {
    target: { value: cvTemplates[2].versionId },
  });
  expect(onChange).toHaveBeenCalledExactlyOnceWith(cvTemplates[2].versionId);
  expect(chooseTemplate(draft, cvTemplates[2].versionId)).toEqual({
    ...original,
    presentation: {
      ...original.presentation,
      templateVersionId: cvTemplates[2].versionId,
    },
  });
  expect(draft.presentation.templateVersionId).toBe("template_future_9_0_0");
  expect(() => chooseTemplate(draft, "")).toThrow("unavailableTemplate");
  expect(() => chooseTemplate(draft, "template_future_9_0_0")).toThrow(
    "unavailableTemplate",
  );
});
