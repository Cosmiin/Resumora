import { describe, expect, it } from "vitest";
import { CvContentSchema, MAX_JOB_NOTES, MAX_NOTES, StoredCvSchema, emptyCv, type CvContent, type Experience, type Note } from "./index.ts";
import { carryNotes, mergeNewerNotes, onlyNotesDiffer } from "./notes.ts";

function note(id: string, askedAt = "2026-01-01T00:00:00.000Z", answer = "A"): Note {
  return { id, question: "How many?", answer, via: ["type"], askedAt };
}

function role(id: string, company: string, title: string, notes: Note[] = []): Experience {
  return {
    id, company, title, location: "", startDate: "2020-01", endDate: "", current: false, description: "", bullets: [], notes,
  };
}

function cvWith(...experience: Experience[]): CvContent {
  return { ...emptyCv(), experience };
}

describe("notes in the schema", () => {
  it("a stored CV without notes parses with notes: []", () => {
    const stored = cvWith(role("r1", "Acme", "Dev"));
    const raw = JSON.parse(JSON.stringify(stored));
    delete raw.experience[0].notes;
    const parsed = StoredCvSchema.parse(raw);
    expect(parsed.experience[0]!.notes).toEqual([]);
  });

  it("26 notes fail validation, 25 pass", () => {
    const many = (n: number) => cvWith(role("r1", "Acme", "Dev", Array.from({ length: n }, (_, i) => note(`n${i}`))));
    expect(MAX_NOTES).toBe(25);
    expect(CvContentSchema.safeParse(many(25)).success).toBe(true);
    expect(CvContentSchema.safeParse(many(26)).success).toBe(false);
  });
});

describe("carryNotes", () => {
  const facts = { items: ["Used SQL"], fromNotes: "hash", updatedAt: "2026-11-05T00:00:00Z" };

  it.each([undefined, null])("carries facts when incoming facts are %s, even without notes", (incomingFacts) => {
    const current = cvWith({ ...role("old", " Acme ", "DEV"), facts });
    const incoming = cvWith({ ...role("new", "acme", "dev"), facts: incomingFacts });
    expect(carryNotes(current, incoming).experience[0]!.facts).toEqual(facts);
    expect(incoming.experience[0]!.facts).toBe(incomingFacts);
  });

  it("keeps incoming non-null facts", () => {
    const current = cvWith({ ...role("old", "Acme", "Dev"), facts });
    const own = { ...facts, items: [] };
    const incoming = cvWith({ ...role("new", "Acme", "Dev"), facts: own });
    expect(carryNotes(current, incoming).experience[0]!.facts).toEqual(own);
  });

  it("copies notes when company and title match ignoring case and spaces", () => {
    const current = cvWith(role("old", "  Acme   SRL ", "Product  Manager", [note("n1")]));
    const incoming = cvWith(role("new", "acme srl", "product manager"));
    expect(carryNotes(current, incoming).experience[0]!.notes).toEqual([note("n1")]);
  });

  it("skips a role whose match is ambiguous", () => {
    const current = cvWith(role("old", "Acme", "Dev", [note("n1")]));
    const incoming = cvWith(role("a", "Acme", "Dev"), role("b", "ACME", "dev"));
    const result = carryNotes(current, incoming);
    expect(result.experience.map((r) => r.notes)).toEqual([[], []]);
  });

  it("leaves unmatched incoming roles unchanged", () => {
    const current = cvWith(role("old", "Acme", "Dev", [note("n1")]));
    const incoming = cvWith(role("new", "Other", "Dev"));
    expect(carryNotes(current, incoming)).toEqual(incoming);
  });

  it("incoming notes win on equal ids and the rest are added", () => {
    const current = cvWith(role("old", "Acme", "Dev", [note("n1", undefined, "old"), note("n2")]));
    const incoming = cvWith(role("new", "Acme", "Dev", [note("n1", undefined, "new")]));
    const notes = carryNotes(current, incoming).experience[0]!.notes;
    expect(notes.find((n) => n.id === "n1")!.answer).toBe("new");
    expect(notes.map((n) => n.id).sort()).toEqual(["n1", "n2"]);
  });

  it("caps at MAX_NOTES keeping the newest by askedAt", () => {
    const day = (i: number) => `2026-01-${String(i + 1).padStart(2, "0")}T00:00:00.000Z`;
    const old = Array.from({ length: MAX_NOTES }, (_, i) => note(`o${i}`, day(i)));
    const current = cvWith(role("old", "Acme", "Dev", old));
    const incoming = cvWith(role("new", "Acme", "Dev", [note("fresh", "2026-02-01T00:00:00.000Z")]));
    const notes = carryNotes(current, incoming).experience[0]!.notes;
    expect(notes).toHaveLength(MAX_NOTES);
    expect(notes.map((n) => n.id)).toContain("fresh");
    expect(notes.map((n) => n.id)).not.toContain("o0");
  });

  it("keeps 25 enrichment notes and 25 job notes independently", () => {
    const enrichment = Array.from({ length: MAX_NOTES }, (_, i) => note(`e${i}`));
    const jobs = Array.from({ length: MAX_JOB_NOTES }, (_, i) => ({
      ...note(`j${i}`, `2026-02-${String(i + 1).padStart(2, "0")}T00:00:00Z`),
      jobId: "00000000-0000-4000-8000-000000000001",
    }));
    const current = cvWith(role("old", "Acme", "Dev", enrichment));
    const incoming = cvWith(role("new", "Acme", "Dev", jobs));
    expect(carryNotes(current, incoming).experience[0]!.notes).toEqual([...enrichment, ...jobs]);

    const fresh = { ...jobs[0]!, id: "fresh", askedAt: "2026-03-01T00:00:00Z" };
    const result = carryNotes(cvWith(role("old", "Acme", "Dev", [...enrichment, ...jobs])),
      cvWith(role("new", "Acme", "Dev", [fresh])));
    const notes = result.experience[0]!.notes;
    expect(notes).toHaveLength(MAX_NOTES + MAX_JOB_NOTES);
    expect(notes.filter((n) => n.jobId === undefined)).toEqual(enrichment);
    expect(notes).toContainEqual(fresh);
    expect(notes.map((n) => n.id)).not.toContain("j0");
    expect(CvContentSchema.safeParse(result).success).toBe(true);
  });

  it("does not touch volunteering or the current CV", () => {
    const current = cvWith(role("old", "Acme", "Dev", [note("n1")]));
    const snapshot = JSON.stringify(current);
    carryNotes(current, cvWith(role("new", "Acme", "Dev")));
    expect(JSON.stringify(current)).toBe(snapshot);
  });
});

