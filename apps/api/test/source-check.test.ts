import { describe, expect, it } from "vitest";
import { emptyCv, newId, type CvContent } from "@resumora/shared";
import { findUnsourcedLines } from "../src/imports/source-check.ts";

const bullets = (...texts: string[]) => texts.map((text) => ({ id: newId(), text }));
const withBullets = (...texts: string[]): CvContent => ({
  ...emptyCv(),
  achievements: bullets(...texts),
});

describe("findUnsourcedLines", () => {
  it("a line copied exactly passes", () => {
    const source = "Achievements\n• Reduced onboarding time by 40%\nSkills";
    expect(findUnsourcedLines(withBullets("Reduced onboarding time by 40%"), source)).toEqual([]);
  });

  it("a line split across two text-layer lines passes", () => {
    const source = "Led a team of eight engineers across\nthree countries";
    expect(findUnsourcedLines(withBullets("Led a team of eight engineers across three countries"), source)).toEqual([]);
  });

  it("a hyphenated line break passes", () => {
    const source = "Improved workforce manage-\nment for 200 staff";
    expect(findUnsourcedLines(withBullets("Improved workforce management for 200 staff"), source)).toEqual([]);
  });

  it("a made-up bullet is reported", () => {
    const source = "Reduced onboarding time by 40%";
    const content = withBullets("Reduced onboarding time by 40%", "Won the company innovation prize in 2021");
    expect(findUnsourcedLines(content, source)).toEqual(["Won the company innovation prize in 2021"]);
  });

  it("a lost diacritic is reported", () => {
    const content: CvContent = { ...emptyCv(), certifications: [{ id: newId(), name: "Romania", issuer: "", date: "" }] };
    expect(findUnsourcedLines(content, "Cluj-Napoca, România")).toEqual(["Romania"]);
  });

  it("the ﬁ ligature and letter-spaced text pass", () => {
    const content: CvContent = {
      ...emptyCv(),
      basics: { ...emptyCv().basics, summary: "Profile" },
      custom: [{ id: newId(), title: "PRODUCT", details: "" }],
    };
    expect(findUnsourcedLines(content, "Proﬁle\nP R O D U C T")).toEqual([]);
  });
});
