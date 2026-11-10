import { describe, expect, it } from "vitest";
import { emptyCv } from "@resumora/shared";
import { restoreHeader, stripHeader } from "./strip-header.ts";
import { roleWith } from "../enrich/fake-model.ts";
import { achievementsSystemPrompt } from "../enrich/achievements.ts";
import { skillsSystemPrompt } from "../enrich/skills-prompts.ts";
import { rewriteSummarySystemPrompt } from "../enrich/rewrite-prompts.ts";
import { questionSystemPrompt } from "./question-prompts.ts";
import { sectionSystemPrompt } from "./section-prompts.ts";
import { layoutSystemPrompt } from "./layout-pass.ts";
import { letterSystemPrompt } from "./letter-prompts.ts";

describe("CV header", () => {
  it("adds each role's period to every note only in the AI copy", () => {
    const notes = [
      { id: "n1", question: "What changed?", answer: "Reduced missed deliveries.", via: ["type" as const], askedAt: "2026-11-01T10:00:00Z" },
      { id: "n2", question: "Which tools?", answer: "Used a dispatch board.", via: ["pick" as const], askedAt: "2026-11-02T10:00:00Z", jobId: "00000000-0000-4000-8000-000000000001" },
    ];
    const past = roleWith([], { startDate: "2014-10", endDate: "2015-07", current: false, notes });
    const current = roleWith([], { startDate: "2022-12", endDate: "", current: true, notes });
    const undated = roleWith([], { startDate: "", notes });
    const original = { ...emptyCv(), experience: [past, current, undated],
      projects: [{ ...past, id: "p1", url: "" }], volunteering: [{ ...current, id: "v1" }] };
    const before = structuredClone(original);
    const { cv } = stripHeader(original);
    for (const item of [cv.experience[0]!, cv.projects[0]!]) {
      expect(item.notes).toEqual(notes.map((note) => ({ ...note, period: "2014-10 – 2015-07" })));
    }
    for (const item of [cv.experience[1]!, cv.volunteering[0]!]) {
      expect(item.notes).toEqual(notes.map((note) => ({ ...note, period: "2022-12 – present" })));
    }
    expect(cv.experience[2]!.notes).toEqual(notes);
    expect(original).toEqual(before);
  });

  it("removes contact details and names while preserving titles, summary and content", () => {
    const original = emptyCv();
    original.basics = {
      fullName: "Ada Lovelace", firstName: "Ada", lastName: "Lovelace",
      email: "ada@example.test", phone: "+40 123456789", location: "Private address",
      website: "https://ada.example.test", linkedin: "https://linkedin.com/in/ada",
      titles: ["Software Engineer"], summary: "Builds useful software.",
    };
    const before = structuredClone(original);
    const { cv, header } = stripHeader(original);
    expect(cv.basics).toEqual({
      fullName: "", firstName: "", lastName: "", email: "", phone: "", location: "",
      website: "", linkedin: "", titles: ["Software Engineer"], summary: "Builds useful software.",
    });
    expect(header).toEqual(before.basics);
    expect(original).toEqual(before);
    expect(restoreHeader(cv, header)).toEqual(before);

    cv.basics.titles = ["Senior Software Engineer"];
    cv.basics.summary = "Updated summary.";
    const restored = restoreHeader(cv, header);
    expect(restored.basics).toEqual({ ...header, titles: ["Senior Software Engineer"], summary: "Updated summary." });
    expect(cv.basics.fullName).toBe("");
    expect(original).toEqual(before);
  });

  it("never passes the photo to the AI copy, and restores it afterwards", () => {
    const original = emptyCv();
    original.basics.photo = { path: "user-1/photo.jpg", x: 50, y: 40, zoom: 1.5 };
    const before = structuredClone(original);
    const { cv, header } = stripHeader(original);
    expect("photo" in cv.basics).toBe(false);
    expect(JSON.stringify(cv)).not.toContain("user-1/photo.jpg");
    expect(restoreHeader(cv, header).basics.photo).toEqual(before.basics.photo);
    expect(original).toEqual(before);
  });
});

describe("note period instructions", () => {
  it.each([
    ["tailor questions", questionSystemPrompt],
    ["tailor section", sectionSystemPrompt("experience")],
    ["tailor layout", layoutSystemPrompt],
    ["tailor letter", letterSystemPrompt],
    ["enrich achievements", achievementsSystemPrompt("en")],
    ["enrich skills", skillsSystemPrompt("en")],
    ["enrich summary rewrite", rewriteSummarySystemPrompt("en")],
  ])("explains the note's period in %s", (_name, prompt) => {
    expect(prompt.split("\n")).toContain("A note describes the person during its role's period, not today.");
  });
});
