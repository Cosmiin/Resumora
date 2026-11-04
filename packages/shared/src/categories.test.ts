import { describe, expect, it } from "vitest";
import { CATEGORIES, CATEGORY, SECTION_KEYS } from "./index.ts";

describe("categories", () => {
  it("every category has an English and a Romanian label", () => {
    for (const c of CATEGORIES) {
      expect(c.label.en.length).toBeGreaterThan(0);
      expect(c.label.ro.length).toBeGreaterThan(0);
    }
  });

  it("every category except other has synonyms in both languages", () => {
    for (const c of CATEGORIES.filter((x) => x.key !== "other")) {
      expect(c.synonyms.en.length).toBeGreaterThanOrEqual(1);
      expect(c.synonyms.ro.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("flags match the spec", () => {
    const missing = ["header", "summary", "achievements", "experience", "skills", "education"];
    for (const c of CATEGORIES) {
      if (missing.includes(c.key)) expect(c.flag).toBe("missing");
      else if (c.key === "languages") expect(c.flag).toBe("tip");
      else expect(c.flag).toBeNull();
    }
    expect(CATEGORY.header.flag).toBe("missing");
    expect(CATEGORY.languages.flag).toBe("tip");
  });

  it("SECTION_KEYS is the default order, without header, each once", () => {
    expect(SECTION_KEYS).toEqual([
      "summary",
      "achievements",
      "experience",
      "skills",
      "education",
      "languages",
      "certifications",
      "projects",
      "volunteering",
      "awards",
      "courses",
      "publications",
      "interests",
      "other",
    ]);
    expect(CATEGORIES.map((c) => c.key)).toEqual(["header", ...SECTION_KEYS]);
  });

  it("no synonym is listed under two categories", () => {
    const seen = new Map<string, string>();
    for (const c of CATEGORIES) {
      for (const s of new Set([...c.synonyms.en, ...c.synonyms.ro])) {
        const k = s.toLowerCase();
        expect(seen.get(k), `"${s}" in ${c.key} and ${seen.get(k)}`).toBeUndefined();
        seen.set(k, c.key);
      }
    }
  });
});
