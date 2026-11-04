import { describe, expect, it } from "vitest";
import { emptyCv, missingCategories, newId } from "./index.ts";

describe("missingCategories", () => {
  it("an empty CV flags name, email and the five missing sections, then languages as a tip", () => {
    expect(missingCategories(emptyCv())).toEqual([
      { key: "header", level: "missing", field: "fullName" },
      { key: "header", level: "missing", field: "email" },
      { key: "summary", level: "missing" },
      { key: "achievements", level: "missing" },
      { key: "experience", level: "missing" },
      { key: "skills", level: "missing" },
      { key: "education", level: "missing" },
      { key: "languages", level: "tip" },
    ]);
  });

  it("a hidden section is never flagged", () => {
    const cv = emptyCv();
    cv.layout.hidden = ["achievements", "languages"];
    const keys = missingCategories(cv).map((f) => f.key);
    expect(keys).not.toContain("achievements");
    expect(keys).not.toContain("languages");
  });

  it("whitespace-only summary counts as empty", () => {
    const cv = emptyCv();
    cv.basics.summary = "   \n ";
    expect(missingCategories(cv).map((f) => f.key)).toContain("summary");
    cv.basics.summary = "Hello";
    expect(missingCategories(cv).map((f) => f.key)).not.toContain("summary");
  });

  it("skills count as filled when any group has a skill, including to-sort", () => {
    const cv = emptyCv();
    cv.unclearSkills = [{ id: newId(), name: "Teamwork" }];
    expect(missingCategories(cv).map((f) => f.key)).not.toContain("skills");
  });

  it("flags follow layout order", () => {
    const cv = emptyCv();
    cv.layout.order = ["education", ...cv.layout.order.filter((k) => k !== "education")];
    const sections = missingCategories(cv).filter((f) => f.key !== "header");
    expect(sections[0]?.key).toBe("education");
  });

  it("achievements with only blank bullets counts as empty", () => {
    const cv = emptyCv();
    cv.achievements = [{ id: newId(), text: "  " }];
    expect(missingCategories(cv).map((f) => f.key)).toContain("achievements");
    cv.achievements = [{ id: newId(), text: "Won it" }];
    expect(missingCategories(cv).map((f) => f.key)).not.toContain("achievements");
  });
});