describe("onlyNotesDiffer", () => {
  it("treats equal content as equal regardless of object key order", () => {
    const a = cvWith(role("r1", "Acme", "Dev"));
    const { title, ...rest } = a.experience[0]!;
    expect(onlyNotesDiffer(a, cvWith({ title, ...rest }))).toBe(true);
  });

  it.each(["experience", "volunteering"] as const)("ignores notes and facts in %s without changing either CV", (section) => {
    const a = { ...emptyCv(), [section]: [role("r1", "Acme", "Dev")] };
    const facts = { items: ["Used SQL"], fromNotes: "hash", updatedAt: "2026-11-05T00:00:00Z" };
    const b = { ...a, [section]: [{ ...a[section][0]!, notes: [note("n1")], facts }] };
    const snapshot = JSON.stringify({ a, b });
    expect(onlyNotesDiffer(a, b)).toBe(true);
    expect(onlyNotesDiffer(b, a)).toBe(true);
    expect(JSON.stringify({ a, b })).toBe(snapshot);
    expect(onlyNotesDiffer(a, { ...b, [section]: [{ ...b[section][0]!, title: "Manager" }] })).toBe(false);
    expect(onlyNotesDiffer(a, { ...b, [section]: [] })).toBe(false);
  });

  it("detects changes outside roles and changes to role order", () => {
    const a = cvWith(role("r1", "Acme", "Dev"), role("r2", "Other", "Manager"));
    expect(onlyNotesDiffer(a, { ...a, basics: { ...a.basics, fullName: "Ana" } })).toBe(false);
    expect(onlyNotesDiffer(a, { ...a, experience: [...a.experience].reverse() })).toBe(false);
  });
});

describe("mergeNewerNotes", () => {
  it("keeps notes added since saving, lets current notes win, and preserves target content", () => {
    const targetRole = role("r1", "Old company", "Old title", [note("n1"), note("saved")]);
    const target = cvWith(targetRole, role("only-target", "Other", "Dev", [note("target-only")]));
    const current = cvWith(role("r1", "New company", "New title", [note("n1", undefined, "updated"), note("added")]),
      role("only-current", "Other", "Dev"));
    const snapshot = JSON.stringify({ target, current });
    const result = mergeNewerNotes(target, current);
    expect(result.experience[0]).toEqual({
      ...targetRole, notes: [note("n1", undefined, "updated"), note("saved"), note("added")],
    });
    expect(result.experience[1]).toEqual(target.experience[1]);
    expect(result.experience).toHaveLength(2);
    expect(JSON.stringify({ target, current })).toBe(snapshot);
  });

  it("keeps the newest notes up to each kind's cap", () => {
    const notes = Array.from({ length: MAX_NOTES }, (_, i) => note(`e${i}`, `2026-01-${String(i + 1).padStart(2, "0")}T00:00:00Z`));
    const jobs = notes.map((n, i) => ({ ...n, id: `j${i}`, jobId: "00000000-0000-4000-8000-000000000001" }));
    const target = cvWith(role("r1", "Acme", "Dev", [...notes, ...jobs]));
    const added = note("new", "2026-03-01T00:00:00Z");
    const addedJob = { ...added, id: "new-job", jobId: jobs[0]!.jobId };
    const result = mergeNewerNotes(target, cvWith(role("r1", "Acme", "Dev", [added, addedJob])));
    expect(result.experience[0]!.notes).toEqual([...notes.slice(1), ...jobs.slice(1), added, addedJob]);
  });

  it.each(["experience", "volunteering"] as const)("merges notes and newer facts for %s roles", (section) => {
    const savedFacts = { items: ["Old fact"], fromNotes: "saved-hash", updatedAt: "2026-01-01T00:00:00Z" };
    const newerFacts = { items: ["New fact"], fromNotes: "current-hash", updatedAt: "2026-02-01T00:00:00Z" };
    const target = { ...emptyCv(), [section]: [{ ...role("r1", "Acme", "Dev"), facts: savedFacts }] };
    const current = { ...emptyCv(), [section]: [{ ...role("r1", "Acme", "Dev", [note("added")]), facts: newerFacts }] };
    expect(mergeNewerNotes(target, current)[section][0]!.facts).toEqual(newerFacts);
    expect(mergeNewerNotes(target, current)[section][0]!.notes).toEqual([note("added")]);
    expect(mergeNewerNotes(current, target)[section][0]!.facts).toEqual(newerFacts);
    const withoutFacts = { ...emptyCv(), [section]: [role("r1", "Acme", "Dev")] };
    expect(mergeNewerNotes(withoutFacts, current)[section][0]!.facts).toEqual(newerFacts);
  });
});
