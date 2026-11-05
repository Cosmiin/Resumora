import { describe, expect, it } from "vitest";
import { markRequirements } from "./marks.ts";

const req = (text: string, kind: "must" | "nice" = "must") => ({ text, kind });

describe("markRequirements", () => {
  it("keeps every character and matches trimmed requirements case-insensitively once", () => {
    const text = "  Strong SQL skills\nGerman & SQL <b>plain</b>\n";
    const segments = markRequirements(text, [req(" strong sql SKILLS "), req("german", "nice")]);
    expect(segments.map((part) => part.text).join("")).toBe(text);
    expect(segments.filter((part) => part.kind)).toEqual([
      { text: "Strong SQL skills", kind: "must" }, { text: "German", kind: "nice" },
    ]);
  });

  it("places longer requirements first and skips overlapping first matches", () => {
    expect(markRequirements("Strong SQL skills and SQL", [req("SQL", "nice"), req("Strong SQL skills")]))
      .toEqual([{ text: "Strong SQL skills", kind: "must" }, { text: " and SQL" }]);
    expect(markRequirements("abcdef", [req("bcd"), req("cde", "nice")]))
      .toEqual([{ text: "a" }, { text: "bcd", kind: "must" }, { text: "ef" }]);
  });

  it("keeps original match positions after Unicode letters and treats punctuation literally", () => {
    expect(markRequirements("İstanbul SQL and C++ (advanced)", [req("sql"), req("C++ (advanced)", "nice")]))
      .toEqual([{ text: "İstanbul " }, { text: "SQL", kind: "must" }, { text: " and " },
        { text: "C++ (advanced)", kind: "nice" }]);
  });

  it("ignores blank and missing requirements", () => {
    expect(markRequirements("SQL\nSQL", [req(" "), req("Python"), req("SQL")]))
      .toEqual([{ text: "SQL", kind: "must" }, { text: "\nSQL" }]);
  });

  it.each(["", "Text with\nline breaks & <tags>"])("returns one unmarked segment without requirements: %j", (text) => {
    expect(markRequirements(text, [])).toEqual([{ text }]);
  });
});
