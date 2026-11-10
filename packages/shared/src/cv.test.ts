import { describe, expect, it } from "vitest";
import { CvContentSchema, findScored, scoredItems, ExperienceSchema, MAX_JOB_NOTES, MAX_NOTES, NoteSchema, StoredCvSchema, emptyCv, newId, notePeriod, type CvContent } from "./index.ts";

function experience(overrides: Partial<CvContent["experience"][number]> = {}) {
  return {
    id: newId(),
    company: "Acme",
    title: "Engineer",
    location: "",
    startDate: "2024-01",
    endDate: "",
    current: true,
    description: "",
    bullets: [],
    notes: [],
    ...overrides,
  };
}

function withExperience(items: CvContent["experience"]): CvContent {
  return { ...emptyCv(), experience: items };
}

describe("notePeriod", () => {
  it.each([
    ["2014-10", "2015-07", false, "2014-10 – 2015-07"],
    ["2022-12", "", true, "2022-12 – present"],
    ["2022-12", "2024-01", true, "2022-12 – present"],
    ["2022-12", "", false, "2022-12 – present"],
    ["", "2015-07", false, ""],
  ])("formats %s to %s (current: %s)", (startDate, endDate, current, expected) => {
    expect(notePeriod({ startDate, endDate, current })).toBe(expected);
  });
});

