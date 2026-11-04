import { emptyCv, type ImportResult } from "@resumora/shared";
import { describe, expect, it } from "vitest";
import { scoreCase, type Expected } from "./score.ts";

const content = {
  schemaVersion: 2,
  locale: "ro",
  basics: { fullName: "Ana Șerban", email: "ana@example.com", summary: "Dezvoltator cu experiență.", titles: ["Inginer"] },
  experience: [
    { company: "Alpha SRL", title: "Dezvoltator", description: "", bullets: [{ text: "Am construit un API." }, { text: "Am redus costurile." }] },
    { company: "Beta SA", title: "Analist", description: "", bullets: [{ text: "Rapoarte lunare." }] },
  ],
  achievements: [{ text: "Premiul clienților" }],
  education: [{ school: "Universitatea București", degree: "Licență" }],
  technicalSkills: [{ name: "TypeScript" }],
  professionalSkills: [{ name: "Comunicare" }],
  unclearSkills: [],
  languages: [{ name: "Română", level: "nativ" }],
  custom: [],
};

const expected: Expected = {
  content,
  headings: [
    { heading: "Experiență", category: "experience" },
    { heading: "Aptitudini", category: "skills" },
  ],
  flags: [],
};

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

function actualFrom(c: Record<string, unknown>, headings = expected.headings): ImportResult {
  return {
    content: { ...emptyCv(), ...clone(c), basics: { ...emptyCv().basics, ...(c.basics as object) } },
    warnings: [],
    sourceHeadings: headings,
    unsourcedLines: [],
    isScan: false,
  } as unknown as ImportResult;
}

describe("scoreCase", () => {
  it("identical content scores 1.0", () => {
    const score = scoreCase(expected, actualFrom(content));
    expect(score.fieldAccuracy).toBe(1);
    expect(score.sectionsOk).toBe(true);
    expect(score.diacriticsOk).toBe(true);
    expect(score.invented).toEqual([]);
  });

  it("a missing bullet lowers accuracy", () => {
    const c = clone(content);
    c.experience[0]!.bullets.pop();
    expect(scoreCase(expected, actualFrom(c)).fieldAccuracy).toBeLessThan(1);
  });

  it("a changed diacritic fails diacriticsOk", () => {
    const c = clone(content);
    c.basics.fullName = "Ana Serban";
    const score = scoreCase(expected, actualFrom(c));
    expect(score.diacriticsOk).toBe(false);
    expect(score.fieldAccuracy).toBeLessThan(1);
  });

  it("items in a different order still match", () => {
    const c = clone(content);
    c.experience.reverse();
    expect(scoreCase(expected, actualFrom(c)).fieldAccuracy).toBe(1);
  });

  it("a missing heading fails sectionsOk, and a line not in the source is invented", () => {
    const c = clone(content);
    c.achievements = [{ text: "Premiu inventat de model" }];
    const score = scoreCase(expected, actualFrom(c, [expected.headings[0]!]), "Ana Șerban Premiul clienților Alpha SRL");
    expect(score.sectionsOk).toBe(false);
    expect(score.invented).toContain("Premiu inventat de model");
  });
});
