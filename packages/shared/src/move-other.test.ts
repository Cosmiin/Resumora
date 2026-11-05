import { describe, expect, it } from "vitest";
import { CvContentSchema, emptyCv, MAX_ITEMS, MAX_TEXT, moveOtherTo } from "./index.ts";

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

  it("shortens a line longer than a name field so the CV stays valid", () => {
    const out = moveOtherTo(withCustom("x".repeat(MAX_TEXT + 1)), "c1", "projects");
    expect(out.projects[0]!.name).toHaveLength(MAX_TEXT);
    expect(CvContentSchema.safeParse(out).success).toBe(true);
  });

  it("keeps the lines that do not fit in the section", () => {
    const full = { ...withCustom("one\ntwo\nthree"), interests: Array.from({ length: MAX_ITEMS - 1 }, (_, i) => ({ id: "i" + i, name: "x" + i })) };
    const out = moveOtherTo(full, "c1", "interests");
    expect(out.interests).toHaveLength(MAX_ITEMS);
    expect(out.interests.at(-1)!.name).toBe("one");
    expect(out.custom.find((c) => c.id === "c1")!.details).toBe("two\nthree");
  });
});
