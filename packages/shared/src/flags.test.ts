import { describe, expect, it } from "vitest";
import { emptyCv, isSectionShown, missingCategories, newId, shownEmptyFlags, type SectionKey } from "./index.ts";

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

describe("tailored CV: shown sections and Needs attention", () => {
  const none = new Set<SectionKey>();
  function filled() {
    const cv = emptyCv();
    cv.basics.fullName = "Ana Pop";
    cv.basics.email = "ana@example.com";
    cv.basics.summary = "Analyst.";
    return cv;
  }

  it("hides an empty section until it is opened, and always hides a hidden one", () => {
    const cv = filled();
    cv.achievements = [{ id: "a1", text: "" }, { id: "a2", text: " " }];
    expect(isSectionShown(cv, "summary", none)).toBe(true);
    expect(isSectionShown(cv, "achievements", none)).toBe(false);
    expect(isSectionShown(cv, "achievements", new Set<SectionKey>(["achievements"]))).toBe(true);
    cv.layout.hidden = ["summary", "achievements"];
    expect(isSectionShown(cv, "summary", none)).toBe(false);
    expect(isSectionShown(cv, "achievements", new Set<SectionKey>(["achievements"]))).toBe(false);
  });

  it("flags no auto-hidden empty section, so Needs attention can be clear", () => {
    const cv = filled();
    cv.achievements = [{ id: "a1", text: "" }];
    expect(shownEmptyFlags(cv, none)).toEqual([]);
  });

  it("flags every shown empty section, including ones without a category flag", () => {
    const cv = filled();
    cv.achievements = [{ id: "a1", text: "" }];
    const opened = new Set<SectionKey>(["achievements", "certifications"]);
    expect(shownEmptyFlags(cv, opened)).toEqual([
      { key: "achievements", level: "missing" },
      { key: "certifications", level: "missing" },
    ]);
  });

  it("flags a shown section emptied while editing, keeps a category's own level, and skips hidden ones", () => {
    const cv = filled();
    cv.basics.summary = "";
    const opened = new Set<SectionKey>(["summary", "languages", "education"]);
    cv.layout.hidden = ["education"];
    expect(shownEmptyFlags(cv, opened)).toEqual([
      { key: "summary", level: "missing" },
      { key: "languages", level: "tip" },
    ]);
  });

  it("still flags a missing name or email first", () => {
    const cv = filled();
    cv.basics.email = "";
    expect(shownEmptyFlags(cv, none)).toEqual([{ key: "header", level: "missing", field: "email" }]);
  });
});
