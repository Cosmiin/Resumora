import { describe, expect, it } from "vitest";
import { MAX_BULLETS, MAX_JOB_NOTES, MAX_NOTES, emptyCv, notesHash, type CvContent, type Experience } from "@resumora/shared";
import { cvReducer, sectionsOnCv } from "./cvReducer.ts";

function role(id: string, bullets: string[], extra: Partial<Experience> = {}): Experience {
  return {
    id,
    company: "Acme",
    title: "Dev",
    location: "",
    startDate: "2020-01",
    endDate: "",
    current: false,
    description: "",
    bullets: bullets.map((text, i) => ({ id: `${id}-b${i + 1}`, text })),
    ...extra,
    notes: extra.notes ?? [],
  };
}

function withRole(bullets: string[], extra: Partial<Experience> = {}): CvContent {
  return { ...emptyCv(), experience: [role("e1", bullets, extra)] };
}

const owner = { list: "experience", itemId: "e1" } as const;
const texts = (cv: CvContent) => cv.experience[0]!.bullets.map((b) => b.text);

describe("bullets", () => {
  it("splitBullet at the middle", () => {
    const cv = cvReducer(withRole(["Led a teamof 5"]), { type: "splitBullet", owner, bulletId: "e1-b1", at: 10, newId: "n1" });
    expect(texts(cv)).toEqual(["Led a team", "of 5"]);
    expect(cv.experience[0]!.bullets[1]!.id).toBe("n1");
  });

  it("splitBullet at the end creates an empty bullet", () => {
    const cv = cvReducer(withRole(["Done"]), { type: "splitBullet", owner, bulletId: "e1-b1", at: 4, newId: "n1" });
    expect(texts(cv)).toEqual(["Done", ""]);
  });

  it("splitBullet keeps an earlier line break in the left half", () => {
    const cv = cvReducer(withRole(["a\nbc"]), { type: "splitBullet", owner, bulletId: "e1-b1", at: 3, newId: "n1" });
    expect(texts(cv)).toEqual(["a\nb", "c"]);
  });

  it("joinBullet merges into the previous bullet", () => {
    const cv = cvReducer(withRole(["One ", "two"]), { type: "joinBullet", owner, bulletId: "e1-b2" });
    expect(texts(cv)).toEqual(["One two"]);
  });

  it("joinBullet on the first bullet does nothing", () => {
    const before = withRole(["One", "two"]);
    expect(cvReducer(before, { type: "joinBullet", owner, bulletId: "e1-b1" })).toBe(before);
  });

  it("an empty bullet joined away just disappears", () => {
    const cv = cvReducer(withRole(["One", ""]), { type: "joinBullet", owner, bulletId: "e1-b2" });
    expect(texts(cv)).toEqual(["One"]);
  });

  it("adding past the bullet limit does nothing", () => {
    const before = withRole(Array.from({ length: 20 }, (_, i) => `b${i}`));
    expect(cvReducer(before, { type: "addBullet", owner, newId: "x" })).toBe(before);
    expect(cvReducer(before, { type: "splitBullet", owner, bulletId: "e1-b1", at: 1, newId: "x" })).toBe(before);
  });

  it("achievements work as an owner and stop at 10", () => {
    let cv = emptyCv();
    for (let i = 0; i < 12; i++) cv = cvReducer(cv, { type: "addBullet", owner: { list: "achievements" }, newId: `a${i}` });
    expect(cv.achievements).toHaveLength(10);
    cv = cvReducer(cv, { type: "setBullet", owner: { list: "achievements" }, bulletId: "a0", text: "Won" });
    expect(cv.achievements[0]!.text).toBe("Won");
  });
});

