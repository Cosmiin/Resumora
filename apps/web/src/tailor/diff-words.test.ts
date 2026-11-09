import { describe, expect, it } from "vitest";
import { diffWords } from "./diff-words.ts";

const changed = (before: string, after: string) => diffWords(before, after).filter((s) => s.changed).map((s) => s.text);

describe("diffWords", () => {
  it("gives no changed segment for identical text", () => {
    expect(changed("Led a team of five analysts.", "Led a team of five analysts.")).toEqual([]);
  });

  it("gives exactly one changed segment for one inserted phrase", () => {
    expect(changed("Mapped processes for the finance team.", "Mapped and automated processes for the finance team."))
      .toEqual(["and automated"]);
  });

  it("keeps punctuation attached to its word", () => {
    expect(changed("Built reports for clients.", "Built reports for regional clients, weekly.")).toEqual(["regional clients, weekly."]);
    expect(changed("Built reports.", "Built dashboards.")).toEqual(["dashboards."]);
  });

  it("returns the after-text unchanged when joined", () => {
    const after = "Ran  workshops with\nstakeholders.";
    expect(diffWords("Ran workshops.", after).map((s) => s.text).join("")).toBe(after);
  });

  it("marks everything changed when there was no before-text", () => {
    expect(diffWords("", "A new bullet.")).toEqual([{ text: "A new bullet.", changed: true }]);
  });

  it("gives no segments for an empty after-text", () => {
    expect(diffWords("Old words.", "")).toEqual([]);
  });
});
