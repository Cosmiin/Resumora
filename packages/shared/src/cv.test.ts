import { describe, expect, it } from "vitest";
import { CvContentSchema, emptyCv, newId, type CvContent } from "./index.ts";

function experience(overrides: Partial<CvContent["experience"][number]> = {}) {
  return {
    id: newId(),
    company: "Acme",
    title: "Engineer",
    location: "",
    startDate: "2024-01",
    endDate: "",
    current: true,
    bullets: [],
    ...overrides,
  };
}

function withExperience(items: CvContent["experience"]): CvContent {
  return { ...emptyCv(), experience: items };
}

describe("CvContentSchema", () => {
  it("emptyCv parses", () => {
    expect(() => CvContentSchema.parse(emptyCv())).not.toThrow();
    expect(emptyCv().schemaVersion).toBe(1);
    expect(emptyCv().locale).toBe("en");
    expect(emptyCv("ro").locale).toBe("ro");
  });

  it("rejects too many experiences", () => {
    const result = CvContentSchema.safeParse(
      withExperience(Array.from({ length: 41 }, () => experience())),
    );
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path[0]).toBe("experience");
    expect(
      CvContentSchema.safeParse(withExperience(Array.from({ length: 40 }, () => experience())))
        .success,
    ).toBe(true);
  });

  it("rejects too many bullets", () => {
    const bullets = (n: number) => Array.from({ length: n }, () => ({ id: newId(), text: "Did a thing" }));
    expect(CvContentSchema.safeParse(withExperience([experience({ bullets: bullets(21) })])).success).toBe(false);
    expect(CvContentSchema.safeParse(withExperience([experience({ bullets: bullets(20) })])).success).toBe(true);
  });

  it("rejects bad dates", () => {
    const parses = (startDate: string) =>
      CvContentSchema.safeParse(withExperience([experience({ startDate })])).success;
    expect(parses("2024-13")).toBe(false);
    expect(parses("24-01")).toBe(false);
    expect(parses("2024-01")).toBe(true);
    expect(parses("")).toBe(true);
  });

  it("rejects long summary", () => {
    const withSummary = (summary: string) =>
      CvContentSchema.safeParse({ ...emptyCv(), basics: { ...emptyCv().basics, summary } }).success;
    expect(withSummary("a".repeat(4001))).toBe(false);
    expect(withSummary("a".repeat(4000))).toBe(true);
  });

  it("rejects unknown fields", () => {
    expect(CvContentSchema.safeParse({ ...emptyCv(), photo: "x" }).success).toBe(false);
  });
});

describe("newId", () => {
  it("is unique", () => {
    expect(new Set(Array.from({ length: 100 }, newId)).size).toBe(100);
  });
});