describe("sections", () => {
  function sectioned(): CvContent {
    return {
      ...emptyCv(),
      basics: { ...emptyCv().basics, summary: "Hi" },
      experience: [role("e1", ["x"])],
      education: [],
      languages: [{ id: "l1", name: "English", level: "C2" }],
      layout: {
        order: ["summary", "experience", "education", "languages", "skills", "achievements", "volunteering", "certifications", "projects", "awards", "courses", "publications", "interests", "other"],
        hidden: ["experience"],
        titles: {},
      },
    };
  }

  it("sectionsOnCv lists non-empty sections in layout order, hidden included", () => {
    expect(sectionsOnCv(sectioned())).toEqual(["summary", "experience", "languages"]);
  });

  it("moveSection moves between sections present on the CV only", () => {
    const cv = cvReducer(sectioned(), { type: "moveSection", from: 0, to: 2 });
    expect(sectionsOnCv(cv)).toEqual(["experience", "languages", "summary"]);
    // empty sections keep their slots
    expect(cv.layout.order.indexOf("education")).toBe(2);
    expect(cv.layout.hidden).toEqual(["experience"]);
  });

  it("moveSection with bad indexes does nothing", () => {
    const before = sectioned();
    expect(cvReducer(before, { type: "moveSection", from: 0, to: 9 })).toBe(before);
    expect(cvReducer(before, { type: "moveSection", from: 1, to: 1 })).toBe(before);
  });

  it('setSectionTitle "" removes the override', () => {
    let cv = cvReducer(emptyCv(), { type: "setSectionTitle", key: "experience", value: "Work" });
    expect(cv.layout.titles.experience).toBe("Work");
    cv = cvReducer(cv, { type: "setSectionTitle", key: "experience", value: "" });
    expect(cv.layout.titles).toEqual({});
  });

  it("toggleHidden hides and shows", () => {
    let cv = cvReducer(emptyCv(), { type: "toggleHidden", key: "skills" });
    expect(cv.layout.hidden).toEqual(["skills"]);
    cv = cvReducer(cv, { type: "toggleHidden", key: "skills" });
    expect(cv.layout.hidden).toEqual([]);
  });

  it("addSection un-hides and creates one empty entry with the given id", () => {
    const hidden = { ...emptyCv(), layout: { ...emptyCv().layout, hidden: ["volunteering" as const] } };
    const cv = cvReducer(hidden, { type: "addSection", key: "volunteering", id: "v1" });
    expect(cv.layout.hidden).toEqual([]);
    expect(cv.volunteering).toHaveLength(1);
    expect(cv.volunteering[0]).toMatchObject({ id: "v1", company: "", current: false, bullets: [{ id: "v1-b1", text: "" }] });
    expect(sectionsOnCv(cv)).toContain("volunteering");
  });

  it("addSection for achievements, other, summary and skills", () => {
    let cv = cvReducer(emptyCv(), { type: "addSection", key: "achievements", id: "a1" });
    expect(cv.achievements).toEqual([{ id: "a1", text: "" }]);
    expect(sectionsOnCv(cv)).toContain("achievements");
    cv = cvReducer(cv, { type: "addSection", key: "other", id: "c1" });
    expect(cv.custom).toEqual([{ id: "c1", title: "", details: "" }]);
    const hidden = { ...emptyCv(), layout: { ...emptyCv().layout, hidden: ["summary" as const, "skills" as const] } };
    cv = cvReducer(cvReducer(hidden, { type: "addSection", key: "summary", id: "s" }), { type: "addSection", key: "skills", id: "k" });
    expect(cv.layout.hidden).toEqual([]);
  });

  it("addCustomSection adds an entry with a title", () => {
    const cv = cvReducer(emptyCv(), { type: "addCustomSection", id: "c1", title: "Hobbies" });
    expect(cv.custom).toEqual([{ id: "c1", title: "Hobbies", details: "" }]);
  });
});

