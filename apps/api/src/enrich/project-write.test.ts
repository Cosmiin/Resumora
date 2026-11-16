import { beforeEach, describe, expect, it } from "vitest";
import { emptyCv, type CvContent, type Locale, type Project } from "@resumora/shared";
import { memoryCvRepo } from "../cv/memory-repo.ts";
import { ApiError } from "../errors.ts";
import { fakeModel, roleWith } from "./fake-model.ts";
import { memoryInsightsRepo } from "./memory-repo.ts";
import { projectWriteSystemPrompt, projectWriteUserMessage } from "./project-prompts.ts";
import { NO_FIRST_PERSON, ROMANIAN_TENSE } from "./prompts.ts";
import { projectWrite } from "./project-write.ts";

const note = (question: string, answer: string) => ({ id: `n-${question.length}-${answer.length}`, question, answer, via: ["pick" as const], askedAt: "2026-11-16T10:00:00Z" });

const project = (over: Partial<Project> = {}): Project => ({
  ...roleWith([], { title: "Lead intake flow", company: "Personal project", description: "", current: false, endDate: "2025-06" }),
  url: "",
  notes: [
    note("Which tools did you use?", "Make, Airtable, webhooks"),
    note("Is it used?", "Saves about 3 hours a week"),
  ],
  ...over,
});

let cv: ReturnType<typeof memoryCvRepo>;
let answers: unknown[];
let model: ReturnType<typeof fakeModel>;

async function save(p: Project, over: Partial<CvContent> = {}, locale: Locale = "en") {
  await cv.save({ ...emptyCv(locale), projects: [p], ...over }, (await cv.get()).version);
}
const write = (p: Project, questionLanguage?: Locale) =>
  projectWrite({ cv, insights: memoryInsightsRepo("user-1"), model: model.deps, userId: "user-1", questionLanguage }, { projectId: p.id });

beforeEach(() => {
  cv = memoryCvRepo();
  answers = [];
  model = fakeModel(() => answers.shift() ?? { description: "", bullets: [], extraTools: [] });
});

describe("project writer prompt", () => {
  it("asks for one sentence, at most two bullets, leading with what's new, with the Romanian and no-first-person rules", () => {
    const sys = projectWriteSystemPrompt("en");
    expect(sys).toContain("one sentence");
    expect(sys).toContain("at most two");
    expect(sys).toContain("Lead with");
    expect(sys).toContain(ROMANIAN_TENSE);
    expect(sys).toContain(NO_FIRST_PERSON);
    expect(sys).toContain("Return only JSON");
  });

  it("a Romanian CV read in English: the lines are written in Romanian (review focus 5)", () => {
    expect(projectWriteSystemPrompt("ro")).toContain("in the CV content language (Romanian)");
  });

  it("the user message holds the project and its answers, the rest of the CV as context only, and says to lead with what the jobs don't show", () => {
    const p = project();
    const msg = projectWriteUserMessage(p, { ...emptyCv("en"), experience: [roleWith(["Ran payroll in SAP."])], projects: [p] });
    expect(msg).toContain("Make, Airtable, webhooks");
    expect(msg).toContain("Context only, never a source of facts");
    expect(msg).toContain("Ran payroll in SAP.");
    expect(msg).toContain("Lead with what the jobs and Skills above don't show");
    expect(msg).toContain("ended");
  });
});

