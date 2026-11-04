import { useState } from "react";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { importedDraft } from "@resumora/contracts/editor/import";
import type { ImportReview as Review } from "@resumora/contracts/intelligence/model";
import { ImportReview } from "./ImportReview";
import { LanguageContext } from "./ui";
import type { BaseDraft } from "../base/model";

function fixture(rows: [string, string, string?][]): Review {
  return {
    id: "navigation",
    format: "docx",
    sourceHash: "a".repeat(64),
    parserVersion: "fixture",
    pages: null,
    admission: { kind: "cv", reason: "CV", pages: [] },
    confirmedIds: [],
    extraction: {
      schemaVersion: "cv-extraction/1",
      warnings: [],
      omittedPages: [],
      candidates: rows.map(([path, value, warning], i) => ({
        id: `c${i}`,
        path,
        value,
        quote: value,
        page: null,
        confidence: "high",
        ...(warning ? { warning } : {}),
      })),
    },
  };
}
function mount(review: Review, locale: "ro" | "en" = "en") {
  let latest = importedDraft(review);
  const finish = vi.fn();
  function Harness() {
    const [draft, setDraft] = useState(latest);
    return (
      <LanguageContext value={locale}>
        <ImportReview
          draft={draft}
          change={(next: BaseDraft) => {
            latest = next;
            setDraft(next);
          }}
          disabled={false}
          confirm={finish}
          forceOverview
        />
      </LanguageContext>
    );
  }
  const result = render(<Harness />);
  return { ...result, latest: () => latest, finish };
}
it.each([
  ["en", "1 detail to check", "Confirm: Website or profile"],
  ["ro", "1 detaliu de verificat", "Confirmă: Website sau profil"],
] as const)(
  "navigates from the %s count to the exact field and confirms without publishing or changing evidence",
  async (locale, count, confirm) => {
    const review = fixture([
      ["name", "Owner"],
      ["contacts.website", "portfolio.example.com"],
    ]);
    const f = mount(review, locale);
    fireEvent.click(screen.getByRole("button", { name: count }));
    const field = f.container.querySelector(
      `[data-profile-fact="${f.latest().contacts.find((c) => c.value.sourceClaimId === "c1")!.value.fieldId}"]`,
    )!;
    await waitFor(() =>
      expect(field.contains(document.activeElement)).toBe(true),
    );
    expect(
      (
        within(field as HTMLElement)
          .getByText(locale === "en" ? "Check this detail" : "De verificat")
          .closest("details") as HTMLDetailsElement
      ).open,
    ).toBe(true);
    fireEvent.click(
      within(field as HTMLElement).getByRole("button", { name: confirm }),
    );
    expect(f.latest().importReview!.confirmedIds).toEqual(["c1"]);
    expect(
      f.latest().contacts.find((c) => c.value.sourceClaimId === "c1")!.value
        .status,
    ).toBe("user_confirmed");
    expect(f.latest().importReview!.extraction).toEqual(review.extraction);
    expect(f.finish).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: count })).toBeNull();
  },
);
it("lets each issue link navigate to its field, including summary, and keeps other warnings", async () => {
  const f = mount(
    fixture([
      ["name", "Owner"],
      ["summary", "Analyst", "Check the extracted summary"],
      ["roles.0.company", "Systems", "Check company"],
    ]),
  );
  expect(
    screen.getByRole("button", { name: "2 details to check" }),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Review: Summary" }));
  const field = f.container.querySelector(
    `[data-profile-fact="${f.latest().summary.provenance!.fieldId}"]`,
  )!;
  await waitFor(() =>
    expect(field.contains(document.activeElement)).toBe(true),
  );
  fireEvent.click(
    within(field as HTMLElement).getByRole("button", {
      name: "Confirm: Summary",
    }),
  );
  expect(f.latest().summary.approval).toBe("approved");
  expect(
    screen.getByRole("button", { name: "1 detail to check" }),
  ).toBeTruthy();
});
it("confirms both year-only dates together and leaves the original extraction untouched", () => {
  const review = fixture([
    ["roles.0.title", "Analyst"],
    ["roles.0.start", "2020"],
    ["roles.0.end", "2022"],
  ]);
  review.extraction.candidates[1].confidence = "medium";
  review.extraction.candidates[2].confidence = "medium";
  const f = mount(review);
  fireEvent.click(screen.getAllByRole("button", { name: "Confirm years" })[0]);
  expect(f.latest().importReview!.confirmedIds).toEqual(["c1", "c2"]);
  expect(f.latest().importReview!.extraction).toEqual(review.extraction);
});
it.each([
  ["2023", "2022"],
  ["01/2023", "01/2022"],
])("prevents confirmation of invalid or reversed dates %s–%s", (start, end) => {
  mount(
    fixture([
      ["roles.0.start", start, "Check start date"],
      ["roles.0.end", end, "Check end date"],
    ]),
  );
  expect(
    (
      screen.getByRole("button", {
        name: "Confirm: Start",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  expect(
    (screen.getByRole("button", { name: "Finish review" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
});
it("allows a valid detail to be confirmed while unresolved skills still block finishing", () => {
  const f = mount(
    fixture([
      ["contacts.website", "portfolio.example.com"],
      ["unclearSkills.0", "Coaching"],
    ]),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Confirm: Website or profile" }),
  );
  expect(f.latest().importReview!.confirmedIds).toEqual(["c0"]);
  expect(
    (screen.getByRole("button", { name: "Finish review" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
});

it("keeps a malformed edited date unconfirmable", () => {
  const f = mount(
    fixture([
      ["roles.0.start", "01/2020", "Check start date"],
      ["roles.0.end", "01/2022"],
    ]),
  );
  fireEvent.click(screen.getByRole("button", { name: "Edit: Start" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Start" }), {
    target: { value: "13/2020" },
  });
  expect(
    (
      screen.getByRole("button", {
        name: "Confirm: Start",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Confirm: Start" }));
  expect(f.latest().importReview!.confirmedIds).toEqual([]);
  expect(
    (screen.getByRole("button", { name: "Finish review" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
});

it("flags reversed dates even when extraction reported high confidence", async () => {
  const f = mount(
    fixture([
      ["roles.0.start", "2023"],
      ["roles.0.end", "2022"],
    ]),
  );
  fireEvent.click(screen.getByRole("button", { name: "Review: Start" }));
  const field = f.container.querySelector(
    `[data-profile-fact="${f.latest().roles[0].start.fieldId}"]`,
  )!;
  await waitFor(() =>
    expect(field.contains(document.activeElement)).toBe(true),
  );
  expect(
    (
      within(field as HTMLElement).getByRole("button", {
        name: "Confirm: Start",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
});
