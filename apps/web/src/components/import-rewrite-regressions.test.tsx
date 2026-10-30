import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { ImportDocument } from "./ImportDocument";
import { Enrichment } from "./Enrichment";
import { DocumentPreview } from "./DocumentPreview";
import { LanguageContext } from "./ui";
import {
  blankDraft,
  clone,
  fact,
  newOptionalEntry,
  newRole,
} from "../base/model";
import { patchFact } from "../base/editing";
import { careerContext } from "@resumora/contracts/intelligence/context";
import { decodeDraft, encodeDraft } from "@resumora/contracts/editor/transport";
import type { ImportReview } from "@resumora/contracts/intelligence/model";
import type { ImportStatus, IntelligenceClient } from "../base/intelligence";

afterEach(() => vi.unstubAllGlobals());
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function review(id: string): ImportReview {
  return {
    id,
    sourceHash: "a".repeat(64),
    format: "pdf",
    parserVersion: "synthetic",
    pages: 1,
    admission: { kind: "cv", reason: "CV", pages: [1] },
    extraction: {
      schemaVersion: "cv-extraction/1",
      candidates: [
        {
          id: "name",
          path: "name",
          value: id,
          page: 1,
          quote: id,
          confidence: "high",
        },
      ],
      warnings: [],
      omittedPages: [],
    },
    confirmedIds: [],
  };
}
for (const action of ["open", "check", "upload", "cancel"] as const) {
  for (const outcome of ["resolve", "reject"] as const) {
    for (const staleFirst of [true, false]) {
      it(`fences superseded ${action} ${outcome}, stale response ${staleFirst ? "before" : "after"} current response`, async () => {
        vi.stubGlobal("fetch", () => {
          throw new Error("NETWORK_DENIED");
        });
        const stale = deferred<ImportStatus>(),
          current = deferred<ImportStatus>();
        const a: ImportStatus = {
          id: "a",
          state: "ready",
          format: "pdf",
          review: review("source-a"),
        };
        const b: ImportStatus = {
          id: "b",
          state: "ready",
          format: "docx",
          review: review("source-b"),
        };
        let aCalls = 0;
        const client: IntelligenceClient = {
          listImports: vi.fn(async () => [a, b]),
          importStatus: vi.fn((id) => {
            if (id === "b") return current.promise;
            if ((action === "check" || action === "cancel") && aCalls++ === 0)
              return Promise.resolve(a);
            return stale.promise;
          }),
          importDocument: vi.fn(() => stale.promise),
          cancelImport: vi.fn((id) =>
            action === "cancel" && id === "a"
              ? stale.promise.then(() => {})
              : Promise.resolve(),
          ),
          questions: vi.fn(),
          rewrite: vi.fn(),
        };
        const start = vi.fn();
        render(
          <LanguageContext value="en">
            <ImportDocument client={client} revision={0} start={start} />
          </LanguageContext>,
        );
        fireEvent.click(await screen.findByText("Recent account imports"));
        const openA = await screen.findByRole("button", {
          name: /Open saved import · PDF/,
        });
        const openB = screen.getByRole("button", {
          name: /Open saved import · DOCX/,
        });
        if (action === "upload") {
          fireEvent.change(screen.getByLabelText("CV document"), {
            target: { files: [new File(["synthetic"], "cv.pdf")] },
          });
          fireEvent.click(
            screen.getByRole("button", { name: "Upload and analyse" }),
          );
        } else {
          await act(async () => fireEvent.click(openA));
          if (action === "check")
            fireEvent.click(
              screen.getByRole("button", { name: "Check operation" }),
            );
          if (action === "cancel")
            fireEvent.click(
              screen.getByRole("button", { name: "Cancel import" }),
            );
        }
        fireEvent.click(openB);
        expect(
          screen.queryByRole("button", { name: "Open unconfirmed facts" }),
        ).toBeNull();
        const settleStale = async () => {
          await act(async () => {
            if (outcome === "resolve") stale.resolve(a);
            else stale.reject(new Error("old operation failed"));
          });
        };
        if (staleFirst) {
          await settleStale();
          expect(
            screen.getByRole<HTMLButtonElement>("button", {
              name: "Check operation",
            }).disabled,
          ).toBe(true);
          expect(screen.queryByRole("status")).toBeNull();
          expect(screen.queryByRole("alert")).toBeNull();
        }
        await act(async () => current.resolve(b));
        if (!staleFirst) await settleStale();
        expect(screen.getByRole("status").textContent).toBe("ready");
        expect(screen.queryByRole("alert")).toBeNull();
        expect(
          screen.getByRole<HTMLButtonElement>("button", {
            name: "Check operation",
          }).disabled,
        ).toBe(false);
        fireEvent.click(
          screen.getByRole("button", { name: "Open unconfirmed facts" }),
        );
        expect(start.mock.calls[0][0].importReview.id).toBe("source-b");
        await act(async () =>
          fireEvent.click(
            screen.getByRole("button", { name: "Cancel import" }),
          ),
        );
        expect(client.cancelImport).toHaveBeenLastCalledWith(
          "b",
          expect.any(AbortSignal),
        );
        expect(screen.getByRole("status").textContent).toBe("cancelled");
        expect(
          screen.queryByRole("button", { name: "Open unconfirmed facts" }),
        ).toBeNull();
      });
    }
  }
}