describe("skills", () => {
  it("addSkill ignores duplicates across groups", () => {
    let cv = cvReducer(emptyCv(), { type: "addSkill", group: "technicalSkills", name: "  React " });
    expect(cv.technicalSkills.map((s) => s.name)).toEqual(["React"]);
    const same = cvReducer(cv, { type: "addSkill", group: "professionalSkills", name: "react" });
    expect(same).toBe(cv);
    expect(cvReducer(cv, { type: "addSkill", group: "unclearSkills", name: "   " })).toBe(cv);
    cv = cvReducer(cv, { type: "addSkill", group: "professionalSkills", name: "Teamwork" });
    expect(cv.professionalSkills).toHaveLength(1);
  });

  it("moveSkill moves a to-sort skill into technical", () => {
    let cv = cvReducer(emptyCv(), { type: "addSkill", group: "unclearSkills", name: "Docker" });
    const id = cv.unclearSkills[0]!.id;
    cv = cvReducer(cv, { type: "moveSkill", skillId: id, to: "technicalSkills" });
    expect(cv.unclearSkills).toEqual([]);
    expect(cv.technicalSkills).toEqual([{ id, name: "Docker" }]);
  });

  it("moveSkills moves several skills in one action and skips ones it cannot move", () => {
    let cv = cvReducer(emptyCv(), { type: "addSkill", group: "unclearSkills", name: "Docker" });
    cv = cvReducer(cv, { type: "addSkill", group: "unclearSkills", name: "Teamwork" });
    const [a, b] = cv.unclearSkills;
    const next = cvReducer(cv, {
      type: "moveSkills",
      moves: [
        { skillId: a!.id, group: "technicalSkills" },
        { skillId: "gone", group: "technicalSkills" },
        { skillId: b!.id, group: "professionalSkills" },
      ],
    });
    expect(next.unclearSkills).toEqual([]);
    expect(next.technicalSkills).toEqual([a]);
    expect(next.professionalSkills).toEqual([b]);
    expect(cvReducer(cv, { type: "moveSkills", moves: [] })).toBe(cv);
  });

  it("moveSkills can move a skill already sitting in a group to the other group", () => {
    let cv = cvReducer(emptyCv(), { type: "addSkill", group: "technicalSkills", name: "Excel" });
    const id = cv.technicalSkills[0]!.id;
    cv = cvReducer(cv, { type: "moveSkills", moves: [{ skillId: id, group: "professionalSkills" }] });
    expect(cv.technicalSkills).toEqual([]);
    expect(cv.professionalSkills).toEqual([{ id, name: "Excel" }]);
  });

  it("removeSkill removes", () => {
    let cv = cvReducer(emptyCv(), { type: "addSkill", group: "technicalSkills", name: "Go" });
    cv = cvReducer(cv, { type: "removeSkill", group: "technicalSkills", skillId: cv.technicalSkills[0]!.id });
    expect(cv.technicalSkills).toEqual([]);
  });
});

describe("items and fields", () => {
  it("setCurrent true clears the end date", () => {
    const cv = cvReducer(withRole(["x"], { endDate: "2022-05" }), { type: "setCurrent", list: "experience", itemId: "e1", current: true });
    expect(cv.experience[0]).toMatchObject({ current: true, endDate: "" });
  });

  it("addItem, setItemField, moveItem, removeItem", () => {
    let cv = cvReducer(emptyCv(), { type: "addItem", list: "experience", id: "e1" });
    expect(cv.experience[0]!.bullets).toEqual([{ id: "e1-b1", text: "" }]);
    cv = cvReducer(cv, { type: "addItem", list: "experience", id: "e2" });
    cv = cvReducer(cv, { type: "setItemField", list: "experience", itemId: "e2", field: "company", value: "Zed" });
    cv = cvReducer(cv, { type: "moveItem", list: "experience", from: 1, to: 0 });
    expect(cv.experience.map((e) => e.id)).toEqual(["e2", "e1"]);
    expect(cv.experience[0]!.company).toBe("Zed");
    cv = cvReducer(cv, { type: "removeItem", list: "experience", itemId: "e2" });
    expect(cv.experience.map((e) => e.id)).toEqual(["e1"]);
  });

  it("addItem stops at 40", () => {
    let cv = emptyCv();
    for (let i = 0; i < 45; i++) cv = cvReducer(cv, { type: "addItem", list: "interests", id: `i${i}` });
    expect(cv.interests).toHaveLength(40);
  });

  it("basics, titles, summary, interests", () => {
    let cv = cvReducer(emptyCv(), { type: "setBasics", field: "fullName", value: "Ana" });
    cv = cvReducer(cv, { type: "setTitles", index: 1, value: "Lead" });
    expect(cv.basics.titles).toEqual(["", "Lead"]);
    cv = cvReducer(cv, { type: "setTitles", index: 1, value: "" });
    expect(cv.basics.titles).toEqual([]);
    cv = cvReducer(cv, { type: "setSummary", value: "Hello" });
    expect(cv.basics).toMatchObject({ fullName: "Ana", summary: "Hello" });
    cv = cvReducer(cv, { type: "addInterest", name: " Chess " });
    expect(cv.interests.map((i) => i.name)).toEqual(["Chess"]);
    cv = cvReducer(cv, { type: "removeInterest", itemId: cv.interests[0]!.id });
    expect(cv.interests).toEqual([]);
  });
});

