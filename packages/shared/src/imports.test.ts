import { describe, expect, it } from "vitest";
import { CvContentSchema, MAX_BULLETS, MAX_ITEMS, defaultLayout, emptyCv } from "./cv.ts";
import { ImportDraftSchema, ImportResultSchema, emptyDraft, toCvContent, type ImportDraft } from "./imports.ts";

const draftWith = (overrides: Partial<ImportDraft>): ImportDraft => ({ ...emptyDraft(), ...overrides });
const job = (company: string, bullets: string[] = []) => ({
  company, title: "PM", location: "", startDate: "2020-01", endDate: "", current: true, description: "", bullets,
});

describe("AI import drafts", () => {
  it("keeps photos out of the empty draft", () => {
    const draft = emptyDraft();
    expect(draft.basics).not.toHaveProperty("photo");
    expect(ImportDraftSchema.safeParse(draft).success).toBe(true);
  });

  it.each([null, { path: "user/photo.jpg", x: 50, y: 50, zoom: 1 }])(
    "rejects model output containing a photo: %j", (photo) => {
      const draft = emptyDraft();
      expect(ImportDraftSchema.safeParse({ ...draft, basics: { ...draft.basics, photo } }).success).toBe(false);
    },
  );
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

  it("drops a description that only repeats the company and location, and keeps a real one", () => {
    const copied = { ...job("Kreditech"), location: "Hamburg, Germany", description: "Kreditech · Hamburg, Germany" };
    const real = { ...job("Kreditech"), location: "Hamburg, Germany", description: "Kreditech is a fintech in Hamburg" };
    const { content } = toCvContent(draftWith({ experience: [copied, real] }));
    expect(content.experience.map((e) => e.description)).toEqual(["", "Kreditech is a fintech in Hamburg"]);
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

  it("maps achievements, volunteering, awards, courses, publications and interests", () => {
    const { content, warnings } = toCvContent(
      draftWith({
        achievements: ["Doubled sales", ...Array.from({ length: 11 }, () => "x")],
        volunteering: [job("Red Cross", ["Helped"])],
        awards: [{ name: "Best PM", issuer: "Acme", date: "2021-05", description: "Top of 40" }],
        courses: [{ name: "Scrum", provider: "Udemy", date: "bad" }],
        publications: [{ title: "On CVs", publisher: "Journal", date: "2019", url: "https://x.ro" }],
        interests: ["Chess"],
      }),
    );
    expect(content.achievements).toHaveLength(10);
    expect(content.achievements[0]).toEqual({ id: expect.any(String), text: "Doubled sales" });
    expect(content.volunteering[0]).toMatchObject({ company: "Red Cross", bullets: [{ id: expect.any(String), text: "Helped" }] });
    expect(content.awards[0]).toMatchObject({ id: expect.any(String), name: "Best PM", issuer: "Acme", date: "2021-05", description: "Top of 40" });
    expect(content.courses[0]).toMatchObject({ name: "Scrum", provider: "Udemy", date: "" });
    expect(content.publications[0]).toMatchObject({ title: "On CVs", publisher: "Journal", date: "2019", url: "https://x.ro" });
    expect(content.interests).toEqual([{ id: expect.any(String), name: "Chess" }]);
    expect(warnings.some((w) => /achievements/i.test(w) && w.includes("10"))).toBe(true);
    expect(warnings.some((w) => /date/i.test(w))).toBe(true);
    expect(CvContentSchema.safeParse(content).success).toBe(true);
  });

  it("maps sourceHeadings and turns an unknown category into other with a warning", () => {
    const result = toCvContent(
      draftWith({ sourceHeadings: [{ heading: "Work history", category: "experience" }, { heading: "Hobbies & stuff", category: "banana" }] }),
    );
    expect(result.sourceHeadings).toEqual([
      { heading: "Work history", category: "experience" },
      { heading: "Hobbies & stuff", category: "other" },
    ]);
    expect(result.warnings.some((w) => w.includes("Hobbies & stuff"))).toBe(true);
  });

  it("maps the category custom to other without a warning", () => {
    const result = toCvContent(draftWith({ sourceHeadings: [{ heading: "Extras", category: "custom" }] }));
    expect(result.sourceHeadings).toEqual([{ heading: "Extras", category: "other" }]);
    expect(result.warnings).toEqual([]);
  });

  it("does not keep the field of study twice when the degree line also names it", () => {
    const edu = (degree: string, field: string) => ({ school: "Uni", degree, field, startDate: "", endDate: "", notes: "" });
    const result = toCvContent(
      draftWith({ education: [edu("Master of Arts, History", "History"), edu("BA History", "History"), edu("History", "History"), edu("MSc – Data", "")] }),
    );
    expect(result.content.education.map((e) => e.degree)).toEqual(["Master of Arts", "BA History", "History", "MSc – Data"]);
  });

  it("files a heading named after a skill group under skills, and a field path under its last part", () => {
    const result = toCvContent(
      draftWith({
        sourceHeadings: [
          { heading: "Skills", category: "technicalSkills" },
          { heading: "Strengths", category: "professionalSkills" },
          { heading: "Profile", category: "basics.summary" },
        ],
      }),
    );
    expect(result.sourceHeadings).toEqual([
      { heading: "Skills", category: "skills" },
      { heading: "Strengths", category: "skills" },
      { heading: "Profile", category: "summary" },
    ]);
    expect(result.warnings).toEqual([]);
  });

  it("the draft schema accepts what the editor never would, so it can be trimmed instead of retried", () => {
    expect(ImportDraftSchema.safeParse(draftWith({ technicalSkills: Array.from({ length: 60 }, (_, i) => `S${i}`) })).success).toBe(true);
  });
});

describe("ImportResultSchema", () => {
  it("upgrades a stored v1 result", () => {
    const v1: Record<string, unknown> = { ...emptyCv(), schemaVersion: 1 };
    for (const key of ["layout", "achievements", "volunteering", "awards", "courses", "publications", "interests", "enrichedAt"]) delete v1[key];
    const parsed = ImportResultSchema.parse({ content: v1, warnings: ["check dates"] });
    expect(parsed.content.schemaVersion).toBe(2);
    expect(parsed.content.layout).toEqual(defaultLayout());
    expect(parsed.content.achievements).toEqual([]);
    expect(parsed.warnings).toEqual(["check dates"]);
  });

  it("accepts an old result without sourceHeadings", () => {
    const parsed = ImportResultSchema.parse({ content: emptyCv(), warnings: [] });
    expect(parsed.sourceHeadings).toEqual([]);
    expect(parsed.unsourcedLines).toEqual([]);
    expect(parsed.isScan).toBe(false);
  });
});