it("fences earlier generations when reopening the same import", async () => {
  const old = deferred<ImportStatus>(),
    current = deferred<ImportStatus>();
  const row: ImportStatus = { id: "same", state: "ready", format: "pdf" };
  const client: IntelligenceClient = {
    listImports: vi.fn(async () => [row]),
    importStatus: vi
      .fn()
      .mockReturnValueOnce(old.promise)
      .mockReturnValueOnce(current.promise),
    importDocument: vi.fn(),
    cancelImport: vi.fn(),
    questions: vi.fn(),
    rewrite: vi.fn(),
  };
  const start = vi.fn();
  render(
    <LanguageContext value="en">
      <ImportDocument client={client} revision={0} start={start} />
    </LanguageContext>,
  );
  fireEvent.click(await screen.findByText("Recent account imports"));
  const open = screen.getByRole("button", { name: /Open saved import/ });
  fireEvent.click(open);
  fireEvent.click(open);
  await act(async () =>
    current.resolve({ ...row, review: review("current-generation") }),
  );
  await act(async () =>
    old.resolve({ ...row, review: review("old-generation") }),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Open unconfirmed facts" }),
  );
  expect(start.mock.calls[0][0].importReview.id).toBe("current-generation");
});

it.each([
  "role",
  "projects",
  "certifications",
  "volunteering",
  "custom",
] as const)(
  "renders an accepted whole %s rewrite once and restores originals when evidence is hidden or stale",
  async (kind) => {
    vi.stubGlobal("fetch", () => {
      throw new Error("NETWORK_DENIED");
    });
    let latest = blankDraft();
    latest.language = "en";
    const role = newRole(),
      entry = newOptionalEntry();
    const context = fact("Original context."),
      bullet = fact("Original contribution.");
    const target = kind === "role" ? role.id : entry.id;
    if (kind === "role") {
      role.context = context;
      role.bullets = [bullet];
      latest.roles.push(role);
      latest.presentation.contributionHtml = {
        [target]: `<ol><li data-contribution="${bullet.fieldId}"><b>Original contribution.</b></li></ol>`,
      };
    } else {
      entry.details = context;
      entry.bullets = [bullet];
      latest.optionalSections.push({
        id: "extra",
        kind,
        label: "Extra",
        entries: [entry],
      });
      latest.presentation.order.push("extra");
    }
    const original = clone(latest);
    const proposal = "Rewritten context and contribution together.";
    function Surface() {
      const [draft, setDraft] = useState(latest);
      latest = draft;
      return (
        <LanguageContext value="en">
          <button
            onClick={() => {
              const next = clone(draft);
              next.presentation.hiddenFields = [bullet.fieldId];
              setDraft(next);
            }}
          >
            Hide evidence
          </button>
          <button
            onClick={() => {
              const next = clone(draft);
              next.presentation.hiddenFields = [];
              const field =
                kind === "role"
                  ? next.roles[0].bullets[0]
                  : next.optionalSections.at(-1)!.entries[0].bullets![0];
              setDraft(patchFact(next, field, "Changed contribution."));
            }}
          >
            Change evidence
          </button>
          <Enrichment
            draft={draft}
            change={setDraft}
            goEdit={() => {}}
            asOf={{ year: "2026", month: "10" }}
            rewriteRole={async () => ({
              schemaVersion: "career-role-rewrite/1",
              targetId: target,
              text: proposal,
              factIds: careerContext(draft, target).facts.map((f) => f.id),
              warnings: [],
            })}
          />
          <section aria-label="Saved preview">
            <DocumentPreview
              draft={draft}
              asOf={{ year: "2026", month: "10" }}
            />
          </section>
        </LanguageContext>
      );
    }
    render(<Surface />);
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", { name: "Propose experience rewrite" }),
      ),
    );
    const preview = within(
      screen.getByRole("region", { name: "Saved preview" }),
    );
    expect(preview.getByText("Original contribution.")).toBeTruthy();
    expect(preview.queryByText(proposal)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Accept rewrite" }));
    expect(preview.getAllByText(proposal)).toHaveLength(1);
    expect(preview.queryByText("Original context.")).toBeNull();
    expect(preview.queryByText("Original contribution.")).toBeNull();
    expect(latest.roles).toEqual(original.roles);
    expect(latest.optionalSections).toEqual(original.optionalSections);
    expect(latest.sources).toEqual(original.sources);
    expect(latest.presentation.contributionHtml).toEqual(
      original.presentation.contributionHtml,
    );
    const persisted = decodeDraft(encodeDraft(latest));
    expect(persisted.presentation.approvedWording![target].scope).toBe(
      "experience",
    );
    fireEvent.click(screen.getByRole("button", { name: "Hide evidence" }));
    expect(preview.queryByText(proposal)).toBeNull();
    expect(preview.getByText("Original context.")).toBeTruthy();
    expect(preview.queryByText("Original contribution.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Change evidence" }));
    expect(preview.queryByText(proposal)).toBeNull();
    expect(preview.getByText("Changed contribution.")).toBeTruthy();
  },
);
