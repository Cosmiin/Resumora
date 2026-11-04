import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { App } from "../App";
import { cvRoute, type CvDraftGateway } from "../../../api/src/cv/routes";
import { ImportDocument } from "./ImportDocument";
import { ImportProfileUpdates } from "./ImportProfileUpdates";
import { LanguageContext } from "./ui";
import { MemoryBaseCvAdapter } from "../base/adapter";
import {
  blankDraft,
  clone,
  fact,
  newRole,
  type BaseDraft,
} from "../base/model";
import {
  applyProfileImport,
  identityComparison,
  profileImportUpdates,
} from "../base/import-updates";
import {
  confirmImported,
  importedDraft,
  importedFact,
  pendingImportedCandidates,
} from "@resumora/contracts/editor/import";
import { decodeDraft, encodeDraft } from "@resumora/contracts/editor/transport";
import type { ImportReview } from "@resumora/contracts/intelligence/model";
import type { IntelligenceClient, ImportStatus } from "../base/intelligence";

function review(id = "new-import", name = "Synthetic Owner"): ImportReview {
  return {
    id,
    format: "pdf",
    sourceHash: "a".repeat(64),
    parserVersion: "synthetic",
    pages: 1,
    admission: { kind: "cv", reason: "CV", pages: [1] },
    confirmedIds: [],
    extraction: {
      schemaVersion: "cv-extraction/1",
      warnings: [],
      omittedPages: [],
      candidates: [
        ["name", name],
        ["contacts.email", "new@example.invalid"],
        ["roles.0.title", "Analyst"],
        ["roles.0.company", "Example company"],
        ["roles.0.context", "New description"],
        ["roles.0.bullets.0", "New contribution"],
        ["education.0.institution", "Example school"],
        ["professionalSkills.0", "Analysis"],
        ["custom.0.title", "Awards"],
        ["custom.0.details", "Synthetic award"],
        ["languages.0.title", "English"],
        ["languages.0.proficiency", "C1"],
      ].map(([path, value], index) => ({
        id: `c${index}`,
        path,
        value,
        quote: value,
        page: 1,
        confidence: "low" as const,
      })),
    },
  };
}
function profile(): BaseDraft {
  const d = blankDraft();
  d.name.value = "Synthetic Owner";
  d.nameParts = { first: "Synthetic", last: "Owner" };
  d.contacts[0].value.value = "owner@example.invalid";
  const role = newRole();
  role.title.value = "Original role";
  role.company.value = "Original company";
  role.start.value = { year: "2020", month: "" };
  role.context.value = "Original description";
  role.bullets = [fact("Previous contribution")];
  d.roles.push(role);
  d.answers.push({
    id: "answer",
    targetId: role.id,
    question: "impact",
    text: "Useful confirmed achievement",
    status: "confirmed",
    questionText: "What changed?",
  });
  d.summary.text = "A summary to preserve";
  d.presentation.hidden = ["education"];
  return d;
}
function client(rows: ImportStatus[]): IntelligenceClient {
  return {
    listImports: vi.fn(async () => rows),
    importStatus: vi.fn(async (id) => rows.find((r) => r.id === id)!),
    importDocument: vi.fn(),
    cancelImport: vi.fn(async () => {}),
    questions: vi.fn(),
    rewrite: vi.fn(),
  };
}

it("applies only selected changes and retains role identity, enrichment, absent fields and presentation", () => {
  const original = profile(),
    before = clone(original),
    r = review();
  original.presentation.approvedWording = {
    [original.roles[0].id]: { text: "Old overlay", sources: [] },
  };
  original.presentation.contributionHtml = {
    [original.roles[0].id]: "<p>Old layout</p>",
  };
  const merged = applyProfileImport(
    original,
    r,
    ["roles.0", "professionalSkills.0", "custom.0", "languages.0"],
    { "roles.0": original.roles[0].id },
  );
  expect(merged.id).toBe(original.id);
  expect(merged.name).toEqual(original.name);
  expect(merged.contacts).toEqual(original.contacts);
  expect(merged.roles[0].id).toBe(original.roles[0].id);
  expect(merged.roles[0].context.value).toBe("New description");
  expect(merged.roles[0].context.fieldId).toBe(
    original.roles[0].context.fieldId,
  );
  expect(merged.roles[0].start).toEqual(original.roles[0].start);
  expect(merged.roles[0].bullets.map((f) => f.value)).toEqual([
    "Previous contribution",
    "New contribution",
  ]);
  expect(merged.answers).toEqual(before.answers);
  expect(merged.summary).toEqual(before.summary);
  expect(merged.presentation.hidden).toEqual(before.presentation.hidden);
  expect(
    merged.presentation.approvedWording?.[original.roles[0].id],
  ).toBeUndefined();
  expect(
    merged.presentation.contributionHtml?.[original.roles[0].id],
  ).toBeUndefined();
  expect(merged.education).toEqual([]);
  expect(
    merged.optionalSections.find((s) => s.kind === "custom")?.heading?.value,
  ).toBe("Awards");
  expect(pendingImportedCandidates(merged)).toEqual([]);
  expect(decodeDraft(encodeDraft(merged))).toEqual(merged);
  expect(original.roles[0].context.value).toBe("Original description");
});

