import { describe, expect, it } from "vitest";
import { emptyCv, moveOtherTo } from "./index.ts";

const withCustom = (details: string) => ({
  ...emptyCv(),
  custom: [
    { id: "c1", title: "Hobby", details },
    { id: "c2", title: "Keep", details: "stays" },
  ],
});

describe("moveOtherTo", () => {
  it("splits lines into items and removes the custom entry", () => {
    const out = moveOtherTo(withCustom("• B category\n\n- Since 2010"), "c1", "certifications");
    expect(out.certifications.map((c) => c.name)).toEqual(["B category", "Since 2010"]);
    expect(out.custom.map((c) => c.id)).toEqual(["c2"]);
  });

  it("moving into languages sets an empty level", () => {
    const out = moveOtherTo(withCustom("Romanian\nEnglish"), "c1", "languages");
    expect(out.languages.map((l) => [l.name, l.level])).toEqual([["Romanian", ""], ["English", ""]]);
  });

  it("leaves the CV alone when the entry does not exist", () => {
    const cv = withCustom("x");
    expect(moveOtherTo(cv, "nope", "interests")).toEqual(cv);
  });
});
