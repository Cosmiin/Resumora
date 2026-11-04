import { beforeEach, expect, it, vi } from "vitest";
import { getDocument } from "pdfjs-dist-export";
import fixtureSource from "./fixtures/arabic-pdf-text.json?raw";
import { validatePdf, type PdfExpectation } from "./validate";
vi.mock("pdfjs-dist-export", () => ({ getDocument: vi.fn() }));
const fixture = JSON.parse(fixtureSource),
  bytes = new TextEncoder().encode("%PDF-" + ".".repeat(600) + "%%EOF");
const original = () =>
  fixture.items.map(([str, dir, x, y, width, hasEOL]: any[]) => ({
    str,
    dir,
    transform: [10, 0, 0, 10, x, y],
    width,
    hasEOL,
    fontName: "test",
  }));
let items: ReturnType<typeof original>;
beforeEach(() => {
  items = original();
  vi.mocked(getDocument).mockImplementation(
    () =>
      ({
        promise: Promise.resolve({
          numPages: 1,
          getPermissions: async () => null,
          getPage: async () => ({
            getViewport: () => ({ width: 595.28, height: 841.89 }),
            getTextContent: async () => ({ items, styles: { test: {} } }),
            getAnnotations: async () =>
              fixture.expected.links.map((url: string) => ({
                subtype: "Link",
                url,
              })),
            cleanup: () => {},
          }),
        }),
        destroy: async () => {},
      }) as any,
  );
});
it("validates actual Chromium Arabic extraction with shaped fragments and embedded Latin text/numbers in visual bidi order", async () => {
  await expect(validatePdf(bytes, fixture.expected)).resolves.toMatchObject({
    pages: 1,
  });
});
it.each([
  "Arabic letter",
  "Latin word",
  "phone digit",
  "missing text",
  "moved characters",
  "moved block",
  "moved lines",
])(
  "rejects %s changes in the RTL PDF instead of comparing an unordered text bag",
  async (kind) => {
    if (kind === "Arabic letter")
      items.find((i: any) => i.str === "ت").str = "ب";
    if (kind === "Latin word")
      items.find((i: any) => i.str === "SQL").str = "NOSQL";
    if (kind === "phone digit")
      items.find((i: any) => i.str.includes("89 67")).str = items
        .find((i: any) => i.str.includes("89 67"))
        .str.replace("23", "24");
    if (kind === "missing text")
      items.splice(
        items.findIndex((i: any) => i.str === "SQL"),
        1,
      );
    if (kind === "moved characters") {
      const a = items.find((i: any) => i.str === "ﻴ"),
        b = items.find((i: any) => i.str === "ﻨ");
      [a.str, b.str] = [b.str, a.str];
    }
    if (kind === "moved lines") {
      const yA = items.find((i: any) => i.str === "SQL").transform[5],
        yB = items.find((i: any) => i.str === "Example").transform[5],
        a = items.filter((i: any) => i.transform[5] === yA),
        b = items.filter((i: any) => i.transform[5] === yB),
        aIndex = items.indexOf(a[0]),
        bIndex = items.indexOf(b[0]);
      items = items.flatMap((item: any, index: number) =>
        index === aIndex
          ? b
          : index === bIndex
            ? a
            : a.includes(item) || b.includes(item)
              ? []
              : [item],
      );
    }
    if (kind === "moved block") {
      const a = items.findIndex((i: any) => i.str === "SQL"),
        b = items.findIndex((i: any) => i.str === "Example");
      [items[a].str, items[b].str] = [items[b].str, items[a].str];
    }
    await expect(validatePdf(bytes, fixture.expected)).rejects.toThrow(
      "PDF_CONTENT_MISMATCH",
    );
  },
);
it("keeps LTR extraction order strict", async () => {
  items = [
    {
      str: "Second First",
      dir: "ltr",
      transform: [10, 0, 0, 10, 50, 700],
      width: 100,
      hasEOL: false,
      fontName: "test",
    },
  ];
  await expect(
    validatePdf(bytes, { text: "First Second", links: [], paper: "A4" }),
  ).rejects.toThrow("PDF_CONTENT_MISMATCH");
});
