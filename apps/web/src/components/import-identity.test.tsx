import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { it, expect, vi } from "vitest";
import { ImportReview } from "./ImportReview";
import { Editor } from "./Editor";
import { LanguageContext } from "./ui";
import {
  importedDraft,
  confirmImported,
  pendingImportedCandidates,
} from "@resumora/contracts/editor/import";
import {
  validateExtraction,
  type ImportReview as Review,
} from "@resumora/contracts/intelligence/model";
import { blankDraft, type BaseDraft } from "../base/model";
import { MemoryBaseCvAdapter } from "../base/adapter";
vi.mock("./OriginalSource", () => ({ OriginalSource: () => null }));
const valueOf = (field: HTMLElement) => (field as HTMLInputElement).value;
function review(
  parts: boolean,
  first = "Eleanor Mary",
  last = "Hart-Smith",
): Review {
  const rows = parts
    ? [
        ["nameParts.first", first, `${first} ${last}`],
        ["nameParts.last", last, `${first} ${last}`],
      ]
    : [["name", `${first} ${last}`, `${first} ${last}`]];
  return {
    id: "synthetic-import",
    sourceHash: "a".repeat(64),
    format: "pdf",
    parserVersion: "synthetic",
    pages: 1,
    admission: { kind: "cv", reason: "CV", pages: [1] },
    extraction: validateExtraction(
      {
        schemaVersion: "cv-extraction/1",
        candidates: rows.map(([path, value, quote], i) => ({
          id: `c${i}`,
          path,
          value,
          quote,
          page: 1,
          confidence: "low",
        })),
        warnings: [],
        omittedPages: [],
      },
      [{ number: 1, warnings: [] }],
    ),
    confirmedIds: [],
  };
}
function Harness({
  initial,
  adapter = new MemoryBaseCvAdapter(),
  changed,
}: {
  initial: BaseDraft;
  adapter?: MemoryBaseCvAdapter;
  changed?: (d: BaseDraft) => void;
}) {
  const [draft, setDraft] = useState(initial),
    [saved, setSaved] = useState(false);
  const change = (d: BaseDraft) => {
    setDraft(d);
    changed?.(d);
  };
  return (
    <LanguageContext value="en">
      {pendingImportedCandidates(draft).length ? (
        <ImportReview
          draft={draft}
          change={change}
          disabled={false}
          confirm={(ids) => change(confirmImported(draft, ids))}
        />
      ) : (
        <>
          <Editor draft={draft} change={change} issues={[]} />
          <button
            onClick={async () => {
              await adapter.save({
                draft,
                mode: "autosave",
                expectedRevision: 0,
                requestId: crypto.randomUUID(),
              });
              change((await adapter.load())!.draft);
              setSaved(true);
            }}
          >
            Save and reopen
          </button>
          {saved && <p>Reopened saved draft</p>}
        </>
      )}
    </LanguageContext>
  );
}
it.each([
  ["Eleanor Mary", "Hart-Smith"],
  ["Ana-Maria", "Șerban Ionescu"],
])(
  "populates and reviews compound first/last values, preserves edits and reopens actual editor fields (%s)",
  async (first, last) => {
    const adapter = new MemoryBaseCvAdapter();
    let latest = importedDraft(review(true, first, last));
    render(
      <Harness
        initial={latest}
        adapter={adapter}
        changed={(d) => {
          latest = d;
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(valueOf(screen.getByLabelText(/First name/))).toBe(first);
    expect(valueOf(screen.getByLabelText(/Last name/))).toBe(last);
    fireEvent.change(screen.getByLabelText(/First name/), {
      target: { value: first + " Alex" },
    });
    expect(valueOf(screen.getByLabelText(/Last name/))).toBe(last);
    fireEvent.click(
      screen.getByRole("button", {
        name: /Confirm and use this information/,
      }),
    );
    expect(valueOf(screen.getByRole("textbox", { name: /First name/ }))).toBe(
      first + " Alex",
    );
    expect(valueOf(screen.getByRole("textbox", { name: /Last name/ }))).toBe(
      last,
    );
    fireEvent.change(screen.getByRole("textbox", { name: /Last name/ }), {
      target: { value: last + "-Test" },
    });
    expect(valueOf(screen.getByRole("textbox", { name: /First name/ }))).toBe(
      first + " Alex",
    );
    fireEvent.click(screen.getByRole("button", { name: "Save and reopen" }));
    await screen.findByText("Reopened saved draft");
    expect(valueOf(screen.getByRole("textbox", { name: /Last name/ }))).toBe(
      last + "-Test",
    );
    expect((await adapter.load())!.draft.nameParts).toEqual({
      first: first + " Alex",
      last: last + "-Test",
    });
    expect(latest.importReview!.extraction.candidates[0].value).toBe(first);
    expect(
      latest.name.sourceLineage!.some((r) => r.sourceClaimId === "c1"),
    ).toBe(true);
  },
);
it("legacy combined-name imports show the full name visibly and let the user complete parts without an inferred split", async () => {
  let latest = importedDraft(review(false, "Ana-Maria", "Șerban Ionescu"));
  render(
    <Harness
      initial={latest}
      changed={(d) => {
        latest = d;
      }}
    />,
  );
  fireEvent.click(
    screen.getByRole("button", { name: /Confirm and use this information/ }),
  );
  const full = screen.getByRole("textbox", { name: "Full name from CV" });
  expect(valueOf(full)).toBe("Ana-Maria Șerban Ionescu");
  expect(valueOf(screen.getByRole("textbox", { name: /First name/ }))).toBe("");
  expect(valueOf(screen.getByRole("textbox", { name: /Last name/ }))).toBe("");
  expect(
    full.compareDocumentPosition(
      screen.getByRole("textbox", { name: /First name/ }),
    ) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  fireEvent.change(screen.getByRole("textbox", { name: /First name/ }), {
    target: { value: "Ana-Maria" },
  });
  fireEvent.change(screen.getByRole("textbox", { name: /Last name/ }), {
    target: { value: "Șerban Ionescu" },
  });
  expect(latest.nameParts).toEqual({
    first: "Ana-Maria",
    last: "Șerban Ionescu",
  });
  expect(latest.name.value).toBe("Ana-Maria Șerban Ionescu");
  expect(
    latest.sources.some((s) => s.text === "Ana-Maria Șerban Ionescu"),
  ).toBe(true);
});
it("an incomplete AI identity preserves the source name and the user-supplied counterpart during confirmation", () => {
  const r = review(true, "Ana", "Șerban");
  r.extraction.candidates = r.extraction.candidates.slice(0, 1);
  let latest = importedDraft(r);
  latest.nameParts = { first: "Ana", last: "Manually supplied family" };
  render(
    <Harness
      initial={latest}
      changed={(d) => {
        latest = d;
      }}
    />,
  );
  fireEvent.click(
    screen.getByRole("button", { name: /Confirm and use this information/ }),
  );
  expect(valueOf(screen.getByRole("textbox", { name: /First name/ }))).toBe(
    "Ana",
  );
  expect(valueOf(screen.getByRole("textbox", { name: /Last name/ }))).toBe(
    "Manually supplied family",
  );
  expect(latest.nameParts!.last).toBe("Manually supplied family");
});

it("keeps ordinary manual identity editing free of an imported-name fallback", () => {
  const draft = blankDraft();
  draft.name.value = "Manually entered given name";
  draft.nameParts = { first: "Manually entered given name", last: "" };
  render(
    <LanguageContext value="en">
      <Editor draft={draft} change={() => {}} issues={[]} />
    </LanguageContext>,
  );
  expect(
    screen.queryByRole("textbox", { name: "Full name from CV" }),
  ).toBeNull();
  expect(valueOf(screen.getByRole("textbox", { name: /First name/ }))).toBe(
    "Manually entered given name",
  );
});
