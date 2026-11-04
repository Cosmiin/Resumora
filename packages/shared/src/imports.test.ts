import { describe, expect, it } from "vitest";
import { CvContentSchema, MAX_BULLETS, MAX_ITEMS, defaultLayout, emptyCv } from "./cv.ts";
import { ImportDraftSchema, ImportResultSchema, emptyDraft, toCvContent, type ImportDraft } from "./imports.ts";

const draftWith = (overrides: Partial<ImportDraft>): ImportDraft => ({ ...emptyDraft(), ...overrides });
const job = (company: string, bullets: string[] = []) => ({
  company, title: "PM", location: "", startDate: "2020-01", endDate: "", current: true, description: "", bullets,
});

describe("toCvContent", () => {
  it("returns v2 with the default layout", () => {
    const { content } = toCvContent(draftWith({ experience: [job("Acme")] }));
    expect(content.schemaVersion).toBe(2);
    expect(content.layout).toEqual(defaultLayout());
    for (const list of [content.achievements, content.volunteering, content.awards, content.courses, content.publications, content.interests]) {
      expect(list).toEqual([]);
    }
  });

  it("assigns ids", () => {
    const { content } = toCvContent(
      draftWith({ experience: [job("Acme", ["Did a thing"])], technicalSkills: ["SQL"], custom: [{ title: "Awards", details: "Best PM 2021" }] }),
    );
    expect(CvContentSchema.safeParse(content).success).toBe(true);
    expect(content.experience[0]!.id).toEqual(expect.any(String));
    expect(content.experience[0]!.bullets[0]).toEqual({ id: expect.any(String), text: "Did a thing" });
    expect(content.technicalSkills).toEqual([{ id: expect.any(String), name: "SQL" }]);
    expect(content.custom[0]).toMatchObject({ title: "Awards", details: "Best PM 2021" });
  });

  it("trims over-limit lists with a warning", () => {
    const { content, warnings } = toCvContent(
      draftWith({ experience: Array.from({ length: 45 }, (_, i) => job(`Company ${i}`, Array.from({ length: 25 }, () => "b"))) }),
    );
    expect(content.experience).toHaveLength(MAX_ITEMS);
    expect(content.experience[0]!.bullets).toHaveLength(MAX_BULLETS);
    expect(warnings.some((w) => /experience/i.test(w) && w.includes("40"))).toBe(true);
    expect(warnings.some((w) => /bullets/i.test(w) && w.includes("Company 0"))).toBe(true);
    expect(CvContentSchema.safeParse(content).success).toBe(true);
  });

  it("removes a skill listed in two groups", () => {
    const { content } = toCvContent(
      draftWith({ technicalSkills: ["SQL", "sql", ""], professionalSkills: ["Team leadership", "SQL"], unclearSkills: ["Team Leadership", "Management"] }),
    );
    expect(content.technicalSkills.map((s) => s.name)).toEqual(["SQL"]);
    expect(content.professionalSkills.map((s) => s.name)).toEqual(["Team leadership"]);
    expect(content.unclearSkills.map((s) => s.name)).toEqual(["Management"]);
  });

  it("maps other locale to en with a warning", () => {
    const { content, warnings } = toCvContent(draftWith({ detectedLocale: "other" }));
    expect(content.locale).toBe("en");
    expect(warnings).toHaveLength(1);
    expect(toCvContent(draftWith({ detectedLocale: "ro" })).content.locale).toBe("ro");
  });

  it("clears unclear dates with a warning", () => {
    const { content, warnings } = toCvContent(draftWith({ experience: [{ ...job("Acme"), current: false, startDate: "03/2019", endDate: "2021" }] }));
    expect(content.experience[0]).toMatchObject({ startDate: "", endDate: "2021" });
    expect(warnings.some((w) => /date/i.test(w))).toBe(true);
  });

  it("keeps the AI's warnings and at most two titles", () => {
    const { content, warnings } = toCvContent(
      draftWith({ warnings: ["First and last name need confirming."], basics: { ...emptyDraft().basics, titles: ["A", "B", "C"] } }),
    );
    expect(content.basics.titles).toEqual(["A", "B"]);
    expect(warnings[0]).toBe("First and last name need confirming.");
    expect(warnings.some((w) => /title/i.test(w))).toBe(true);
  });

  it("the draft schema accepts what the editor never would, so it can be trimmed instead of retried", () => {
    expect(ImportDraftSchema.safeParse(draftWith({ technicalSkills: Array.from({ length: 60 }, (_, i) => `S${i}`) })).success).toBe(true);
  });
});

describe("ImportResultSchema", () => {
  it("upgrades a stored v1 result", () => {
    const v1: Record<string, unknown> = { ...emptyCv(), schemaVersion: 1 };
    for (const key of ["layout", "achievements", "volunteering", "awards", "courses", "publications", "interests"]) delete v1[key];
    const parsed = ImportResultSchema.parse({ content: v1, warnings: ["check dates"] });
    expect(parsed.content.schemaVersion).toBe(2);
    expect(parsed.content.layout).toEqual(defaultLayout());
    expect(parsed.content.achievements).toEqual([]);
    expect(parsed.warnings).toEqual(["check dates"]);
  });
});