describe("no-ops", () => {
  it("an action that changes nothing returns the same object", () => {
    const cv = withRole(["x"]);
    expect(cvReducer(cv, { type: "setBasics", field: "fullName", value: "" })).toBe(cv);
    expect(cvReducer(cv, { type: "setBullet", owner, bulletId: "e1-b1", text: "x" })).toBe(cv);
    expect(cvReducer(cv, { type: "setItemField", list: "experience", itemId: "e1", field: "company", value: "Acme" })).toBe(cv);
    expect(cvReducer(cv, { type: "setItemField", list: "experience", itemId: "nope", field: "company", value: "A" })).toBe(cv);
    expect(cvReducer(cv, { type: "removeItem", list: "experience", itemId: "nope" })).toBe(cv);
    expect(cvReducer(cv, { type: "moveItem", list: "experience", from: 0, to: 0 })).toBe(cv);
    expect(cvReducer(cv, { type: "setSectionTitle", key: "experience", value: "" })).toBe(cv);
    expect(cvReducer(cv, { type: "setSummary", value: "" })).toBe(cv);
  });
});

describe("setNote", () => {
  const note = (answer: string) => ({
    id: "n1", question: "How many?", answer, via: ["type" as const], askedAt: "2026-01-01T00:00:00.000Z",
  });

  it("adds a note, then replaces it by id", () => {
    const added = cvReducer(withRole(["x"]), { type: "setNote", roleId: "e1", note: note("first") });
    expect(added.experience[0]!.notes).toEqual([note("first")]);
    const replaced = cvReducer(added, { type: "setNote", roleId: "e1", note: note("second") });
    expect(replaced.experience[0]!.notes).toEqual([note("second")]);
  });

  it.each(["enrichment", "job"] as const)("adding an answer preserves all notes of the other kind: %s", (kind) => {
    const jobId = "00000000-0000-4000-8000-000000000001";
    const full = Array.from({ length: kind === "enrichment" ? MAX_JOB_NOTES : MAX_NOTES }, (_, i) => ({
      ...note("existing"), id: `n${i}`, ...(kind === "enrichment" ? { jobId } : {}),
    }));
    const fresh = { ...note("latest"), id: "new", ...(kind === "job" ? { jobId } : {}) };
    const cv = withRole(["x"], { notes: full });
    const notes = cvReducer(cv, { type: "setNote", roleId: "e1", note: fresh }).experience[0]!.notes;
    expect(notes).toEqual([...full, fresh]);
  });

  it("when the role is full, the oldest note makes room for the new one", () => {
    const at = (day: number) => `2026-01-${String(day).padStart(2, "0")}T00:00:00.000Z`;
    // Not in date order, so "oldest" means by askedAt, not by position.
    const full = Array.from({ length: MAX_NOTES }, (_, i) => ({
      id: `n${i}`, question: "Q", answer: `a${i}`, via: ["type" as const], askedAt: at(i === 3 ? 1 : i + 2),
    }));
    const cv = withRole(["x"], { notes: full });
    const fresh = { id: "new", question: "Q", answer: "latest", via: ["voice" as const], askedAt: at(28) };
    const notes = cvReducer(cv, { type: "setNote", roleId: "e1", note: fresh }).experience[0]!.notes;
    expect(notes).toHaveLength(MAX_NOTES);
    expect(notes.some((n) => n.id === "n3")).toBe(false);
    expect(notes.at(-1)).toEqual(fresh);
  });

  it("ignores an unknown role", () => {
    const cv = withRole(["x"]);
    expect(cvReducer(cv, { type: "setNote", roleId: "nope", note: note("a") })).toBe(cv);
  });

  it("new roles start with no notes", () => {
    const cv = cvReducer(emptyCv(), { type: "addItem", list: "experience", id: "e9" });
    expect(cv.experience[0]!.notes).toEqual([]);
  });
});

