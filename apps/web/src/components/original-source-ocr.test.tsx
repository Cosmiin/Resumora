import { createHash, webcrypto } from "node:crypto";
import { Blob as NodeBlob } from "node:buffer";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { OriginalSource } from "./OriginalSource";
import { LanguageContext } from "./ui";
import type { ImportReview } from "@resumora/contracts/intelligence/model";
import type { IntelligenceClient } from "../base/intelligence";
import type { OcrPage } from "../base/local-ocr";
const mocks = vi.hoisted(() => ({
  getDocument: vi.fn(),
  browserPageOcr: vi.fn(),
}));
vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: {},
  getDocument: mocks.getDocument,
}));
vi.mock("../base/local-ocr-browser", () => ({
  browserPageOcr: mocks.browserPageOcr,
}));
afterEach(() => vi.unstubAllGlobals());
const bytes = new Uint8Array([1, 2, 3]);
function review(id: string): ImportReview {
  return {
    id,
    sourceHash: createHash("sha256").update(bytes).digest("hex"),
    format: "pdf",
    parserVersion: "synthetic",
    pages: 1,
    admission: { kind: "cv", reason: "CV", pages: [1] },
    extraction: {
      schemaVersion: "cv-extraction/1",
      candidates: [
        { id, path: "name", value: id, quote: id, page: 1, confidence: "high" },
      ],
      warnings: [],
      omittedPages: [],
    },
    confirmedIds: [],
  };
}
function viewport(scale: number) {
  return {
    width: 600 * scale,
    height: 800 * scale,
    convertToPdfPoint: (x: number, y: number) => [x / scale, y / scale],
    convertToViewportPoint: (x: number, y: number) => [x * scale, y * scale],
  };
}
function deferred() {
  let resolve!: (value: OcrPage) => void, reject!: (reason: Error) => void;
  const promise = new Promise<OcrPage>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function engine(result: ReturnType<typeof deferred>) {
  return {
    get: vi.fn(),
    recognize: vi.fn(() => result.promise),
    dispose: vi.fn(),
    cancel: vi.fn(),
    forget: vi.fn(),
  };
}
function result(text: string): OcrPage {
  return {
    width: 1200,
    height: 1600,
    scale: 2,
    words: [
      { text, confidence: 96, bbox: { x0: 100, y0: 100, x1: 200, y1: 140 } },
    ],
  };
}
it("disposes source-scoped OCR on account/source replacement, ignores late old results, and allows local retry", async () => {
  vi.stubGlobal("crypto", webcrypto);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(
    (callback) => callback(new NodeBlob([bytes]) as unknown as Blob),
  );
  Object.defineProperty(HTMLElement.prototype, "scrollTo", {
    configurable: true,
    value: vi.fn(),
  });
  mocks.getDocument.mockImplementation(() => ({
    destroy: vi.fn(),
    promise: Promise.resolve({
      destroy: vi.fn(),
      getPage: async () => ({
        rotate: 0,
        getViewport: ({ scale }: { scale: number }) => viewport(scale),
        render: () => ({ promise: Promise.resolve(), cancel: vi.fn() }),
        getTextContent: async () => ({ items: [], styles: {} }),
      }),
    }),
  }));
  const old = deferred(),
    current = deferred(),
    retried = deferred(),
    a = engine(old),
    b = engine(current);
  b.recognize
    .mockReturnValueOnce(current.promise)
    .mockReturnValueOnce(retried.promise);
  mocks.browserPageOcr.mockReturnValueOnce(a).mockReturnValueOnce(b);
  const first = review("Old"),
    second = review("New");
  const firstClient = {
    original: vi.fn(async () => bytes),
  } as unknown as IntelligenceClient;
  const secondClient = {
    original: vi.fn(async () => bytes),
  } as unknown as IntelligenceClient;
  const view = render(
    <LanguageContext value="en">
      <OriginalSource
        review={first}
        candidate={first.extraction.candidates[0]}
        client={firstClient}
      />
    </LanguageContext>,
  );
  await waitFor(() => expect(a.recognize).toHaveBeenCalledTimes(1));
  view.rerender(
    <LanguageContext value="en">
      <OriginalSource
        review={second}
        candidate={second.extraction.candidates[0]}
        client={secondClient}
      />
    </LanguageContext>,
  );
  await waitFor(() => expect(b.recognize).toHaveBeenCalledTimes(1));
  expect(a.dispose).toHaveBeenCalled();
  await act(async () => old.resolve(result("Old")));
  expect(document.querySelectorAll(".source-box")).toHaveLength(0);
  await act(async () => current.reject(new Error("OCR_UNAVAILABLE")));
  fireEvent.click(
    await screen.findByRole("button", { name: "Retry source location" }),
  );
  expect(b.forget).toHaveBeenCalledWith(1);
  await waitFor(() => expect(b.recognize).toHaveBeenCalledTimes(2));
  await act(async () => retried.resolve(result("New")));
  await waitFor(() =>
    expect(document.querySelectorAll(".source-box")).toHaveLength(1),
  );
  expect(
    screen.getByText(/Unique match in locally recognized text/),
  ).toBeTruthy();
  view.unmount();
  expect(b.dispose).toHaveBeenCalled();
});
