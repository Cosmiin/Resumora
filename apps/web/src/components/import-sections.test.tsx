import { useState } from "react";
import {
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import { expect, it } from "vitest";
import { App } from "../test-editor-harness";
import { Editor } from "./Editor";
import { DocumentPreview } from "./DocumentPreview";
import { Review as DraftReview } from "./Review";
import { MemoryBaseCvAdapter } from "../base/adapter";
import { validateDraft } from "../base/validation";
import { patchFact } from "../base/editing";
import { ImportReview } from "./ImportReview";
import { LanguageContext } from "./ui";
import {
  importedDraft,
  confirmImported,
  pendingImportedCandidates,
  requiresImportReview,
} from "@resumora/contracts/editor/import";
import {
  allFacts,
  clone,
  fact,
  newOptionalEntry,
  type BaseDraft,
} from "../base/model";
import { encodeDraft, decodeDraft } from "@resumora/contracts/editor/transport";
import { careerContext } from "@resumora/contracts/intelligence/context";
import { isAccepted } from "../base/model";
import { enrichmentTarget } from "../base/enrichment";
import { acceptWording, currentWording } from "../base/wording";
import type { ImportReview as Review } from "@resumora/contracts/intelligence/model";
const paths = [
  "name",
  "contacts.email",
  "summary",
  "roles.0.title",
  "roles.0.bullets.0",
  "education.0.qualification",
  "certifications.0.title",
  "custom.0.title",
  "custom.0.details",
  "certifications.0.start",
];
const values = [
  "Synthetic Owner",
  "owner@example.invalid",
  "Original summary",
  "Engineer",
  "Kept records",
  "Degree",
  "Synthetic certification",
  "Awards",
  "Original award",
  "02/2020",
];
const review: Review = {
  id: crypto.randomUUID(),
  sourceHash: "a".repeat(64),
  format: "pdf",
  parserVersion: "synthetic",
  pages: 1,
  admission: { kind: "cv", reason: "CV", pages: [1] },
  extraction: {
    schemaVersion: "cv-extraction/1",
    candidates: paths.map((path, i) => ({
      id: `c${i}`,
      path,
      value: values[i],
      quote: values[i],
      page: 1,
      confidence: "low",
    })),
    warnings: [],
    omittedPages: [],
  },
  confirmedIds: [],
};
it("reviews the complete overview, edits cards and confirms the information shown while retaining provenance across reload", () => {
  let latest: BaseDraft = importedDraft(review);
  expect(allFacts(latest).filter((f) => f.sourceClaimId)).toHaveLength(
    paths.length,
  );
  expect(latest.name.status).toBe("extracted_unconfirmed");
  function Harness() {
    const [draft, setDraft] = useState(latest);
    return (
      <LanguageContext value="en">
        <ImportReview
          draft={draft}
          disabled={false}
          change={(next) => {
            latest = next;
            setDraft(next);
          }}
          confirm={(ids) => {
            latest = decodeDraft(encodeDraft(confirmImported(draft, ids)));
            setDraft(latest);
          }}
        />
      </LanguageContext>
    );
  }
  render(<Harness />);
  expect(
    screen.getByRole("heading", { name: "Name and contact" }),
  ).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Engineer" })).toBeTruthy();
  expect(screen.queryByDisplayValue("Synthetic Owner")).toBeNull();
  fireEvent.click(
    within(screen.getByRole("region", { name: "Name and contact" })).getByRole(
      "button",
      { name: "Edit" },
    ),
  );
  fireEvent.change(screen.getByLabelText("Name", { exact: true }), {
    target: { value: "Edited Owner" },
  });
  expect(latest.name.sourceLineage?.[0].sourceClaimId).toBe("c0");
  fireEvent.click(
    within(screen.getByRole("region", { name: "Certifications" })).getByRole(
      "button",
      { name: "Edit" },
    ),
  );
  fireEvent.change(screen.getByLabelText("Start", { exact: true }), {
    target: { value: "13/2020" },
  });
  expect(
    screen.getByRole("button", { name: "Confirm and use this information" }),
  ).toHaveProperty("disabled", true);
  expect(screen.getByRole("alert").textContent).toContain("Correct the dates");
  fireEvent.change(screen.getByLabelText("Start", { exact: true }), {
    target: { value: "02/2020" },
  });
  fireEvent.click(
    within(screen.getByRole("region", { name: "Other categories" })).getByRole(
      "button",
      { name: "Edit" },
    ),
  );
  fireEvent.change(screen.getByLabelText("Title", { exact: true }), {
    target: { value: "Honors" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Confirm and use this information" }),
  );
  expect(latest.importReview!.confirmedIds).toHaveLength(paths.length);
  expect(latest.name.value).toBe("Edited Owner");
  expect(latest.importReview!.extraction.candidates[0].value).toBe(
    "Synthetic Owner",
  );
  const restored = decodeDraft(encodeDraft(clone(latest)));
  expect(
    restored.optionalSections.some(
      (s) =>
        s.kind === "certifications" &&
        s.entries[0].title.value === "Synthetic certification",
    ),
  ).toBe(true);
  expect(
    restored.optionalSections.some(
      (s) =>
        s.heading?.value === "Honors" &&
        s.entries[0].details.value === "Original award",
    ),
  ).toBe(true);
  expect(restored.summary.text).toBe("Original summary");
  render(
    <DocumentPreview draft={restored} asOf={{ year: "2026", month: "10" }} />,
  );
  const paper = document.querySelector(".document")!;
  expect(within(paper as HTMLElement).getAllByText("Honors")).toHaveLength(1);
  expect(paper.textContent).not.toContain("Awards");
  expect(
    within(paper as HTMLElement).getAllByText("Original summary"),
  ).toHaveLength(1);
});

it("source fetch failure is explicit and retryable without showing a guessed box", async () => {
  const { OriginalSource } = await import("./OriginalSource");
  const { vi } = await import("vitest");
  const original = vi.fn().mockRejectedValue(new Error("synthetic offline"));
  const client = {
    original,
  } as unknown as import("../base/intelligence").IntelligenceClient;
  render(
    <LanguageContext value="en">
      <OriginalSource
        review={review}
        candidate={review.extraction.candidates[0]}
        client={client}
      />
    </LanguageContext>,
  );
  expect(await screen.findByText(/Original preview unavailable/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(await screen.findByText(/Original preview unavailable/)).toBeTruthy();
  expect(original).toHaveBeenCalledTimes(2);
  expect(document.querySelector(".source-box")).toBeNull();
});

function completeRequired(draft: BaseDraft) {
  draft.language = "en";
  draft.nameParts = { first: "Synthetic", last: "Owner" };
  draft.titles[0] = fact("Engineer");
  for (const contact of draft.contacts)
    contact.value = fact(
      contact.kind === "email"
        ? "owner@example.invalid"
        : contact.kind === "phone"
          ? "+40 700 000 000"
          : contact.kind === "location"
            ? "Bucharest"
            : "https://linkedin.com/in/synthetic-owner",
    );
  const language = newOptionalEntry();
  language.title = fact("English");
  language.proficiency = fact("Native");
  draft.optionalSections
    .find((s) => s.kind === "languages")!
    .entries.push(language);
}

it("saves, reloads and edits a single sourced summary without inventing an entry title", async () => {
  const input = clone(review);
  input.extraction.candidates = input.extraction.candidates.filter(
    (c) => c.path === "summary" || c.path === "name",
  );
  let latest = confirmImported(
    importedDraft(input),
    input.extraction.candidates.map((c) => c.id),
  );
  completeRequired(latest);
  expect(validateDraft(latest)).toEqual([]);
  const adapter = new MemoryBaseCvAdapter();
  await adapter.save({
    draft: latest,
    mode: "checkpoint",
    expectedRevision: 0,
    requestId: crypto.randomUUID(),
  });
  latest = decodeDraft(encodeDraft((await adapter.load())!.draft));
  function Surface() {
    const [draft, setDraft] = useState(latest);
    return (
      <LanguageContext value="en">
        <Editor
          draft={draft}
          issues={[]}
          change={(next) => {
            latest = next;
            setDraft(next);
          }}
        />
        <DocumentPreview draft={draft} asOf={{ year: "2026", month: "10" }} />
      </LanguageContext>
    );
  }
  render(<Surface />);
  expect(document.querySelector("#section-import-summary")).toBeNull();
  const summary = document.querySelector("#section-summary")!;
  fireEvent.click(summary.querySelector("summary")!);
  expect(within(summary as HTMLElement).getAllByRole("textbox")).toHaveLength(
    1,
  );
  fireEvent.change(within(summary as HTMLElement).getByRole("textbox"), {
    target: { value: "Edited summary" },
  });
  const paper = document.querySelector(".document")!;
  expect(
    within(paper as HTMLElement).getAllByText("Edited summary"),
  ).toHaveLength(1);
  expect(paper.textContent).not.toContain("Original summary");
  expect(latest.presentation.order.slice(0, 2)).toEqual([
    "identity",
    "summary",
  ]);
  const field = latest.summary.provenance!;
  expect(field.sourceLineage?.[0].sourceClaimId).toBe("c2");
  expect(
    latest.importReview!.extraction.candidates.find(
      (c) => c.path === "summary",
    )!.value,
  ).toBe("Original summary");
  expect(validateDraft(latest)).toEqual([]);
});

it("shows confidently extracted fields too and records explicit confirmation only after the final action", () => {
  const input = clone(review);
  input.extraction.candidates = input.extraction.candidates.slice(0, 3);
  input.extraction.candidates[0].confidence = "high";
  input.extraction.candidates[0].warning =
    "Native PDF transcription requires review against the original page.";
  input.extraction.candidates[1].confidence = "high";
  input.extraction.candidates[1].warning = "Email unclear";
  let latest = importedDraft(input);
  function Surface() {
    const [draft, setDraft] = useState(latest);
    return (
      <LanguageContext value="en">
        <ImportReview
          draft={draft}
          disabled={false}
          confirm={(ids) => {
            latest = confirmImported(draft, ids);
            setDraft(latest);
          }}
        />
      </LanguageContext>
    );
  }
  render(<Surface />);
  expect(screen.getByText("Synthetic Owner")).toBeTruthy();
  expect(
    within(
      document.querySelector(".import-information") as HTMLElement,
    ).getByText("owner@example.invalid"),
  ).toBeTruthy();
  expect(screen.getByText("Email unclear")).toBeTruthy();
  expect(latest.name.status).toBe("extracted_unconfirmed");
  expect(latest.name.confirmedAt).toBeUndefined();
  fireEvent.click(
    screen.getByRole("button", { name: "Confirm and use this information" }),
  );
  expect(latest.importReview!.confirmedIds).toEqual(["c0", "c1", "c2"]);
  expect(latest.name.status).toBe("user_confirmed");
  expect(latest.name.confirmedAt).toBeTruthy();
  expect(screen.queryByRole("region", { name: "Review Base CV" })).toBeNull();
});

it("keeps previously saved all-automatic imports compatible without inventing historical confirmation", async () => {
  const input = clone(review);
  input.extraction.candidates = input.extraction.candidates.slice(0, 1);
  input.extraction.candidates[0].confidence = "high";
  const draft = importedDraft(input);
  completeRequired(draft);
  const adapter = new MemoryBaseCvAdapter();
  await adapter.save({
    draft,
    expectedRevision: 0,
    requestId: crypto.randomUUID(),
  });
  const oldHash = window.location.hash;
  window.location.hash = "base";
  const view = render(<App adapter={adapter} />);
  try {
    await waitFor(() =>
      expect(document.querySelector("[data-editor]")).toBeTruthy(),
    );
    expect(document.querySelector(".import-review")).toBeNull();
    const saved = (await adapter.load())!.draft;
    expect(saved.importReview!.confirmedIds).toEqual([]);
    expect(saved.name.status).toBe("extracted_unconfirmed");
    expect(saved.name.acceptance).toBe("automatic");
    expect(saved.name.confirmedAt).toBeUndefined();
  } finally {
    view.unmount();
    window.location.hash = oldHash;
  }
  render(
    <LanguageContext value="en">
      <DraftReview draft={draft} edit={() => {}} enrich={() => {}} />
    </LanguageContext>,
  );
  expect(screen.queryByText(/facts need review/)).toBeNull();
});

it("retains edited end dates while ongoing is toggled and confirms inactive imported facts", () => {
  const input = clone(review);
  input.extraction.candidates = [
    {
      id: "end",
      path: "roles.0.end",
      value: "2021",
      quote: "2021",
      page: 1,
      confidence: "low",
    },
    {
      id: "ongoing",
      path: "roles.0.ongoing",
      value: "false",
      quote: "false",
      page: 1,
      confidence: "low",
    },
  ];
  let latest = importedDraft(input);
  function Surface() {
    const [draft, setDraft] = useState(latest);
    return (
      <LanguageContext value="en">
        <ImportReview
          draft={draft}
          disabled={false}
          change={(next) => {
            latest = next;
            setDraft(next);
          }}
          confirm={(ids) => {
            latest = confirmImported(draft, ids);
            setDraft(latest);
          }}
        />
      </LanguageContext>
    );
  }
  render(<Surface />);
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  fireEvent.change(screen.getByLabelText(/End/), { target: { value: "2022" } });
  fireEvent.change(screen.getByLabelText(/Ongoing/), {
    target: { value: "true" },
  });
  expect((screen.getByLabelText(/End/) as HTMLTextAreaElement).value).toBe(
    "2022",
  );
  fireEvent.change(screen.getByLabelText(/End/), { target: { value: "2023" } });
  fireEvent.change(screen.getByLabelText(/Ongoing/), {
    target: { value: "false" },
  });
  expect(latest.roles[0].end.value.year).toBe("2023");
  fireEvent.change(screen.getByLabelText(/Ongoing/), {
    target: { value: "true" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Confirm and use this information" }),
  );
  latest = decodeDraft(encodeDraft(latest));
  expect(latest.roles[0].end.value.year).toBe("2023");
  expect(latest.importReview!.confirmedIds).toEqual(["end", "ongoing"]);
  expect(latest.roles[0].ongoing.status).toBe("user_authored");
  const untouched = importedDraft(input);
  const active = patchFact(untouched, untouched.roles[0].ongoing, true);
  const confirmed = confirmImported(active, ["end", "ongoing"]);
  expect(confirmed.roles[0].end.status).toBe("user_confirmed");
  expect(confirmed.roles[0].end.confirmedAt).toBeTruthy();
});

it("uses one sourced category heading in the editor and preview after further edits", () => {
  const input = clone(review);
  input.extraction.candidates = input.extraction.candidates.filter((c) =>
    c.path.startsWith("custom."),
  );
  let latest = confirmImported(importedDraft(input), ["c7", "c8"]);
  function Surface() {
    const [draft, setDraft] = useState(latest);
    return (
      <LanguageContext value="en">
        <Editor
          draft={draft}
          issues={[]}
          change={(next) => {
            latest = next;
            setDraft(next);
          }}
        />
        <DocumentPreview draft={draft} asOf={{ year: "2026", month: "10" }} />
      </LanguageContext>
    );
  }
  render(<Surface />);
  const category = document.querySelector("#section-import-custom-0")!;
  fireEvent.click(category.querySelector("summary")!);
  expect(
    within(category as HTMLElement).queryByLabelText("Section label"),
  ).toBeNull();
  fireEvent.change(
    within(category as HTMLElement).getByRole("textbox", { name: "Category" }),
    { target: { value: "Honors" } },
  );
  const paper = document.querySelector(".document")!;
  expect(within(paper as HTMLElement).getAllByText("Honors")).toHaveLength(1);
  expect(paper.textContent).not.toContain("Awards");
  expect(category.querySelector("summary")!.textContent).toBe("Honors");
  const title = latest.optionalSections.find(
    (s) => s.id === "import-custom-0",
  )!.heading!;
  expect(title.sourceLineage?.[0].sourceClaimId).toBe("c7");
  expect(enrichmentTarget(latest, "import-custom-0")!.label).toBe("Honors");
  fireEvent.click(
    within(category as HTMLElement).getByRole("button", { name: "Add entry" }),
  );
  fireEvent.change(
    within(category as HTMLElement).getByRole("textbox", { name: "Title" }),
    { target: { value: "Second award" } },
  );
  expect(within(paper as HTMLElement).getByText("Second award")).toBeTruthy();
  const entryId = latest.optionalSections.find(
    (s) => s.id === "import-custom-0",
  )!.entries[1].id;
  const handle = within(category as HTMLElement).getByRole("button", {
    name: "Reorder: Second award",
  });
  fireEvent.keyDown(handle, { key: "ArrowUp", altKey: true });
  expect(
    latest.optionalSections.find((s) => s.id === "import-custom-0")!.entries[0]
      .id,
  ).toBe(entryId);
  expect(category.querySelector("summary")!.textContent).toBe("Honors");
  expect(within(paper as HTMLElement).getAllByText("Honors")).toHaveLength(1);
  const content = Array.from(category.querySelectorAll(".optional-entry")).find(
    (node) => within(node as HTMLElement).queryByDisplayValue("Original award"),
  )!;
  fireEvent.click(
    within(content as HTMLElement).getByRole("button", {
      name: "Remove entry",
    }),
  );
  const restored = decodeDraft(encodeDraft(latest));
  expect(
    restored.optionalSections.find((s) => s.id === "import-custom-0")!.heading!
      .fieldId,
  ).toBe(title.fieldId);
  expect(within(paper as HTMLElement).getAllByText("Honors")).toHaveLength(1);
  expect(within(paper as HTMLElement).getByText("Second award")).toBeTruthy();
});

it.each(["education", "certifications"] as const)(
  "edits and confirms inactive stored %s end dates without activating date validation",
  (kind) => {
    const input = clone(review);
    input.extraction.candidates = [
      {
        id: "end",
        path: kind === "education" ? "education.0.end" : "certifications.0.end",
        value: "2021",
        quote: "2021",
        page: 1,
        confidence: "low",
      },
    ];
    const draft = importedDraft(input);
    const entry =
      kind === "education"
        ? draft.education[0]
        : draft.optionalSections.find((s) => s.kind === "certifications")!
            .entries[0];
    entry.ongoing = fact(true);
    const updated = patchFact(draft, entry.end, { year: "2022", month: "" });
    expect(
      allFacts(updated, true).find((f) => f.fieldId === entry.end.fieldId)!
        .value,
    ).toEqual({ year: "2022", month: "" });
    expect(allFacts(updated).some((f) => f.fieldId === entry.end.fieldId)).toBe(
      false,
    );
    const confirmed = confirmImported(draft, ["end"]);
    expect(
      allFacts(confirmed, true).find((f) => f.sourceClaimId === "end")!.status,
    ).toBe("user_confirmed");
    const invalidInactive = patchFact(updated, entry.end, {
      year: "2022",
      month: "13",
    });
    expect(
      validateDraft(invalidInactive).some((i) => i.field === entry.end.fieldId),
    ).toBe(false);
    const active = clone(invalidInactive);
    const activeEntry =
      kind === "education"
        ? active.education[0]
        : active.optionalSections.find((s) => s.kind === "certifications")!
            .entries[0];
    activeEntry.ongoing = fact(false);
    expect(
      validateDraft(active).some(
        (i) => i.field === entry.end.fieldId && i.code === "date",
      ),
    ).toBe(true);
  },
);

it("shares persisted automatic acceptance with enrichment, wording, duration ", () => {
  const input = clone(review);
  input.extraction.candidates = [
    ["roles.0.context", "Maintained records"],
    ["roles.0.bullets.0", "Reduced delays"],
    ["roles.0.start", "01/2020"],
    ["roles.0.end", "01/2021"],
    ["roles.0.ongoing", "false"],
  ].map(([path, value], i) => ({
    id: `auto${i}`,
    path,
    value,
    quote: value,
    page: 1,
    confidence: "high",
  }));
  const draft = decodeDraft(encodeDraft(importedDraft(input)));
  const role = draft.roles[0];
  const context = careerContext(draft, role.id);
  expect(context.facts.map((f) => f.text)).toEqual([
    "Maintained records",
    "Reduced delays",
  ]);
  expect(pendingImportedCandidates(draft)).toEqual([]);
  const wording = acceptWording(draft, role.id, {
    text: "Maintained records and reduced delays",
    scope: "experience",
    origin: "user_authored",
    sources: context.facts,
  });
  expect(currentWording(wording, role.id)).toBe(
    "Maintained records and reduced delays",
  );
  const view = render(
    <LanguageContext value="en">
      <DocumentPreview draft={draft} asOf={{ year: "2026", month: "10" }} />
    </LanguageContext>,
  );
  expect(view.container.querySelector(".duration-note p")?.textContent).toBe(
    "1 year",
  );
  expect(
    view.container.querySelector(".document-role-duration")?.textContent,
  ).toBe("1 an");
  view.unmount();
  const historical = clone(draft);
  for (const field of allFacts(historical, true)) delete field.acceptance;
  expect(pendingImportedCandidates(historical)).toHaveLength(5);
  expect(() => careerContext(historical, role.id)).toThrow(
    "INVALID_SCOPED_CONTEXT",
  );
  for (const field of allFacts(historical, true))
    if (field.sourceClaimId) {
      field.status = "draft";
      field.acceptance = "automatic";
    }
  expect(pendingImportedCandidates(historical)).toHaveLength(5);
  expect(() => careerContext(historical, role.id)).toThrow(
    "INVALID_SCOPED_CONTEXT",
  );
});

it("stages specific prefix-like warnings and retains historical high-confidence review", () => {
  const input = clone(review);
  input.extraction.candidates = input.extraction.candidates.slice(0, 1);
  const candidate = input.extraction.candidates[0];
  candidate.confidence = "high";
  for (const notice of [
    "Native PDF transcription requires review against the original page.",
    "Native Word excerpt requires review; original pagination is unknown.",
  ]) {
    candidate.warning = notice;
    expect(requiresImportReview(candidate)).toBe(false);
    candidate.warning = notice + " Email is partly illegible.";
    expect(requiresImportReview(candidate)).toBe(true);
  }
  candidate.warning =
    "Native PDF transcription requires review: email is partly illegible";
  const draft = importedDraft(input);
  expect(draft.name.acceptance).toBeUndefined();
  const view = render(
    <LanguageContext value="en">
      <ImportReview draft={draft} disabled={false} confirm={() => {}} />
    </LanguageContext>,
  );
  expect(screen.getByText(candidate.warning)).toBeTruthy();
  expect(
    within(
      document.querySelector(".import-information") as HTMLElement,
    ).getByText("Synthetic Owner"),
  ).toBeTruthy();
  view.unmount();
  delete candidate.warning;
  const historical = importedDraft(input);
  delete historical.name.acceptance;
  render(
    <LanguageContext value="en">
      <ImportReview draft={historical} disabled={false} confirm={() => {}} />
    </LanguageContext>,
  );
  expect(
    within(
      document.querySelector(".import-information") as HTMLElement,
    ).getByText("Synthetic Owner"),
  ).toBeTruthy();
});

it("keeps a details-only custom import in one editable category without inventing a title", () => {
  const input = clone(review);
  input.extraction.candidates = input.extraction.candidates.filter(
    (c) => c.path === "custom.0.details",
  );
  let latest = importedDraft(input);
  const section = latest.optionalSections.find(
    (s) => s.id === "import-custom-0",
  )!;
  expect(section.heading!.value).toBe("");
  expect(
    validateDraft(latest).some((i) => i.field === section.heading!.fieldId),
  ).toBe(true);
  expect(
    validateDraft(latest).some(
      (i) => i.field === section.entries[0].title.fieldId,
    ),
  ).toBe(false);
  function Surface() {
    const [draft, setDraft] = useState(latest);
    return (
      <LanguageContext value="en">
        <Editor
          draft={draft}
          issues={[]}
          change={(next) => {
            latest = next;
            setDraft(next);
          }}
        />
      </LanguageContext>
    );
  }
  render(<Surface />);
  const category = document.querySelector("#section-import-custom-0")!;
  fireEvent.click(category.querySelector("summary")!);
  fireEvent.change(
    within(category as HTMLElement).getByRole("textbox", { name: "Category" }),
    { target: { value: "Honors" } },
  );
  expect(
    latest.optionalSections.find((s) => s.id === section.id)!.heading!.value,
  ).toBe("Honors");
});
