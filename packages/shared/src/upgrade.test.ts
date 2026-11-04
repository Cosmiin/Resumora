import { describe, expect, it } from "vitest";
import {
  CvContentV1Schema,
  SECTION_KEYS,
  StoredCvSchema,
  defaultLayout,
  emptyCv,
  normalizeLayout,
  upgradeCv,
  type CvContentV1,
  type Layout,
} from "./index.ts";

function v1Cv(): CvContentV1 {
  return {
    schemaVersion: 1,
    locale: "en",
    basics: {
      fullName: "Ana Pop",
      firstName: "Ana",
      lastName: "Pop",
      titles: ["Engineer"],
      email: "a@b.ro",
      phone: "1",
      location: "Cluj",
      website: "",
      linkedin: "",
      summary: "Hi",
    },
    experience: [
      {
        id: "e1",
        company: "Acme",
        title: "Dev",
        location: "",
        startDate: "2020-01",
        endDate: "",
        current: true,
        description: "Scope",
        bullets: [
          { id: "b1", text: "One" },
          { id: "b2", text: "Two" },
        ],
      },
    ],
    education: [{ id: "d1", school: "UBB", degree: "BSc", field: "CS", startDate: "2015", endDate: "2019", notes: "" }],
    technicalSkills: [{ id: "t1", name: "SQL" }],
    professionalSkills: [{ id: "p1", name: "Teamwork" }],
    unclearSkills: [{ id: "u1", name: "Stuff" }],
    languages: [{ id: "l1", name: "English", level: "C1" }],
    certifications: [{ id: "c1", name: "AWS", issuer: "Amazon", date: "2022-05" }],
    projects: [{ id: "pr1", name: "Site", description: "d", url: "x.ro" }],
    custom: [{ id: "cu1", title: "Hobbies", details: "Chess" }],
  };
}

describe("upgradeCv", () => {
  it("keeps every v1 field", () => {
    const v1 = v1Cv();
    const v2 = upgradeCv(v1);
    expect(v2.schemaVersion).toBe(2);
    for (const [key, value] of Object.entries(v1)) {
      if (key === "schemaVersion") continue;
      expect(v2[key as keyof typeof v2]).toEqual(value);
    }
    for (const key of ["achievements", "volunteering", "awards", "courses", "publications", "interests"] as const) {
      expect(v2[key]).toEqual([]);
    }
    expect(v2.layout).toEqual(defaultLayout());
  });
});

describe("StoredCvSchema", () => {
  it("accepts v1 and returns v2", () => {
    expect(CvContentV1Schema.safeParse(v1Cv()).success).toBe(true);
    expect(StoredCvSchema.parse(v1Cv()).schemaVersion).toBe(2);
  });

  it("accepts v2 unchanged", () => {
    const cv = emptyCv("ro");
    expect(StoredCvSchema.parse(cv)).toEqual(cv);
  });
});

describe("normalizeLayout", () => {
  it("repairs order", () => {
    const layout = { order: ["skills", "skills", "bogus", "summary"], hidden: [], titles: {} } as unknown as Layout;
    const rest = SECTION_KEYS.filter((k) => k !== "skills" && k !== "summary");
    expect(rest).toHaveLength(12);
    expect(normalizeLayout(layout).order).toEqual(["skills", "summary", ...rest]);
  });

  it("drops blank titles and stray hidden keys", () => {
    const layout: Layout = {
      order: ["skills"],
      hidden: ["skills", "bogus" as never],
      titles: { skills: "  ", summary: "About me" },
    };
    const out = normalizeLayout(layout);
    expect(out.hidden).toEqual(["skills"]);
    expect(out.titles).toEqual({ summary: "About me" });
  });
});