describe("projectWrite", () => {
  it("keeps confirmed lines, on the cheap tier, logged as project_write", async () => {
    const p = project();
    await save(p);
    answers.push({ description: "A Make flow that files new bakery leads into Airtable.", bullets: ["Built the flow in Make with webhooks and Airtable, saving 3 hours a week."], extraTools: [] });
    expect(await write(p)).toEqual({ description: "A Make flow that files new bakery leads into Airtable.", bullets: ["Built the flow in Make with webhooks and Airtable, saving 3 hours a week."], extraTools: [] });
    // An ended project whose description names the thing ("A Make flow…") and whose bullets are past: no retry.
    expect(model.logged.map((l) => l.task)).toEqual(["project_write"]);
  });

  it("drops a bullet with a tool or a number no source has, and empties such a description", async () => {
    const p = project();
    await save(p, { technicalSkills: [{ id: "s1", name: "Kubernetes" }] });
    answers.push({
      description: "A Make flow on Kubernetes for bakery leads.",
      bullets: ["Deployed the flow on Kubernetes.", "Cut manual entry by 4 hours a month.", "Connected Make to Airtable with webhooks."],
      extraTools: [],
    });
    expect(await write(p)).toEqual({ description: "", bullets: ["Connected Make to Airtable with webhooks."], extraTools: [] });
  });

  it("cuts to two bullets and one sentence", async () => {
    const p = project();
    await save(p);
    answers.push({
      description: "A Make flow for bakery leads. It files them into Airtable.",
      bullets: ["Built the flow in Make.", "Connected Airtable with webhooks.", "Set up the Airtable base."],
      extraTools: [],
    });
    const out = await write(p);
    expect(out.description).toBe("A Make flow for bakery leads.");
    expect(out.bullets).toEqual(["Built the flow in Make.", "Connected Airtable with webhooks."]);
  });

  it("keeps an extra tool only when a source has it, it is not on the page and not in Skills (review focus 4)", async () => {
    const p = project({ notes: [note("Which tools did you use?", "Make, Zapier, Airtable, webhooks")] });
    await save(p, { professionalSkills: [{ id: "s1", name: "ZAPIER" }] });
    answers.push({ description: "A Make flow for bakery leads.", bullets: ["Built the flow in Make with webhooks."], extraTools: ["Make", "zapier", "Notion", "Airtable", "airtable"] });
    expect((await write(p)).extraTools).toEqual(["Airtable"]);
  });

  it("the plan's case: Zapier in technical skills, Make in a bullet, Notion in no source → none", async () => {
    const p = project({ notes: [note("Which tools did you use?", "Make, Zapier, webhooks")] });
    await save(p, { technicalSkills: [{ id: "s1", name: "Zapier" }] });
    answers.push({ description: "", bullets: ["Built the flow in Make with webhooks."], extraTools: ["Make", "zapier", "Notion"] });
    expect((await write(p)).extraTools).toEqual([]);
  });

  it("a project with only a name and no answers, model returns nothing → nothing (review focus 3)", async () => {
    const p = project({ notes: [] });
    await save(p);
    expect(await write(p)).toEqual({ description: "", bullets: [], extraTools: [] });
  });

  it("an unknown project id is a 409", async () => {
    await save(project());
    const err = await projectWrite({ cv, insights: memoryInsightsRepo("user-1"), model: model.deps, userId: "user-1" }, { projectId: "nope" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 409, code: "not_saved" });
    expect(model.requests).toHaveLength(0);
  });
});

describe("projectWrite tense (review focus 1)", () => {
  const ro = (over: Partial<Project>) => project({ notes: [note("Ce unelte ai folosit?", "Make, Airtable")], ...over });
  const present = { description: "", bullets: ["Construiesc fluxul în Make."], extraTools: [] };
  const past = { description: "", bullets: ["Am construit fluxul în Make."], extraTools: [] };

  it("an ended Romanian project in the present is retried once with the Romanian note", async () => {
    const p = ro({});
    await save(p, {}, "ro");
    answers.push(present, past);
    expect((await write(p, "en")).bullets).toEqual(["Am construit fluxul în Make."]);
    expect(model.requests).toHaveLength(2);
    expect(JSON.stringify(model.requests[1])).toContain("Am");
    expect(JSON.stringify(model.requests[1])).toContain("past participle");
  });

  it("a line still in the present after the retry is dropped", async () => {
    const p = ro({});
    await save(p, {}, "ro");
    answers.push(present, present);
    expect((await write(p)).bullets).toEqual([]);
    expect(model.requests).toHaveLength(2);
  });

  it("a current project, or one with no end date, is not retried", async () => {
    for (const over of [{ current: true, endDate: "" }, { current: false, endDate: "" }]) {
      model = fakeModel(() => present);
      const p = ro(over);
      await save(p, {}, "ro");
      expect((await write(p)).bullets).toEqual(["Construiesc fluxul în Make."]);
      expect(model.requests).toHaveLength(1);
    }
  });
});
