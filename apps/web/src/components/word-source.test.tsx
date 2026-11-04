import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { OriginalSource } from "./OriginalSource";
import { LanguageContext } from "./ui";
import {
  httpIntelligence,
  type IntelligenceClient,
} from "../base/intelligence";
import type {
  ImportReview,
  WordSourceText,
} from "@resumora/contracts/intelligence/model";
import { locateTextQuote } from "../base/source-location";
function review(format: "doc" | "docx", id = "synthetic"): ImportReview {
  return {
    id,
    format,
    sourceHash: "a".repeat(64),
    parserVersion: "synthetic",
    pages: null,
    admission: { kind: "cv", reason: "CV", pages: [] },
    confirmedIds: [],
    extraction: {
      schemaVersion: "cv-extraction/1",
      warnings: [],
      omittedPages: [],
      candidates: [
        {
          id: "c",
          path: "name",
          value: "Edited value",
          quote: "Știință <script>plain text</script>",
          confidence: "low",
          page: null,
        },
      ],
    },
  };
}
function data(
  r: ImportReview,
  text = "Before\nȘtiință <script>plain text</script>\nAfter",
): WordSourceText {
  return {
    importId: r.id,
    sourceHash: r.sourceHash,
    format: r.format as "doc" | "docx",
    text,
  };
}
function surface(r: ImportReview, client: IntelligenceClient) {
  return (
    <LanguageContext value="en">
      <OriginalSource
        review={r}
        candidate={r.extraction.candidates[0]}
        client={client}
      />
    </LanguageContext>
  );
}
for (const format of ["doc", "docx"] as const) {
  it(`shows grounded escaped ${format} text with no PDF layout claim`, async () => {
    const r = review(format);
    const transport = vi.fn(async () => Response.json(data(r)));
    const client = httpIntelligence(transport);
    render(surface(r, client));
    expect(
      await screen.findByText(/Unique match in extracted text/),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "Extracted Word text" }),
    ).toBeTruthy();
    expect(
      screen.getByText(/Word layout and pagination are not reproduced/),
    ).toBeTruthy();
    expect(document.querySelector("mark")!.textContent).toBe(
      r.extraction.candidates[0].quote,
    );
    expect(document.querySelector("script")).toBeNull();
    expect(document.querySelector("canvas")).toBeNull();
    expect(screen.queryByRole("button", { name: "Rotate" })).toBeNull();
    expect(transport).toHaveBeenCalledWith(
      `/v1/intelligence/imports/${r.id}/source`,
      expect.objectContaining({
        method: "GET",
        cache: "no-store",
        signal: expect.any(AbortSignal),
      }),
    );
  });
}
it.each(["missing", "ambiguous"])(
  "leaves %s Word quotations explicitly unlocated",
  async (kind) => {
    const r = review("docx");
    const text =
      kind === "missing"
        ? "Different text"
        : r.extraction.candidates[0].quote +
          "\n" +
          r.extraction.candidates[0].quote;
    const client = {
      sourceText: vi.fn(async () => data(r, text)),
    } as unknown as IntelligenceClient;
    render(surface(r, client));
    expect(
      await screen.findByText(
        /Location unavailable: differing text or ambiguous match/,
      ),
    ).toBeTruthy();
    expect(document.querySelector("mark")).toBeNull();
  },
);
it.each(["importId", "sourceHash", "format", "limit"])(
  "rejects Word evidence with mismatched %s and permits a fresh retry",
  async (field) => {
    const r = review("docx");
    const wrong = {
      ...data(r),
      [field === "limit" ? "text" : field]:
        field === "limit" ? "x".repeat(40001) : "wrong",
    };
    const sourceText = vi
      .fn()
      .mockResolvedValueOnce(wrong)
      .mockResolvedValueOnce(data(r));
    render(surface(r, { sourceText } as unknown as IntelligenceClient));
    expect(await screen.findByText(/Source text unavailable/)).toBeTruthy();
    expect(document.querySelector(".source-word-text")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(
      await screen.findByText(/Unique match in extracted text/),
    ).toBeTruthy();
    expect(sourceText).toHaveBeenCalledTimes(2);
  },
);
it.each(["source", "account"])(
  "fences late Word text on %s replacement and disposal",
  async (kind) => {
    const old = review("docx", "old"),
      next = review("docx", kind === "source" ? "new" : "old");
    let resolveOld!: (value: WordSourceText) => void,
      resolveNext!: (value: WordSourceText) => void;
    const oldPromise = new Promise<WordSourceText>((resolve) => {
      resolveOld = resolve;
    });
    const nextPromise = new Promise<WordSourceText>((resolve) => {
      resolveNext = resolve;
    });
    const sourceText = vi
      .fn()
      .mockReturnValueOnce(oldPromise)
      .mockReturnValueOnce(nextPromise);
    const first = { sourceText } as unknown as IntelligenceClient;
    const second =
      kind === "account"
        ? ({ sourceText } as unknown as IntelligenceClient)
        : first;
    const view = render(surface(old, first));
    const signal = sourceText.mock.calls[0][1] as AbortSignal;
    view.rerender(surface(next, second));
    expect(signal.aborted).toBe(true);
    await act(async () => resolveOld(data(old, "Private old text")));
    expect(screen.queryByText("Private old text")).toBeNull();
    await act(async () => resolveNext(data(next)));
    await waitFor(() => expect(document.querySelector("mark")).toBeTruthy());
    const currentSignal = sourceText.mock.calls[1][1] as AbortSignal;
    view.unmount();
    expect(currentSignal.aborted).toBe(true);
  },
);
it("maps whitespace-tolerant unique quotes back to actual source text", () => {
  const text = "Before\nȘtiință\n   originală\nAfter";
  const match = locateTextQuote(text, "Știință originală")!;
  expect(text.slice(match.start, match.end)).toBe("Știință\n   originală");
  expect(locateTextQuote("same same", "same")).toBeNull();
  expect(locateTextQuote("unrelated", "missing")).toBeNull();
});

it("clears already rendered Word text immediately when the account changes", async () => {
  const r = review("docx");
  const first = {
    sourceText: vi.fn(async () => data(r, "Private old text")),
  } as unknown as IntelligenceClient;
  const next = {
    sourceText: vi.fn(() => new Promise<WordSourceText>(() => {})),
  } as unknown as IntelligenceClient;
  const view = render(surface(r, first));
  expect(await screen.findByText("Private old text")).toBeTruthy();
  view.rerender(surface(r, next));
  expect(screen.queryByText("Private old text")).toBeNull();
  expect(screen.getByText("Opening text…")).toBeTruthy();
});
