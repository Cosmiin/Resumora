import { describe, expect, it } from "vitest";
import { isCopiedDescription } from "./role-description.ts";

const kreditech = { company: "Kreditech", location: "Hamburg, Germany" };

describe("isCopiedDescription", () => {
  it.each(["Kreditech · Hamburg, Germany", "Kreditech", "Hamburg, Germany", "KREDITECH | Hamburg", "  hamburg – germany  ", "Germany - Kreditech"])(
    "%j only repeats the company and/or location", (description) => {
      expect(isCopiedDescription({ ...kreditech, description })).toBe(true);
    },
  );

  it.each(["Kreditech is a fintech in Hamburg", "Fintech lender · Hamburg", "", "  ·  "])("%j is not a copy", (description) => {
    expect(isCopiedDescription({ ...kreditech, description })).toBe(false);
  });

  it("keeps hyphens and spaces inside a company name", () => {
    expect(isCopiedDescription({ company: "Rolls-Royce", location: "Derby", description: "Rolls Royce · Derby" })).toBe(true);
  });

  it("is never a copy when the role has no company and no location", () => {
    expect(isCopiedDescription({ company: "", location: "", description: "Anything" })).toBe(false);
  });
});