it("never matches roles by collection position or clears old roles when adding a new one", () => {
  const original = profile(),
    r = review();
  expect(() => applyProfileImport(original, r, ["roles.0"], {})).toThrow(
    "INVALID_IMPORT_TARGET",
  );
  const next = applyProfileImport(original, r, ["roles.0"], {
    "roles.0": "new",
  });
  expect(next.roles).toHaveLength(2);
  expect(next.roles[0]).toEqual(original.roles[0]);
  expect(next.answers[0].targetId).toBe(original.roles[0].id);
  expect(next.roles[1].id).not.toBe(original.roles[0].id);
  expect(() =>
    applyProfileImport(original, r, ["roles.0"], { "roles.0": "foreign-role" }),
  ).toThrow();
});

it("scopes repeated candidate IDs to their extraction and never promotes an old fact", () => {
  const old = review("old-import", "Original identity");
  const original = confirmImported(
    importedDraft(old),
    old.extraction.candidates.map((c) => c.id),
  );
  // Simulate a historical accepted extraction; the new file repeats c0/c1.
  original.contacts[0].value.status = "extracted_unconfirmed";
  original.contacts[0].value.acceptance = "automatic";
  const r = review("new-import", "New identity");
  const next = applyProfileImport(original, r, ["name"], {});
  expect(next.name.value).toBe("New identity");
  expect(next.contacts[0].value).toEqual(original.contacts[0].value);
  expect(importedFact(next, r.extraction.candidates[1])).toBeUndefined();
  expect(pendingImportedCandidates(next)).toEqual([]);
  expect(next.importReview?.confirmedIds).toEqual(["c0"]);
  expect(
    next.sources.some((s) => s.locator?.startsWith("import:old-import:")),
  ).toBe(true);
});

it("blocks a second import while the current profile still has pending factual review", () => {
  expect(() =>
    applyProfileImport(importedDraft(review("old")), review(), ["name"], {}),
  ).toThrow("PENDING_PROFILE_REVIEW");
});

it("retains earlier confirmations when applying another selection from the same saved import", () => {
  const r = review();
  const first = applyProfileImport(profile(), r, ["professionalSkills.0"], {});
  const second = applyProfileImport(first, r, ["contacts.email"], {});
  expect(second.importReview?.confirmedIds).toEqual(["c7", "c1"]);
  expect(pendingImportedCandidates(second)).toEqual([]);
  expect(second.professionalSkills).toEqual(first.professionalSkills);
  expect(second.contacts[0].value.value).toBe("new@example.invalid");
});

it("round-trips the additive profile through the API's atomic import-confirmation save path", async () => {
  const original = profile(),
    r = review(crypto.randomUUID());
  const merged = applyProfileImport(original, r, ["professionalSkills.0"], {});
  const saveReviewedImport = vi.fn(
    async (
      input: Parameters<NonNullable<CvDraftGateway["saveReviewedImport"]>>[0],
    ) => ({
      id: crypto.randomUUID(),
      revision: input.expectedRevision + 1,
      parentId: null,
      createdAt: "2026-10-30T20:00:00Z",
      reason: "save" as const,
      payload: input.payload,
    }),
  );
  const response = await cvRoute(
    new Request("http://local.test/v1/base-cv/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requestId: crypto.randomUUID(),
        expectedRevision: 42,
        mode: "autosave",
        draft: merged,
      }),
    }),
    { saveReviewedImport } as unknown as CvDraftGateway,
  );
  expect(response.status).toBe(200);
  expect(saveReviewedImport).toHaveBeenCalledWith(
    expect.objectContaining({
      importId: r.id,
      expectedRevision: 42,
      selected: ["c7"],
    }),
  );
  const saved = await response.json();
  expect(saved.revision).toBe(43);
  expect(saved.draft.answers).toEqual(original.answers);
  expect(saved.draft.name).toEqual(original.name);
  expect(saved.draft.importReview.extraction).toEqual(r.extraction);
});

