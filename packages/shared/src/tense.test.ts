import { describe, expect, it } from "vitest";
import { startsInPresentTense } from "./tense.ts";

describe("startsInPresentTense", () => {
  it.each(["Validate compliance with legal teams", "Coordinate partner onboarding", "  VALIDATE compliance", "Co-ordinate onboarding"])(
    "recognises an English present-tense opening: %s", (text) => {
      expect(startsInPresentTense(text, "en")).toBe(true);
    },
  );

  it.each([
    "Ensured compliance with legal teams", "Led a team", "Oversaw partner onboarding", "  LED a team",
    ..."led built ran made won grew drove set wrote took began brought bought sold taught kept held met oversaw spent sent cut put found gave saw chose became went got left lost paid read rebuilt rewrote undertook withdrew understood thought told sought spoke stood fought flew hired shaped".split(" "),
  ])("accepts an English past-tense opening: %s", (text) => {
    expect(startsInPresentTense(text, "en")).toBe(false);
  });

  it.each(["ro", "fr", "de", "es", "it"] as const)("skips tense checks for %s", (locale) => {
    expect(startsInPresentTense("Validate compliance with legal teams", locale)).toBe(false);
    expect(startsInPresentTense("Ensured compliance", locale)).toBe(false);
  });
});