describe("CvContentSchema", () => {
  it.each([1, 3])("accepts photo zoom %i", (zoom) => {
    const cv = emptyCv();
    cv.basics.photo = { path: "user/photo.jpg", x: 0, y: 100, zoom };
    expect(CvContentSchema.safeParse(cv).success).toBe(true);
  });

  it.each([
    { zoom: 4 }, { zoom: 0.9 }, { x: -1 }, { y: 101 },
    { path: "" }, { path: "x".repeat(301) },
  ])("rejects invalid photo values: %j", (overrides) => {
    const cv = emptyCv();
    cv.basics.photo = { path: "user/photo.jpg", x: 50, y: 50, zoom: 1, ...overrides };
    expect(CvContentSchema.safeParse(cv).success).toBe(false);
  });

  it.each([1, 2])("upgrades a stored v%i CV without a photo to null", (schemaVersion) => {
    const cv = emptyCv();
    delete cv.basics.photo;
    const stored = schemaVersion === 1
      ? Object.fromEntries(Object.entries({ ...cv, schemaVersion }).filter(([key]) =>
        !["achievements", "volunteering", "awards", "courses", "publications", "interests", "layout", "enrichedAt"].includes(key)))
      : cv;
    expect(StoredCvSchema.parse(stored).basics.photo).toBeNull();
  });

  it("accepts all six CV locales and rejects unsupported locales", () => {
    for (const locale of ["ro", "en", "fr", "de", "es", "it"]) {
      expect(CvContentSchema.safeParse({ ...emptyCv(), locale }).success).toBe(true);
    }
    expect(CvContentSchema.safeParse({ ...emptyCv(), locale: "nl" }).success).toBe(false);
  });

  it("accepts an optional UUID job id on notes", () => {
    const note = { id: "n1", question: "Q", answer: "A", via: ["type"], askedAt: "2026-11-05T00:00:00Z" };
    expect(NoteSchema.safeParse(note).success).toBe(true);
    expect(NoteSchema.safeParse({ ...note, jobId: newId() }).success).toBe(true);
    expect(NoteSchema.safeParse({ ...note, jobId: "invalid" }).success).toBe(false);
  });

  it("validates enrichment and job note limits separately", () => {
    const notes = Array.from({ length: MAX_NOTES }, (_, i) => ({
      id: `n${i}`, question: "Q", answer: "A", via: ["type"], askedAt: "2026-11-05T00:00:00Z",
    }));
    const jobNotes = Array.from({ length: MAX_JOB_NOTES }, (_, i) => ({ ...notes[0]!, id: `j${i}`, jobId: newId() }));
    expect(MAX_JOB_NOTES).toBe(25);
    expect(ExperienceSchema.safeParse({ ...experience(), notes: [...notes, ...jobNotes] }).success).toBe(true);
    expect(ExperienceSchema.safeParse({ ...experience(), notes: [...jobNotes, { ...jobNotes[0], id: "extra" }] }).success).toBe(false);
  });

  it("accepts missing facts without adding a default", () => {
    expect(ExperienceSchema.parse(experience()).facts).toBeUndefined();
  });

  it("accepts null facts", () => {
    expect(ExperienceSchema.parse(experience({ facts: null })).facts).toBeNull();
  });

  it("limits facts to eight items of 160 characters", () => {
    const withFacts = (count: number, length = 160) => ({
      ...experience(),
      facts: { items: Array.from({ length: count }, () => "x".repeat(length)), fromNotes: "hash", updatedAt: "2026-11-05T00:00:00Z" },
    });
    expect(ExperienceSchema.safeParse(withFacts(8)).success).toBe(true);
    expect(ExperienceSchema.safeParse(withFacts(9)).success).toBe(false);
    expect(ExperienceSchema.safeParse(withFacts(1, 161)).success).toBe(false);
  });

  it("accepts 25 notes and rejects 26", () => {
    const withNotes = (count: number) => ({
      ...experience(),
      notes: Array.from({ length: count }, (_, i) => ({
        id: `n${i}`, question: "Q", answer: "A", via: ["type"], askedAt: "2026-11-05T00:00:00Z",
      })),
    });
    expect(MAX_NOTES).toBe(25);
    expect(ExperienceSchema.safeParse(withNotes(25)).success).toBe(true);
    expect(ExperienceSchema.safeParse(withNotes(26)).success).toBe(false);
  });

  it("emptyCv parses", () => {
    expect(() => CvContentSchema.parse(emptyCv())).not.toThrow();
    expect(emptyCv().schemaVersion).toBe(2);
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

describe("CV format v2", () => {
  const basics = (b: Partial<CvContent["basics"]>) => ({ ...emptyCv(), basics: { ...emptyCv().basics, ...b } });

  it("accepts year-only dates", () => {
    const parses = (startDate: string) =>
      CvContentSchema.safeParse(withExperience([experience({ startDate })])).success;
    expect(parses("2019")).toBe(true);
    expect(parses("2019-04")).toBe(true);
    expect(parses("2019-4")).toBe(false);
    expect(parses("04/2019")).toBe(false);
  });

  it("allows at most two titles", () => {
    expect(CvContentSchema.safeParse(basics({ titles: ["PM", "Analyst"] })).success).toBe(true);
    const result = CvContentSchema.safeParse(basics({ titles: ["a", "b", "c"] }));
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path.slice(0, 2)).toEqual(["basics", "titles"]);
  });

  it("has three skill groups", () => {
    const cv = { ...emptyCv(), technicalSkills: [{ id: "a", name: "SQL" }] };
    expect(CvContentSchema.safeParse(cv).success).toBe(true);
    expect(emptyCv().professionalSkills).toEqual([]);
    expect(emptyCv().unclearSkills).toEqual([]);
    expect(CvContentSchema.safeParse({ ...cv, skills: [] }).success).toBe(false);
  });

  it("keeps custom sections", () => {
    const withCustom = (details: string) =>
      CvContentSchema.safeParse({ ...emptyCv(), custom: [{ id: "c", title: "Volunteering", details }] }).success;
    expect(withCustom("Red Cross, 2018")).toBe(true);
    expect(withCustom("a".repeat(4001))).toBe(false);
  });
});

describe("newId", () => {
  it("is unique", () => {
    expect(new Set(Array.from({ length: 100 }, newId)).size).toBe(100);
  });

  it("rejects the v1 format", () => {
    const v1 = { ...emptyCv(), schemaVersion: 1 };
    expect(CvContentSchema.safeParse(v1).success).toBe(false);
  });

  it("achievements is limited to 10", () => {
    const bullets = (n: number) => Array.from({ length: n }, (_, i) => ({ id: "b" + i, text: "x" }));
    expect(CvContentSchema.safeParse({ ...emptyCv(), achievements: bullets(10) }).success).toBe(true);
    expect(CvContentSchema.safeParse({ ...emptyCv(), achievements: bullets(11) }).success).toBe(false);
  });
});

describe("enrichedAt (J2)", () => {
  it("old CVs without it parse as not enriched", () => {
    const old: Record<string, unknown> = { ...emptyCv() };
    delete old.enrichedAt;
    expect(CvContentSchema.parse(old).enrichedAt).toBeNull();
    expect(emptyCv().enrichedAt).toBeNull();
  });
  it("accepts an ISO date and rejects anything else", () => {
    expect(CvContentSchema.parse({ ...emptyCv(), enrichedAt: "2026-11-09T12:00:00.000Z" }).enrichedAt).toBe("2026-11-09T12:00:00.000Z");
    expect(CvContentSchema.safeParse({ ...emptyCv(), enrichedAt: "yesterday" }).success).toBe(false);
  });
});

describe("projects take the role shape", () => {
  const legacy = { id: "pr1", name: "Budget forecast", description: "Built a Python script. It predicts spend within 5%!\nUsed pandas.", url: "github.com/x" };

  it("keeps job answers saved onto an old-shape project (E6 whole-branch review)", () => {
    const answer = { id: "n1", question: "What did it check?", answer: "Tax codes", via: ["type"], askedAt: "2026-11-09T10:00:00Z", jobId: "00000000-0000-4000-8000-000000000001" };
    const cv = CvContentSchema.parse({ ...emptyCv(), projects: [{ ...legacy, notes: [answer] }] });
    expect(cv.projects[0]!.notes).toEqual([answer]);
    expect(CvContentSchema.parse({ ...emptyCv(), projects: [legacy] }).projects[0]!.notes).toEqual([]);
  });

  it("reads an old project into the role shape, one bullet per sentence", () => {
    const cv = CvContentSchema.parse({ ...emptyCv(), projects: [legacy] });
    expect(cv.projects[0]).toEqual({
      id: "pr1", title: "Budget forecast", company: "", location: "", startDate: "", endDate: "", current: false,
      description: "",
      bullets: [
        { id: "pr1-b1", text: "Built a Python script." },
        { id: "pr1-b2", text: "It predicts spend within 5%!" },
        { id: "pr1-b3", text: "Used pandas." },
      ],
      notes: [], url: "github.com/x",
    });
  });

  it("gives the same bullet ids each time the same stored project is read", () => {
    const a = CvContentSchema.parse({ ...emptyCv(), projects: [legacy] });
    const b = StoredCvSchema.parse({ ...emptyCv(), projects: [legacy] });
    expect(b.projects[0]!.bullets.map((x) => x.id)).toEqual(a.projects[0]!.bullets.map((x) => x.id));
  });

  it("an old project with no paragraph has no bullets", () => {
    const cv = CvContentSchema.parse({ ...emptyCv(), projects: [{ ...legacy, description: "  " }] });
    expect(cv.projects[0]!.bullets).toEqual([]);
  });

  it("keeps a new-shape project as it is", () => {
    const project = { ...experience({ title: "Forecast", company: "Personal project", bullets: [{ id: "b1", text: "Did it" }] }), url: "x.io" };
    const cv = CvContentSchema.parse({ ...emptyCv(), projects: [project] });
    expect(cv.projects[0]).toEqual(project);
  });

  it("rejects a new-shape project with an unknown field", () => {
    const project = { ...experience(), url: "", extra: 1 };
    expect(CvContentSchema.safeParse({ ...emptyCv(), projects: [project] }).success).toBe(false);
  });
});

describe("lines under the lighter items", () => {
  it("old courses, awards, publications and interests parse with no lines", () => {
    const cv = CvContentSchema.parse({
      ...emptyCv(),
      courses: [{ id: "c1", name: "Power BI", provider: "Microsoft", date: "2025" }],
      awards: [{ id: "a1", name: "Top performer", issuer: "PMI", date: "2019", description: "" }],
      publications: [{ id: "p1", title: "Paper", publisher: "Journal", date: "2020", url: "" }],
      interests: [{ id: "i1", name: "Running" }],
    });
    for (const item of [cv.courses[0]!, cv.awards[0]!, cv.publications[0]!, cv.interests[0]!]) expect(item.bullets ?? []).toEqual([]);
  });

  it("keeps the lines of a course", () => {
    const course = { id: "c1", name: "Power BI", provider: "Microsoft", date: "2025", bullets: [{ id: "l1", text: "Built dashboards" }] };
    expect(CvContentSchema.parse({ ...emptyCv(), courses: [course] }).courses[0]).toEqual(course);
  });
});

describe("scoredItems", () => {
  it("lists roles, then projects, then volunteering, each with its kind", () => {
    const cv = {
      ...emptyCv(),
      experience: [experience({ id: "r1" })],
      projects: [{ ...experience({ id: "p1" }), url: "" }],
      volunteering: [experience({ id: "v1" })],
    };
    expect(scoredItems(cv).map(({ item, kind }) => [item.id, kind])).toEqual([["r1", "role"], ["p1", "project"], ["v1", "volunteering"]]);
    expect(findScored(cv, "p1")?.kind).toBe("project");
    expect(findScored(cv, "nope")).toBeUndefined();
  });
});
