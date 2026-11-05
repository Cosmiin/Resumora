import { describe, expect, it } from "vitest";
import { CvContentSchema, MAX_NOTES, StoredCvSchema, emptyCv, type CvContent, type Experience, type Note } from "./index.ts";
import { carryNotes } from "./notes.ts";

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

  it("11 notes fail validation, 10 pass", () => {
    const many = (n: number) => cvWith(role("r1", "Acme", "Dev", Array.from({ length: n }, (_, i) => note(`n${i}`))));
    expect(MAX_NOTES).toBe(10);
    expect(CvContentSchema.safeParse(many(10)).success).toBe(true);
    expect(CvContentSchema.safeParse(many(11)).success).toBe(false);
  });
});

describe("carryNotes", () => {
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
    const old = Array.from({ length: 10 }, (_, i) => note(`o${i}`, day(i)));
    const current = cvWith(role("old", "Acme", "Dev", old));
    const incoming = cvWith(role("new", "Acme", "Dev", [note("fresh", "2026-02-01T00:00:00.000Z")]));
    const notes = carryNotes(current, incoming).experience[0]!.notes;
    expect(notes).toHaveLength(10);
    expect(notes.map((n) => n.id)).toContain("fresh");
    expect(notes.map((n) => n.id)).not.toContain("o0");
  });

  it("does not touch volunteering or the current CV", () => {
    const current = cvWith(role("old", "Acme", "Dev", [note("n1")]));
    const snapshot = JSON.stringify(current);
    carryNotes(current, cvWith(role("new", "Acme", "Dev")));
    expect(JSON.stringify(current)).toBe(snapshot);
  });
});
