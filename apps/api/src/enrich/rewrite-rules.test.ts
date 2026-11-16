import { describe, expect, it } from "vitest";
import { brainDumpSystemPrompt, improveBulletSystemPrompt } from "./focus-prompts.ts";
import { roleDescriptionSystemPrompt } from "./role-description.ts";
import { rewriteSummarySystemPrompt } from "./rewrite-prompts.ts";
import { ROMANIAN_TENSE } from "./prompts.ts";
import { sectionSystemPrompt } from "../tailor/section-prompts.ts";

// The rules of enrichment flow B: facts add words, not lines; tools sit in the bullet where they were used; two lines at most.
describe("rewrite rules", () => {
  it("a bullet's rewrite adds a known fact as a few words, names a tool where it was used, and stays one sentence", () => {
    const system = improveBulletSystemPrompt("en");
    expect(system).toContain("adds a few words to it. It never becomes a second sentence or a new line.");
    expect(system).toContain("name it inside the bullet, where it was used");
    expect(system).toContain("Never append a list of tools.");
    expect(system).toContain("Leave out a fact that belongs to another bullet or to the role as a whole");
    expect(system).toContain("Keep the bullet to one sentence, at most 2 lines and 220 characters.");
  });

  it("new bullets from answers never repeat a fact that only adds to an existing bullet", () => {
    const system = brainDumpSystemPrompt("en");
    expect(system).toContain("A fact that only adds to an existing bullet (its tool, its team size, its scale) is not a new bullet: leave it out.");
    expect(system).toContain("Name a tool inside the bullet where it was used, never as a list of tools on its own.");
    expect(system).toContain("Keep each bullet to one sentence, at most 2 lines and 220 characters.");
  });

  it("every prompt that writes a role's lines gives the same Romanian tense rule, and allows \"Am …\"", () => {
    const prompts = [
      improveBulletSystemPrompt("ro"), brainDumpSystemPrompt("ro"), rewriteSummarySystemPrompt("ro"),
      sectionSystemPrompt("experience"), sectionSystemPrompt("projects"),
    ];
    for (const system of prompts) {
      expect(system).toContain(ROMANIAN_TENSE);
      expect(system).not.toContain("never with \"Am …\"");
      expect(system).not.toMatch(/^- No first person\.$/m);
    }
    expect(ROMANIAN_TENSE).toContain("\"Am coordonat");
    expect(ROMANIAN_TENSE).toContain("\"Coordonez");
  });

  it("the streamed rewrites and the role's description carry the same limits", () => {
    expect(rewriteSummarySystemPrompt("en")).toContain("A known fact adds a few words to the bullet it belongs to, never a new line.");
    expect(roleDescriptionSystemPrompt("en")).toContain("together they fit on two lines of a CV");
  });
});
