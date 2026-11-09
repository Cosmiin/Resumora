import { describe, expect, it } from "vitest";
import { exportFileName } from "./file-name.ts";

describe("exportFileName", () => {
  it("removes Romanian comma-below diacritics", () => {
    const result = exportFileName("Ștefan Ionescu", "Bolt", "Dev", "pdf");
    expect(result.startsWith("Stefan_Ionescu_")).toBe(true);
    expect(result).toBe("Stefan_Ionescu_Bolt_Dev.pdf");
  });

  it("drops punctuation and keeps whitespace separators", () => {
    expect(exportFileName("Ana Pop", "X", "R&D / QA", "docx"))
      .toBe("Ana_Pop_X_RD_QA.docx");
  });

  it("joins the name, company and role", () => {
    expect(exportFileName("Ana Popescu", "Bolt", "Senior Backend Engineer", "pdf"))
      .toBe("Ana_Popescu_Bolt_Senior_Backend_Engineer.pdf");
  });

  it("skips an empty company", () => {
    expect(exportFileName("Ana Pop", "", "Dev", "pdf")).toBe("Ana_Pop_Dev.pdf");
  });

  it("uses CV when all parts are empty", () => {
    expect(exportFileName("", "", "", "pdf")).toBe("CV.pdf");
  });

  it("removes diacritics from every part", () => {
    expect(exportFileName("ȘșȚț", "Café", "Dév", "docx"))
      .toBe("SsTt_Cafe_Dev.docx");
  });

  it("collapses whitespace and underscores and trims each part", () => {
    expect(exportFileName(" __Ana\t  Pop__ ", "_ X _", "\nDev___Lead\r\n", "pdf"))
      .toBe("Ana_Pop_X_Dev_Lead.pdf");
  });

  it("skips parts that are empty after cleaning", () => {
    expect(exportFileName("", "Bolt", "!", "pdf")).toBe("Bolt.pdf");
    expect(exportFileName(" _ ", "!@#", "中文", "docx")).toBe("CV.docx");
  });
});