describe("focus actions", () => {
  const facts = { items: ["Built APIs"], fromNotes: notesHash([]), updatedAt: "2026-11-05T10:00:00.000Z" };

  it("replaceBullet changes only the selected text and keeps its id", () => {
    const cv = { ...withRole(["First", "Second"]), experience: [role("e1", ["First", "Second"]), role("e2", ["Other"])] };
    const next = cvReducer(cv, { type: "replaceBullet", roleId: "e1", bulletId: "e1-b2", text: "Improved" });
    expect(next.experience[0]).toEqual({ ...cv.experience[0], bullets: [{ id: "e1-b1", text: "First" }, { id: "e1-b2", text: "Improved" }] });
    expect(next.experience[0]!.bullets[0]).toBe(cv.experience[0]!.bullets[0]);
    expect(next.experience[1]).toBe(cv.experience[1]);
    expect(cv.experience[0]!.bullets[1]!.text).toBe("Second");
  });

  it("replaceBullet returns the same CV for unchanged text or missing targets", () => {
    const cv = withRole(["First"]);
    expect(cvReducer(cv, { type: "replaceBullet", roleId: "e1", bulletId: "e1-b1", text: "First" })).toBe(cv);
    expect(cvReducer(cv, { type: "replaceBullet", roleId: "e1", bulletId: "missing", text: "New" })).toBe(cv);
    expect(cvReducer(cv, { type: "replaceBullet", roleId: "missing", bulletId: "e1-b1", text: "New" })).toBe(cv);
  });

  it("addBullets appends only two of three texts to an 18-bullet role with new ids", () => {
    const cv = withRole(Array.from({ length: 18 }, (_, i) => "Bullet " + i));
    const next = cvReducer(cv, { type: "addBullets", roleId: "e1", texts: ["One", "Two", "Three"] });
    const bullets = next.experience[0]!.bullets;
    expect(bullets).toHaveLength(20);
    expect(bullets.slice(0, 18)).toEqual(cv.experience[0]!.bullets);
    expect(bullets.slice(18).map((b) => b.text)).toEqual(["One", "Two"]);
    expect(bullets.slice(18).every((b) => b.id.length > 0)).toBe(true);
    expect(new Set(bullets.map((b) => b.id)).size).toBe(20);
    expect(cv.experience[0]!.bullets).toHaveLength(18);
  });

  it("addBullets returns the same CV for no texts, a full role or a missing role", () => {
    const cv = withRole(["First"]);
    const full = withRole(Array.from({ length: MAX_BULLETS }, () => "Bullet"));
    expect(cvReducer(cv, { type: "addBullets", roleId: "e1", texts: [] })).toBe(cv);
    expect(cvReducer(full, { type: "addBullets", roleId: "e1", texts: ["New"] })).toBe(full);
    expect(cvReducer(cv, { type: "addBullets", roleId: "missing", texts: ["New"] })).toBe(cv);
  });

  it("setFacts sets and clears a role's facts without changing its other content", () => {
    const cv = withRole(["First"]);
    const next = cvReducer(cv, { type: "setFacts", roleId: "e1", facts });
    expect(next.experience[0]).toEqual({ ...cv.experience[0], facts });
    const cleared = cvReducer(next, { type: "setFacts", roleId: "e1", facts: null });
    expect(cleared.experience[0]).toEqual({ ...cv.experience[0], facts: null });
    expect(cv.experience[0]!.facts).toBeUndefined();
  });

  it("setFacts ignores facts from notes changed by a restore", () => {
    const cv = withRole(["First"], { notes: [{
      id: "n1", question: "What did you build?", answer: "Built APIs", via: ["type"],
      askedAt: "2026-11-05T10:00:00.000Z",
    }] });
    const returnedFacts = { ...facts, fromNotes: notesHash(cv.experience[0]!.notes) };
    expect(cvReducer(cv, { type: "setFacts", roleId: "e1", facts: returnedFacts }).experience[0]!.facts).toEqual(returnedFacts);
    const restored = withRole(["First"]);
    expect(cvReducer(restored, { type: "setFacts", roleId: "e1", facts: returnedFacts })).toBe(restored);
  });

  it("setFacts returns the same CV for equal facts, no facts or a missing role", () => {
    const cv = withRole(["First"], { facts });
    expect(cvReducer(cv, { type: "setFacts", roleId: "e1", facts: { ...facts, items: [...facts.items] } })).toBe(cv);
    expect(cvReducer(cv, { type: "setFacts", roleId: "missing", facts })).toBe(cv);
    const absent = withRole(["First"]);
    expect(cvReducer(absent, { type: "setFacts", roleId: "e1", facts: null })).toBe(absent);
    const cleared = withRole(["First"], { facts: null });
    expect(cvReducer(cleared, { type: "setFacts", roleId: "e1", facts: null })).toBe(cleared);
  });
});
