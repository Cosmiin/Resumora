import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { App } from "../App";
import { MemoryBaseCvAdapter } from "../base/adapter";
import { patchFact, setContributions } from "../base/editing";
import { ImportReview } from "./ImportReview";
import { LanguageContext } from "./ui";
import {
  confirmImported,
  importedDraft,
  importedFact,
  pendingImportedCandidates,
} from "@resumora/contracts/editor/import";
import { decodeDraft, encodeDraft } from "@resumora/contracts/editor/transport";
import type { ImportReview as Review } from "@resumora/contracts/intelligence/model";

function extraction(): Review {
  const fields = [
    ["name", "Synthetic Owner"],
    ["contacts.email", "owner@example.invalid"],
    ["roles.0.title", "Engineer"],
    ["roles.0.company", "Synthetic company"],
    ["roles.0.ongoing", "true"],
    ["roles.0.end", "2021"],
    ["roles.0.bullets.0", "Kept records"],
    ["education.0.institution", "Synthetic school"],
    ["education.0.end", "2020"],
    ["professionalSkills.0", "Communication"],
    ["technicalSkills.0", "SQL"],
    ["certifications.0.title", "Certificate"],
    ["certifications.0.details", "Source course"],
    ["certifications.0.end", "2019"],
    ["custom.0.title", "Awards"],
    ["custom.0.details", "Source award"],
    ["languages.0.title", "English"],
    ["languages.0.proficiency", "Native"],
  ];
  return {
    id: crypto.randomUUID(),
    sourceHash: "a".repeat(64),
    format: "pdf",
    parserVersion: "synthetic",
    pages: 1,
    admission: { kind: "cv", reason: "CV", pages: [1] },
    confirmedIds: [],
    extraction: {
      schemaVersion: "cv-extraction/1",
      warnings: [],
      omittedPages: [],
      candidates: fields.map(([path, value], i) => ({
        id: `candidate${i}`,
        path,
        value,
        quote: value,
        page: 1,
        confidence: path === "contacts.email" ? "low" : "high",
      })),
    },
  };
}
const removals = [
  {
    name: "role",
    section: "experience",
    button: "Remove experience",
    prefix: "roles.0.",
  },
  {
    name: "education",
    section: "education",
    button: "Remove education",
    prefix: "education.0.",
  },
  {
    name: "professional skill",
    section: "professionalSkills",
    button: "Remove: Communication",
    prefix: "professionalSkills.0",
  },
  {
    name: "technical skill",
    section: "technicalSkills",
    button: "Remove: SQL",
    prefix: "technicalSkills.0",
  },
  { name: "contribution", section: "experience", prefix: "roles.0.bullets.0" },
  {
    name: "certification entry",
    section: "import-certifications",
    button: "Remove entry",
    prefix: "certifications.0.",
  },
  {
    name: "language entry",
    section: "languages",
    button: "Remove entry",
    prefix: "languages.0.",
  },
  {
    name: "custom content entry",
    section: "import-custom-0",
    button: "Remove entry",
    prefix: "custom.0.details",
  },
  {
    name: "certification section",
    section: "import-certifications",
    button: "Remove section",
    prefix: "certifications.0.",
  },
  {
    name: "custom section",
    section: "import-custom-0",
    button: "Remove section",
    prefix: "custom.0.",
  },
];
it.each(removals)(
  "keeps review closed after removing an accepted $name through the editor",
  async ({ section, button, prefix }) => {
    const review = extraction();
    const adapter = new MemoryBaseCvAdapter();
    await adapter.save({
      draft: importedDraft(review),
      mode: "autosave",
      expectedRevision: 0,
      requestId: crypto.randomUUID(),
    });
    window.location.hash = "base";
    const view = render(<App adapter={adapter} />);
    fireEvent.change(await screen.findByLabelText("Limba interfeței"), {
      target: { value: "en" },
    });
    fireEvent.click(
      await screen.findByRole("button", { name: "Confirm and open editor" }),
    );
    await waitFor(async () => expect((await adapter.load())!.revision).toBe(2));
    const before = (await adapter.load())!.draft;
    const deleted = review.extraction.candidates.filter((c) =>
      c.path.startsWith(prefix),
    );
    expect(deleted.length).toBeGreaterThan(0);
    const panel = document.getElementById(`section-${section}`)!;
    fireEvent.click(panel.querySelector("summary")!);
    if (button)
      fireEvent.click(within(panel).getByRole("button", { name: button }));
    else {
      const contributions = within(panel).getByRole("textbox", {
        name: "Contributions",
      });
      contributions.innerHTML = "";
      fireEvent.input(contributions);
    }
    expect(document.querySelector("[data-editor]")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Review Base CV" })).toBeNull();
    await waitFor(
      async () => {
        const saved = (await adapter.load())!.draft;
        for (const candidate of deleted)
          expect(importedFact(saved, candidate)).toBeUndefined();
      },
      { timeout: 2000 },
    );
    const saved = decodeDraft(encodeDraft((await adapter.load())!.draft));
    expect(pendingImportedCandidates(saved)).toEqual([]);
    expect(saved.importReview).toEqual(before.importReview);
    expect(saved.sources).toEqual(before.sources);
    for (const candidate of deleted) {
      expect(() => confirmImported(saved, [candidate.id])).toThrow(
        "INVALID_REVIEW_SELECTION",
      );
      const name = review.extraction.candidates.find((c) => c.path === "name")!;
      expect(() => confirmImported(saved, [name.id, candidate.id])).toThrow(
        "INVALID_REVIEW_SELECTION",
      );
    }
    expect(saved.importReview!.confirmedIds).toEqual(
      before.importReview!.confirmedIds,
    );
    const history = await adapter.history();
    expect(
      history.some((s) => deleted.every((c) => importedFact(s.draft, c))),
    ).toBe(true);
    view.unmount();
    render(<App adapter={adapter} />);
    await waitFor(() =>
      expect(document.querySelector("[data-editor]")).toBeTruthy(),
    );
    expect(document.querySelector(".import-review")).toBeNull();
  },
);

it("keeps present unaccepted facts staged, including inactive dates and edited lineage, when siblings are removed or restored", async () => {
  const review = extraction();
  review.extraction.candidates = review.extraction.candidates.filter((c) =>
    c.path.startsWith("roles.0."),
  );
  for (const candidate of review.extraction.candidates)
    candidate.confidence = "low";
  let draft = importedDraft(review);
  const role = draft.roles[0];
  draft = patchFact(draft, role.end, { year: "2022", month: "" });
  const end = review.extraction.candidates.find(
    (c) => c.path === "roles.0.end",
  )!;
  const bullet = review.extraction.candidates.find(
    (c) => c.path === "roles.0.bullets.0",
  )!;
  expect(
    importedFact(draft, end)!.sourceLineage?.some(
      (s) => s.sourceClaimId === end.id,
    ),
  ).toBe(true);
  const adapter = new MemoryBaseCvAdapter();
  const original = await adapter.save({
    draft,
    mode: "autosave",
    expectedRevision: 0,
    requestId: crypto.randomUUID(),
  });
  const removed = setContributions(draft, role.id, { html: "", fields: [] });
  const pending = pendingImportedCandidates(removed).map((c) => c.id);
  expect(pending).toContain(end.id);
  expect(pending).not.toContain(bullet.id);
  expect(() => confirmImported(removed, [bullet.id])).toThrow(
    "INVALID_REVIEW_SELECTION",
  );
  const confirm = vi.fn();
  const view = render(
    <LanguageContext value="en">
      <ImportReview
        draft={removed}
        disabled={false}
        confirm={confirm}
        change={() => {}}
      />
    </LanguageContext>,
  );
  expect(screen.getByDisplayValue("2022")).toBeTruthy();
  expect(screen.queryByDisplayValue("Kept records")).toBeNull();
  fireEvent.click(
    screen.getByRole("button", { name: "Confirm and open editor" }),
  );
  expect(confirm).toHaveBeenCalledWith(pending);
  const reviewed = confirmImported(removed, pending);
  expect(reviewed.importReview!.confirmedIds).not.toContain(bullet.id);
  expect(reviewed.roles[0].end.value.year).toBe("2022");
  expect(reviewed.roles[0].end.status).toBe("user_authored");
  expect(reviewed.sources).toEqual(original.draft.sources);
  view.unmount();
  await adapter.save({
    draft: removed,
    mode: "autosave",
    expectedRevision: 1,
    requestId: crypto.randomUUID(),
  });
  const restored = await adapter.restore({
    snapshotId: original.id,
    expectedRevision: 2,
    requestId: crypto.randomUUID(),
  });
  expect(pendingImportedCandidates(restored.draft).map((c) => c.id)).toContain(
    bullet.id,
  );
  expect(pendingImportedCandidates(restored.draft).map((c) => c.id)).toContain(
    end.id,
  );
  expect(restored.draft.importReview!.confirmedIds).toEqual([]);
  render(
    <LanguageContext value="en">
      <ImportReview
        draft={restored.draft}
        disabled={false}
        confirm={() => {}}
      />
    </LanguageContext>,
  );
  expect(screen.getByDisplayValue("Kept records")).toBeTruthy();
  expect(screen.getByDisplayValue("2022")).toBeTruthy();
});

it("retains previous confirmations after deletion without granting a new absent confirmation", () => {
  const review = extraction();
  const bullet = review.extraction.candidates.find(
    (c) => c.path === "roles.0.bullets.0",
  )!;
  const name = review.extraction.candidates.find((c) => c.path === "name")!;
  const confirmed = confirmImported(importedDraft(review), [bullet.id]);
  const removed = setContributions(confirmed, confirmed.roles[0].id, {
    html: "",
    fields: [],
  });
  const replay = confirmImported(removed, [bullet.id]);
  expect(replay.importReview).toEqual(removed.importReview);
  expect(replay.sources).toEqual(removed.sources);
  const next = confirmImported(removed, [name.id]);
  expect(next.importReview!.confirmedIds).toEqual([bullet.id, name.id]);
  expect(importedFact(next, bullet)).toBeUndefined();
  expect(removed.importReview!.confirmedIds).toEqual([bullet.id]);
});
