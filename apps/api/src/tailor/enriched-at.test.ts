import { describe, expect, it } from "vitest";
import { emptyCv } from "@resumora/shared";
import { texts } from "./section-pass.ts";

describe("enrichedAt is CV metadata, not CV text", () => {
  it("is left out of the texts the tailoring checks read", () => {
    const cv = { ...emptyCv(), enrichedAt: "2026-11-09T12:00:00.000Z", basics: { ...emptyCv().basics, summary: "Planner" } };
    expect(texts(cv)).toContain("Planner");
    expect(texts(cv).join(" ")).not.toContain("2026-11-09");
  });
});
