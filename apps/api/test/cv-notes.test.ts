import { describe, expect, it } from "vitest";
import { CvContentSchema, MAX_CV_BYTES, MAX_JOB_NOTES, MAX_NOTES, emptyCv, type Experience, type Note } from "@resumora/shared";
import { memoryCvRepo } from "../src/cv/memory-repo.ts";
import { ApiError } from "../src/errors.ts";

const jobId = "aaaaaaaa-0000-4000-8000-000000000001";
const note = (i: number): Note => ({
  id: `job-${i}`, jobId, question: "What did you build?", answer: `Answer ${i}`,
  via: ["type"], askedAt: new Date(Date.UTC(2026, 0, i)).toISOString(),
});
const role = (id = "role-1", notes: Note[] = []): Experience => ({
  id, company: "Acme", title: "Engineer", location: "", startDate: "2020", endDate: "",
  current: true, description: "Built software", bullets: [], notes,
});

describe("notes-only job answers", () => {
  it("appends answers, bumps the version and timestamp, and leaves history and other content unchanged", async () => {
    let clock = new Date("2026-11-08T10:00:00Z");
    const repo = memoryCvRepo({ now: () => clock });
    const original = { ...emptyCv(), experience: [role(), role("role-2")] };
    await repo.save(original, 0);
    await repo.save(original, 1);
    await repo.snapshot("ai");
    const history = await repo.listHistory();
    const snapshot = await repo.getHistory(history[0]!.id);
    clock = new Date("2026-11-08T11:00:00Z");
    const notes = [note(1), note(2)];

    expect(await repo.addJobNotes("role-1", notes)).toEqual({ version: 3, updatedAt: clock.toISOString() });
    const saved = await repo.get();
    expect(saved.content).toEqual({ ...original, experience: [role("role-1", notes), role("role-2")] });
    expect(await repo.listHistory()).toEqual(history);
    expect(await repo.getHistory(history[0]!.id)).toEqual(snapshot);
    expect(await repo.save(original, 2)).toMatchObject({ ok: false, version: 3 });
    notes[0]!.answer = "Changed outside the repo";
    expect((await repo.get()).content).toEqual(saved.content);
  });

  it("drops the oldest job answer by askedAt while retaining all enrichment notes", async () => {
    const repo = memoryCvRepo();
    const enrichment = Array.from({ length: MAX_NOTES }, (_, i) => ({
      id: `enrichment-${i}`, question: "What did you build?", answer: `Answer ${i}`,
      via: ["type"] as Note["via"], askedAt: note(i + 1).askedAt,
    }));
    const jobs = Array.from({ length: MAX_JOB_NOTES }, (_, i) => note(i + 1)).reverse();
    await repo.save({ ...emptyCv(), experience: [role("role-1", [...enrichment, ...jobs])] }, 0);

    expect(await repo.addJobNotes("role-1", [note(26)])).toMatchObject({ version: 2 });
    const saved = await repo.get();
    const notes = saved.content.experience[0]!.notes;
    expect(notes.filter((n) => n.jobId !== undefined)).toEqual([...jobs.filter((n) => n.id !== "job-1"), note(26)]);
    expect(notes.filter((n) => n.jobId === undefined)).toEqual(enrichment);
    expect(CvContentSchema.safeParse(saved.content).success).toBe(true);
    expect(await repo.listHistory()).toEqual([]);
  });

  it("caps a batch larger than 25 and accepts volunteering roles", async () => {
    const repo = memoryCvRepo();
    await repo.save({ ...emptyCv(), volunteering: [role()] }, 0);
    const notes = Array.from({ length: MAX_JOB_NOTES + 3 }, (_, i) => note(i + 1));
    await repo.addJobNotes("role-1", notes);
    expect((await repo.get()).content.volunteering[0]!.notes).toEqual(notes.slice(3));
    expect((await repo.get()).version).toBe(2);
    expect(await repo.listHistory()).toEqual([]);
  });

  it("refuses notes that would exceed the CV byte limit and leaves the CV unchanged", async () => {
    const repo = memoryCvRepo();
    const content = {
      ...emptyCv(), experience: [role()],
      projects: Array.from({ length: 32 }, (_, i) => ({
        id: "project-" + i, name: "", description: "\u00e9".repeat(4000), url: "",
      })),
    };
    const notes = [note(1), note(2)].map((item) => ({ ...item, answer: "\u00e9".repeat(2000) }));
    const enlarged = { ...content, experience: [role("role-1", notes)] };
    expect(CvContentSchema.safeParse(content).success).toBe(true);
    expect(CvContentSchema.safeParse(enlarged).success).toBe(true);
    expect(new TextEncoder().encode(JSON.stringify({ content, version: 1 })).length).toBeLessThanOrEqual(MAX_CV_BYTES);
    expect(new TextEncoder().encode(JSON.stringify({ content: enlarged, version: 2 })).length).toBeGreaterThan(MAX_CV_BYTES);
    await repo.save(content, 0);
    const before = await repo.get();

    const result = repo.addJobNotes("role-1", notes);
    await expect(result).rejects.toMatchObject({
      status: 413, code: "content_too_large",
    });
    await expect(result).rejects.toBeInstanceOf(ApiError);
    expect(await repo.get()).toEqual(before);
  });

  it("rejects a missing role or CV and leaves another user's CV untouched", async () => {
    const repo = memoryCvRepo();
    const other = memoryCvRepo();
    await other.save({ ...emptyCv(), experience: [role()] }, 0);
    const before = await other.get();
    await expect(repo.addJobNotes("role-1", [note(1)])).rejects.toThrow("role_not_found");
    expect((await repo.get()).version).toBe(0);
    await repo.save({ ...emptyCv(), experience: [role("different-role")] }, 0);
    const saved = await repo.get();
    await expect(repo.addJobNotes("role-1", [note(1)])).rejects.toThrow("role_not_found");
    expect(await repo.get()).toEqual(saved);
    await repo.addJobNotes("different-role", [note(1)]);
    expect(await other.get()).toEqual(before);
    expect(await other.listHistory()).toEqual([]);
    expect(await repo.listHistory()).toEqual([]);
  });
});
