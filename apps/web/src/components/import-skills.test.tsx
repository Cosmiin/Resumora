import { selfContainedDocumentDraft } from "@resumora/contracts/editor/document";
import { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ImportSkills } from "./ImportSkills";
import { LanguageContext } from "./ui";
import {
  importedDraft,
  chooseImportSkill,
  confirmImported,
  importedFact,
  pendingImportSkills,
  importSkillChoice,
} from "@resumora/contracts/editor/import";
import {
  validateExtraction,
  type ImportReview,
} from "@resumora/contracts/intelligence/model";
import {
  encodeDraft,
  decodeDraft,
  isBaseDraft,
} from "@resumora/contracts/editor/transport";
import { blankDraft, fact, clone } from "../base/model";
import {
  profileImportUpdates,
  applyProfileImport,
} from "../base/import-updates";
function review(): ImportReview {
  return {
    id: crypto.randomUUID(),
    sourceHash: "a".repeat(64),
    format: "docx",
    parserVersion: "fixture",
    pages: null,
    admission: { kind: "cv", reason: "CV", pages: [] },
    confirmedIds: [],
    extraction: {
      schemaVersion: "cv-extraction/1",
      warnings: [],
      omittedPages: [],
      candidates: [
        ["name", "Synthetic Owner"],
        ["technicalSkills.0", "Salesforce"],
        ["professionalSkills.0", "Collaboration"],
        ["unclearSkills.0", "Management"],
      ].map(([path, value], i) => ({
        id: "c" + i,
        path,
        value,
        quote: value,
        page: null,
        confidence: "high",
      })),
    },
  };
}
it("validates the closed unclear-skill extraction path and retains its exact evidence without publishing it", () => {
  const r = review();
  expect(validateExtraction(r.extraction, [])).toBeTruthy();
  const d = importedDraft(r);
  expect(d.technicalSkills.map((f) => f.value)).toEqual(["Salesforce"]);
  expect(d.professionalSkills.map((f) => f.value)).toEqual(["Collaboration"]);
  expect(d.sources.some((s) => s.text === "Management")).toBe(true);
  expect(
    d.optionalSections.some((s) => s.heading?.value === "Core skills"),
  ).toBe(false);
  const invalid = clone(r.extraction);
  invalid.candidates[3].path = "unclearSkills.100";
  expect(() => validateExtraction(invalid, [])).toThrow();
});
it("moves the same sourced fact, roundtrips choices, and never modifies extraction or confirms a suggestion", () => {
  const d = importedDraft(review()),
    original = clone(d.importReview),
    field = d.technicalSkills[0];
  const changed = chooseImportSkill(d, "c1", "professionalSkills");
  expect(changed.technicalSkills).toHaveLength(0);
  expect(
    changed.professionalSkills.find((f) => f.id === field.id)?.sourceClaimId,
  ).toBe("c1");
  expect(changed.importReview).toEqual(original);
  expect(changed.importReview?.confirmedIds).toEqual([]);
  expect(decodeDraft(encodeDraft(changed)).importSkillChoices).toEqual({
    c1: "professionalSkills",
  });
  const bad = clone(changed);
  bad.importSkillChoices = { foreign: "technicalSkills" };
  expect(isBaseDraft(bad)).toBe(false);
});
it("lets a user restore an unclear item or exclude a clear one before explicit confirmation", () => {
  let d = importedDraft(review());
  d = chooseImportSkill(d, "c3", "professionalSkills");
  d = chooseImportSkill(d, "c1", "omit");
  expect(
    importedFact(d, d.importReview!.extraction.candidates[1]),
  ).toBeUndefined();
  const ids = d
    .importReview!.extraction.candidates.filter((c) => importedFact(d, c))
    .map((c) => c.id);
  const next = confirmImported(d, ids);
  expect(next.professionalSkills.map((f) => f.value)).toEqual([
    "Collaboration",
    "Management",
  ]);
  expect(
    next.professionalSkills.every((f) => f.status === "user_confirmed"),
  ).toBe(true);
  expect(next.importReview!.extraction).toEqual(d.importReview!.extraction);
});
it("applies reviewed categories additively to future imports while keeping saved Profile skills intact", () => {
  const profile = blankDraft();
  profile.professionalSkills = [fact("Existing ambiguous skill")];
  const before = clone(profile),
    r = review();
  let incoming = chooseImportSkill(
    importedDraft(r),
    "c1",
    "professionalSkills",
  );
  incoming = chooseImportSkill(incoming, "c3", "technicalSkills");
  const updates = profileImportUpdates(profile, incoming).filter((u) =>
    u.candidateIds.some((id) => ["c1", "c3"].includes(id)),
  );
  const next = applyProfileImport(
    profile,
    r,
    updates.map((u) => u.key),
    {},
    incoming.importSkillChoices,
  );
  expect(next.professionalSkills.map((f) => f.value)).toEqual([
    "Existing ambiguous skill",
    "Salesforce",
  ]);
  expect(next.technicalSkills.map((f) => f.value)).toEqual(["Management"]);
  expect(profile).toEqual(before);
});
it("keeps unclear skills visible and allows category correction without applying anything", () => {
  const start = importedDraft(review()),
    save = vi.fn();
  function Harness() {
    const [d, set] = useState(start);
    return (
      <LanguageContext value="en">
        <ImportSkills
          draft={d}
          disabled={false}
          change={(n) => {
            set(n);
            save(n);
          }}
        />
      </LanguageContext>
    );
  }
  render(<Harness />);
  expect(screen.queryByText("1 excluded · Review")).toBeNull();
  expect(
    screen.getByRole("region", { name: "Choose a category" }),
  ).toBeTruthy();
  fireEvent.click(
    screen.getByRole("button", { name: "Professional skills: Management" }),
  );
  expect(
    within(
      screen.getByRole("region", { name: "Professional skills" }),
    ).getByRole("button", { name: "Move: Management" }),
  ).toBeTruthy();
  expect(screen.queryByText("1 excluded · Review")).toBeNull();
  expect(save.mock.calls[0][0].importReview.confirmedIds).toEqual([]);
});

