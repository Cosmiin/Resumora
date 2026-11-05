import { describe, expect, it } from "vitest";
import { ImportFailure, extractText, sniffFormat } from "../src/imports/extract-text.ts";
import { CV_LINES, makeDocx, makePdf } from "./fixtures.ts";

const failureCode = (p: Promise<unknown>) =>
  p.then(
    () => "no error",
    (e: unknown) => (e instanceof ImportFailure ? e.code : `other: ${String(e)}`),
  );

describe("sniffFormat", () => {
  it("sniffs pdf and docx", async () => {
    expect(sniffFormat(makePdf(["hi"]))).toBe("pdf");
    expect(sniffFormat(await makeDocx(["hi"]))).toBe("docx");
  });

  it("rejects other files", () => {
    expect(sniffFormat(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]))).toBeNull(); // PNG
    expect(sniffFormat(new TextEncoder().encode("just some text"))).toBeNull();
    expect(sniffFormat(new Uint8Array([]))).toBeNull();
  });
});

describe("extractText", () => {
  it("reads a pdf", async () => {
    const text = await extractText(makePdf(CV_LINES), "pdf");
    expect(text).toContain("Ana Popescu");
    expect(text).toContain("Led the redesign of the onboarding flow");
  });

  it("reads a docx with Romanian diacritics", async () => {
    const text = await extractText(await makeDocx(["Ștefan Țărănescu", ...CV_LINES]), "docx");
    expect(text).toContain("Ștefan Țărănescu");
    expect(text).toContain("Senior Product Manager");
    expect(text.split("\n").length).toBeGreaterThan(3); // paragraphs stay on separate lines
  });

  it("no text means scanned", async () => {
    expect(await failureCode(extractText(makePdf([]), "pdf"))).toBe("no_text");
  });

  it("too long", async () => {
    const lines = Array.from({ length: 610 }, (_, i) => `Line ${i} ${"x".repeat(92)}`);
    expect(await failureCode(extractText(await makeDocx(lines), "docx"))).toBe("too_long");
  });

  it("broken file", async () => {
    const garbage = new TextEncoder().encode("%PDF-1.4\nthis is not really a pdf");
    expect(await failureCode(extractText(garbage, "pdf"))).toBe("unreadable_file");
    const badZip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4, 5]);
    expect(await failureCode(extractText(badZip, "docx"))).toBe("unreadable_file");
  });
});