it("keeps a known name counterpart when the updated CV supplies only one explicit name part", () => {
  const original = profile(),
    r = review();
  r.extraction.candidates = [
    {
      id: "first",
      path: "nameParts.first",
      value: "Updated",
      quote: "Updated",
      page: 1,
      confidence: "low",
    },
  ];
  expect(profileImportUpdates(original, importedDraft(r))[0].incoming).toBe(
    "Updated Owner",
  );
  const next = applyProfileImport(original, r, ["name"], {});
  expect(next.nameParts).toEqual({ first: "Updated", last: "Owner" });
  expect(next.name.value).toBe("Updated Owner");
  expect(next.importReview?.extraction).toEqual(r.extraction);
  expect(pendingImportedCandidates(next)).toEqual([]);
});

it("does not collapse different skills or contributions whose punctuation changes their meaning", () => {
  const original = profile(),
    r = review();
  original.professionalSkills.push(fact("C++"));
  original.roles[0].bullets.push(fact("Improved performance by 5"));
  Object.assign(
    r.extraction.candidates.find((c) => c.path === "professionalSkills.0")!,
    { value: "C#", quote: "C#" },
  );
  Object.assign(
    r.extraction.candidates.find((c) => c.path === "roles.0.bullets.0")!,
    {
      value: "Improved performance by 5%",
      quote: "Improved performance by 5%",
    },
  );
  const next = applyProfileImport(
    original,
    r,
    ["professionalSkills.0", "roles.0"],
    { "roles.0": original.roles[0].id },
  );
  expect(next.professionalSkills.map((f) => f.value)).toEqual(["C++", "C#"]);
  expect(next.roles[0].bullets.map((f) => f.value)).toContain(
    "Improved performance by 5%",
  );
});

it("resets ownership and selections when the profile being reviewed changes", () => {
  const original = profile(),
    r = review(),
    apply = vi.fn(() => true),
    cancel = vi.fn();
  const view = render(
    <LanguageContext value="en">
      <ImportProfileUpdates
        profile={original}
        review={r}
        apply={apply}
        cancel={cancel}
        disabled={false}
      />
    </LanguageContext>,
  );
  fireEvent.click(
    screen.getByRole("checkbox", { name: /I confirm this CV belongs/ }),
  );
  fireEvent.click(screen.getByRole("checkbox", { name: "Use: Email" }));
  expect(
    screen.getByRole("button", { name: /Apply \d+ selected updates/ }),
  ).toHaveProperty("disabled", false);
  const changed = clone(original);
  changed.name.value = "Changed elsewhere";
  view.rerender(
    <LanguageContext value="en">
      <ImportProfileUpdates
        profile={changed}
        review={r}
        apply={apply}
        cancel={cancel}
        disabled={false}
      />
    </LanguageContext>,
  );
  expect(
    screen.getByRole("checkbox", { name: /I confirm this CV belongs/ }),
  ).toHaveProperty("checked", false);
  expect(screen.getByRole("checkbox", { name: "Use: Email" })).toHaveProperty(
    "checked",
    false,
  );
  expect(
    screen.getByRole("button", { name: /Apply \d+ selected updates/ }),
  ).toHaveProperty("disabled", true);
  expect(apply).not.toHaveBeenCalled();
});

it("warns on changed identity without treating formatting or name order as another person", () => {
  const original = profile();
  original.name.value = "Șerban Ana-Maria";
  original.contacts[0].value.value = "OWNER@example.invalid";
  const incoming = importedDraft(review("new", "Ana Maria Serban"));
  incoming.contacts[0].value.value = "owner@example.invalid";
  expect(identityComparison(original, incoming).some((r) => r.differs)).toBe(
    false,
  );
  incoming.name.value = "A Different Person";
  expect(
    identityComparison(original, incoming).find((r) => r.key === "name")
      ?.differs,
  ).toBe(true);
  incoming.name.value = "";
  expect(
    identityComparison(original, incoming).find((r) => r.key === "name")
      ?.differs,
  ).toBe(false);
});

it.each(["ro", "en"] as const)(
  "requires ownership and deliberate selection before applying an update (%s)",
  (locale) => {
    const apply = vi.fn((_next: BaseDraft, _original: BaseDraft) => true),
      cancel = vi.fn();
    render(
      <LanguageContext value={locale}>
        <ImportProfileUpdates
          profile={profile()}
          review={review("new", "Different Person")}
          apply={apply}
          cancel={cancel}
          disabled={false}
        />
      </LanguageContext>,
    );
    expect(
      screen.getByRole("heading", {
        name:
          locale === "en"
            ? "This CV may belong to someone else"
            : "Acest CV poate aparține altei persoane",
      }),
    ).toBeTruthy();
    const submit = screen.getByRole("button", {
      name:
        locale === "en"
          ? /Apply \d+ selected updates/
          : /Aplică \d+ actualizări selectate/,
    });
    expect(submit).toHaveProperty("disabled", true);
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: locale === "en" ? "Use: Name" : "Folosește: Nume",
      }),
    );
    expect(submit).toHaveProperty("disabled", true);
    fireEvent.click(
      screen.getByRole("checkbox", {
        name:
          locale === "en" ? /I confirm this CV belongs/ : /Confirm că acest CV/,
      }),
    );
    expect(submit).toHaveProperty("disabled", false);
    fireEvent.click(submit);
    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply.mock.calls[0][0].name.value).toBe("Different Person");
    expect(apply.mock.calls[0][0].contacts[0].value.value).toBe(
      "owner@example.invalid",
    );
  },
);

