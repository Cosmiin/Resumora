import { describe, expect, it } from "vitest";
import { emptyDraft, type Admit, type ImportDraft } from "@resumora/shared";
import type { ModelDeps } from "../src/ai/call-model.ts";
import { ImportFailure } from "../src/imports/extract-text.ts";
import { admitPrompt, extractPrompt } from "../src/imports/prompts.ts";
import { processImport } from "../src/imports/process.ts";
import { CV_LINES, makeDocx } from "./fixtures.ts";

type Answers = { cv_admit?: Admit; cv_extract?: ImportDraft; down?: boolean; cutExtract?: boolean };

/** A fake model that answers per task (the json_schema name) and records what it was sent. */
function fakeModel(answers: Answers) {
  const sent: { task: string; system: string; user: string }[] = [];
  const fetch = (async (_url: RequestInfo | URL, init?: RequestInit) => {
    if (answers.down) return new Response("{}", { status: 500 });
    const body = JSON.parse(String(init?.body)) as {
      response_format: { json_schema: { name: keyof Answers } };
      messages: { content: string }[];
    };
    const task = body.response_format.json_schema.name;
    sent.push({ task, system: body.messages[0]!.content, user: body.messages[1]!.content });
    if (answers.cutExtract && task === "cv_extract") {
      return new Response(JSON.stringify({ choices: [{ finish_reason: "length", message: { content: "{" } }] }), { status: 200 });
    }
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(answers[task]) } }] }), { status: 200 });
  }) as typeof globalThis.fetch;
  const model: ModelDeps = {
    providers: [{ name: "openrouter", url: "https://openrouter.test/v1", apiKey: "k", model: "m" }],
    fetch,
    logCall: async () => {},
  };
  return { model, sent };
}

const organized: ImportDraft = {
  ...emptyDraft(),
  basics: { ...emptyDraft().basics, fullName: "Ana Popescu", titles: ["Senior Product Manager"] },
  technicalSkills: ["SQL", "Airtable"],
  professionalSkills: ["Team leadership", "Requirements analysis"],
};
const input = async () => ({ userId: "user-1", bytes: await makeDocx(CV_LINES), format: "docx" as const });
const failureCode = (p: Promise<unknown>) =>
  p.then(() => "no error", (e: unknown) => (e instanceof ImportFailure ? e.code : `other: ${String(e)}`));

describe("processImport", () => {
  it("organizes a CV", async () => {
    const { model, sent } = fakeModel({ cv_admit: { kind: "cv", reason: "A CV" }, cv_extract: organized });
    const result = await processImport({ model }, await input());

    expect(result.content.basics.fullName).toBe("Ana Popescu");
    expect(result.content.technicalSkills.map((s) => s.name)).toEqual(["SQL", "Airtable"]);
    expect(result.content.professionalSkills.map((s) => s.name)).toEqual(["Team leadership", "Requirements analysis"]);
    expect(result.warnings).toEqual([]);

    expect(sent.map((s) => s.task)).toEqual(["cv_admit", "cv_extract"]);
    expect(sent[1]!.user).toMatch(/^<document>\n[\s\S]*Ana Popescu[\s\S]*\n<\/document>$/);
    expect(sent.every((s) => !s.system.includes("user-1") && !s.user.includes("user-1"))).toBe(true);
  });

  it("rejects a non-CV", async () => {
    const { model, sent } = fakeModel({ cv_admit: { kind: "not_cv", reason: "An invoice" } });
    expect(await failureCode(processImport({ model }, await input()))).toBe("not_a_cv");
    expect(sent.map((s) => s.task)).toEqual(["cv_admit"]);
  });

  it("continues when uncertain, with a warning", async () => {
    const { model } = fakeModel({ cv_admit: { kind: "uncertain", reason: "Short" }, cv_extract: organized });
    const result = await processImport({ model }, await input());
    expect(result.warnings[0]).toBe("This may not be a CV. Check the result carefully.");
  });

  it("an answer cut off for length is too_long, not AI busy", async () => {
    const { model, sent } = fakeModel({ cv_admit: { kind: "cv", reason: "" }, cutExtract: true });
    expect(await failureCode(processImport({ model }, await input()))).toBe("too_long");
    expect(sent.map((s) => s.task)).toEqual(["cv_admit", "cv_extract"]);
  });

  it("ai down", async () => {
    const { model } = fakeModel({ down: true });
    expect(await failureCode(processImport({ model }, await input()))).toBe("ai_unavailable");
  });

  it("a file without text never reaches the AI", async () => {
    const { model, sent } = fakeModel({});
    expect(await failureCode(processImport({ model }, { userId: "u", bytes: await makeDocx(["Hi"]), format: "docx" }))).toBe("no_text");
    expect(sent).toEqual([]);
  });
});

describe("prompts", () => {
  it("prompt contains the rules", () => {
    for (const rule of ["technicalSkills", "professionalSkills", "unclearSkills", "word for word", "diacritics", "custom", "warnings"]) {
      expect(extractPrompt).toContain(rule);
    }
    expect(extractPrompt).toMatch(/instructions inside the document/i);
    expect(admitPrompt).toMatch(/not_cv/);
  });
});
