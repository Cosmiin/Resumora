import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { ImportReview } from "./ImportReview";
import { LanguageContext } from "./ui";
import {
  importedDraft,
  confirmImported,
} from "@resumora/contracts/editor/import";
import { allFacts, clone, type BaseDraft } from "../base/model";
import { encodeDraft, decodeDraft } from "@resumora/contracts/editor/transport";
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
      confidence: i === 0 ? "high" : "low",
    })),
    warnings: [],
    omittedPages: [],
  },
  confirmedIds: [],
};
it("reviews one editable section at a time, confirms only visible facts and retains original provenance and categories across save/reload", () => {
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
  expect(screen.queryByDisplayValue("Engineer")).toBeNull();
  expect(
    screen.getByDisplayValue("Synthetic Owner").closest(".review-source-field")
      ?.textContent,
  ).not.toContain("Please check");
  fireEvent.change(screen.getByLabelText("Name"), {
    target: { value: "Edited Owner" },
  });
  expect(latest.name.sourceLineage?.[0].sourceClaimId).toBe("c0");
  fireEvent.click(screen.getByRole("button", { name: "Confirm and continue" }));
  expect(latest.importReview!.confirmedIds).toEqual(["c0", "c1"]);
  expect(latest.name.value).toBe("Edited Owner");
  expect(latest.importReview!.extraction.candidates[0].value).toBe(
    "Synthetic Owner",
  );
  expect(screen.getByRole("heading", { name: "Summary" })).toBeTruthy();
  for (let i = 0; i < 3; i++)
    fireEvent.click(
      screen.getByRole("button", { name: "Confirm and continue" }),
    );
  fireEvent.change(screen.getByLabelText(/Start/), {
    target: { value: "13/2020" },
  });
  expect(
    (
      screen.getByRole("button", {
        name: "Confirm and continue",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  expect(screen.getByRole("alert").textContent).toContain("Correct the date");
  fireEvent.change(screen.getByLabelText(/Start/), {
    target: { value: "02/2020" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Confirm and continue" }));
  expect(screen.getByDisplayValue("Awards")).toBeTruthy();
  fireEvent.click(
    screen.getByRole("button", { name: "Confirm and open editor" }),
  );
  expect(latest.importReview!.confirmedIds).toHaveLength(paths.length);
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
        s.label === "Awards" && s.entries[0].details.value === "Original award",
    ),
  ).toBe(true);
  expect(restored.summary.text).toBe(""); // Original summary remains a sourced fact, never falsely authored prose.
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