it("removes import-only classification choices from independent accepted job CVs", () => {
  const d = chooseImportSkill(
    importedDraft(review()),
    "c1",
    "professionalSkills",
  );
  const current = selfContainedDocumentDraft(d);
  expect(current.importReview).toBeUndefined();
  expect(current.importSkillChoices).toBeUndefined();
  expect(current.professionalSkills.map((f) => f.value)).toContain(
    "Salesforce",
  );
  expect(isBaseDraft(current)).toBe(true);
});

it("moves, removes and undoes a tag without reverting another choice or changing source evidence", () => {
  const initial = importedDraft(review()),
    before = clone(initial.importReview);
  let latest = initial;
  function Harness() {
    const [d, set] = useState(initial);
    return (
      <LanguageContext value="en">
        <ImportSkills
          draft={d}
          disabled={false}
          change={(next) => {
            latest = next;
            set(next);
          }}
        />
      </LanguageContext>
    );
  }
  render(<Harness />);
  expect(
    screen.queryByRole("heading", { name: /Proposed for removal/ }),
  ).toBeNull();
  expect(screen.queryByRole("combobox")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Remove: Salesforce" }));
  expect(screen.queryByRole("button", { name: "Move: Salesforce" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Move: Collaboration" }));
  fireEvent.click(
    screen.getByRole("button", { name: "Move to technical skills" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Undo removal" }));
  const technical = screen.getByRole("region", { name: "Technical skills" });
  expect(
    within(technical).getByRole("button", { name: "Move: Salesforce" }),
  ).toBeTruthy();
  expect(
    within(technical).getByRole("button", { name: "Move: Collaboration" }),
  ).toBeTruthy();
  expect(latest.technicalSkills.find((f) => f.value === "Salesforce")).toEqual(
    initial.technicalSkills.find((f) => f.value === "Salesforce"),
  );
  expect(latest.importReview).toEqual(before);
  expect(latest.importReview?.confirmedIds).toEqual([]);
});

it("requires an explicit decision for unclassified skills while keeping the original candidates and source quotes", () => {
  const d = importedDraft(review()),
    c = d.importReview!.extraction.candidates[3],
    before = clone(d.importReview);
  expect(importSkillChoice(d, c)).toBe("review");
  expect(pendingImportSkills(d).map((c) => c.id)).toEqual(["c3"]);
  expect(() => confirmImported(d, ["c0", "c1", "c2"])).toThrow(
    "UNCLASSIFIED_IMPORT_SKILLS",
  );
  const omitted = chooseImportSkill(d, "c3", "omit");
  expect(pendingImportSkills(omitted)).toHaveLength(0);
  expect(
    confirmImported(omitted, ["c0", "c1", "c2"]).importReview!.confirmedIds,
  ).toHaveLength(3);
  const reopened = chooseImportSkill(omitted, "c3", "review");
  expect(pendingImportSkills(reopened)).toHaveLength(1);
  expect(decodeDraft(encodeDraft(reopened))).toEqual(reopened);
  expect(reopened.importReview).toEqual(before);
});
it("batch classification keeps retained domain skills, respects earlier removals, and undo restores an unresolved item", () => {
  const r = review();
  r.extraction.candidates.push({
    id: "domain",
    path: "unclearSkills.1",
    value: "GDPR & cross-border compliance",
    quote: "GDPR & cross-border compliance",
    page: null,
    confidence: "medium",
    warning: "Category needs review",
  });
  let latest = chooseImportSkill(importedDraft(r), "c1", "omit");
  function Harness() {
    const [d, set] = useState(latest);
    return (
      <LanguageContext value="en">
        <ImportSkills
          draft={d}
          disabled={false}
          change={(n) => {
            latest = n;
            set(n);
          }}
        />
      </LanguageContext>
    );
  }
  render(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: "Remove: Management" }));
  expect(pendingImportSkills(latest).map((c) => c.id)).toEqual(["domain"]);
  fireEvent.click(screen.getByRole("button", { name: "Undo removal" }));
  expect(pendingImportSkills(latest)).toHaveLength(2);
  fireEvent.click(
    screen.getByRole("button", { name: "Keep all as professional skills" }),
  );
  expect(pendingImportSkills(latest)).toHaveLength(0);
  expect(latest.professionalSkills.map((f) => f.value)).toEqual([
    "Collaboration",
    "Management",
    "GDPR & cross-border compliance",
  ]);
  expect(latest.technicalSkills).toHaveLength(0);
  expect(latest.importSkillChoices?.c1).toBe("omit");
  expect(latest.importReview!.confirmedIds).toEqual([]);
  expect(latest.importReview!.extraction).toEqual(r.extraction);
});