it("blocks recovered second imports while a profile exists", async () => {
  const start = vi.fn(),
    apply = vi.fn(),
    c = client([
      { id: "a", state: "ready", format: "pdf", review: review("a") },
    ]);
  render(
    <LanguageContext value="en">
      <ImportDocument
        client={c}
        revision={1}
        profile={profile()}
        start={start}
        applyUpdate={apply}
      />
    </LanguageContext>,
  );
  expect(
    screen.getByText(/Delete your current Base CV before uploading another/),
  ).toBeTruthy();
  expect(screen.queryByText("Recent account imports")).toBeNull();
  expect(start).not.toHaveBeenCalled();
  expect(apply).not.toHaveBeenCalled();
  expect(c.importDocument).not.toHaveBeenCalled();
  expect(c.cancelImport).not.toHaveBeenCalled();
});

it("keeps the saved profile untouched when a direct route attempts another upload", async () => {
  const adapter = new MemoryBaseCvAdapter(),
    original = profile();
  await adapter.save({
    draft: original,
    expectedRevision: 0,
    mode: "autosave",
    requestId: crypto.randomUUID(),
  });
  const c = client([
    {
      id: crypto.randomUUID(),
      state: "ready",
      format: "pdf",
      review: review(),
    },
  ]);
  window.location.hash = "start";
  render(<App adapter={adapter} intelligence={c} />);
  await screen.findByText(/Șterge CV-ul de bază actual înainte/);
  expect(
    screen.queryByRole("button", { name: "Actualizează dintr-un CV" }),
  ).toBeNull();
  expect((await adapter.load())!.draft).toEqual(original);
  expect(c.importDocument).not.toHaveBeenCalled();
  expect(c.questions).not.toHaveBeenCalled();
  expect(c.rewrite).not.toHaveBeenCalled();
});

it("leaves duplicate skills unoffered and rejects an empty or unknown selection", () => {
  const original = profile();
  original.professionalSkills.push(fact("analysis"));
  expect(
    profileImportUpdates(original, importedDraft(review())).some(
      (u) => u.key === "professionalSkills.0",
    ),
  ).toBe(false);
  expect(() => applyProfileImport(original, review(), [], {})).toThrow(
    "INVALID_IMPORT_SELECTION",
  );
  expect(() => applyProfileImport(original, review(), ["missing"], {})).toThrow(
    "INVALID_IMPORT_SELECTION",
  );
});

it("adds and updates a reviewed personal website without replacing LinkedIn or duplicating contacts", () => {
  const original = profile(),
    r = review();
  r.extraction.candidates = [
    {
      id: "website",
      path: "contacts.website",
      value: "https://portfolio.example.com",
      quote: "https://portfolio.example.com",
      page: 1,
      confidence: "high",
    },
  ];
  const next = applyProfileImport(original, r, ["contacts.website"], {});
  expect(next.contacts.find((c) => c.platform === "website")?.value.value).toBe(
    "https://portfolio.example.com",
  );
  expect(
    next.contacts.find((c) => c.platform === "website")?.value.status,
  ).toBe("user_confirmed");
  expect(next.contacts.find((c) => c.platform === "linkedin")).toEqual(
    original.contacts.find((c) => c.platform === "linkedin"),
  );
  const r2 = {
    ...r,
    id: "another-website-import",
    extraction: {
      ...r.extraction,
      candidates: [
        {
          ...r.extraction.candidates[0],
          value: "https://new-portfolio.example.com",
          quote: "https://new-portfolio.example.com",
        },
      ],
    },
  };
  const updated = applyProfileImport(next, r2, ["contacts.website"], {});
  expect(updated.contacts.filter((c) => c.platform === "website")).toHaveLength(
    1,
  );
  expect(
    updated.contacts.find((c) => c.platform === "website")?.value.value,
  ).toBe("https://new-portfolio.example.com");
  expect(updated.contacts.find((c) => c.platform === "website")?.id).toBe(
    next.contacts.find((c) => c.platform === "website")?.id,
  );
  expect(original.contacts.some((c) => c.platform === "website")).toBe(false);
});
