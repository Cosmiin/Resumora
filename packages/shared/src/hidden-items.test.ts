import { describe, expect, it } from "vitest";
import { CvContentSchema, emptyCv, withoutHidden } from "./index.ts";

// E6 Task 10a: a course, award, publication or interest can be hidden on a CV without being deleted.
describe("hidden items", () => {
  it("an old CV parses with nothing hidden", () => {
    const cv = CvContentSchema.parse({ ...emptyCv("en"), courses: [{ id: "c1", name: "SQL", provider: "", date: "" }], interests: [{ id: "i1", name: "Chess" }] });
    expect(cv.courses[0]!.hidden).toBeUndefined();
    expect(withoutHidden(cv)).toEqual(cv);
  });

  it("keeps hidden items in the data and leaves them out of what is shown", () => {
    const cv = CvContentSchema.parse({
      ...emptyCv("en"),
      courses: [{ id: "c1", name: "SQL", provider: "", date: "" }, { id: "c2", name: "Pottery", provider: "", date: "", hidden: true }],
      awards: [{ id: "a1", name: "Chess cup", issuer: "", date: "", description: "", hidden: true }],
      publications: [{ id: "p1", title: "Poems", publisher: "", date: "", url: "", hidden: true }],
      interests: [{ id: "i1", name: "Chess", hidden: true }, { id: "i2", name: "Running" }],
    });
    expect(cv.courses.map((c) => c.id)).toEqual(["c1", "c2"]);
    const shown = withoutHidden(cv);
    expect(shown.courses.map((c) => c.id)).toEqual(["c1"]);
    expect(shown.awards).toEqual([]);
    expect(shown.publications).toEqual([]);
    expect(shown.interests.map((i) => i.name)).toEqual(["Running"]);
  });

  it("rejects hidden: false-ish garbage", () => {
    expect(CvContentSchema.safeParse({ ...emptyCv("en"), interests: [{ id: "i1", name: "Chess", hidden: "yes" }] }).success).toBe(false);
  });
});
