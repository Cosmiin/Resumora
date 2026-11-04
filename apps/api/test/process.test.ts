import { describe, expect, it } from "vitest";
import { emptyDraft, type Admit, type ImportDraft } from "@resumora/shared";
import type { ModelDeps } from "../src/ai/call-model.ts";
import { ImportFailure } from "../src/imports/extract-text.ts";
import { admitPrompt, extractPrompt } from "../src/imports/prompts.ts";
import { processImport } from "../src/imports/process.ts";
import { CV_LINES, makeDocx, makePdf } from "./fixtures.ts";

type Answers = { cv_admit?: Admit; cv_extract?: ImportDraft; down?: boolean; cutExtract?: boolean; rejectPdf?: boolean };
type Part = { type: string; text?: string; file?: { filename: string } };

/** A fake model that answers per task (the json_schema name) and records what it was sent. */
function fakeModel(answers: Answers) {
  const sent: { task: string; system: string; user: string | Part[] }[] = [];
  const fetch = (async (_url: RequestInfo | URL, init?: RequestInit) => {
    if (answers.down) return new Response("{}", { status: 500 });
    const body = JSON.parse(String(init?.body)) as {
      response_format: { json_schema: { name: keyof Answers } };
      messages: { content: string | Part[] }[];
    };
    const task = body.response_format.json_schema.name;
    sent.push({ task, system: String(body.messages[0]!.content), user: body.messages[1]!.content });
    const userContent = body.messages[1]!.content;
    if (answers.rejectPdf && Array.isArray(userContent) && userContent.some((p) => p.type === "file")) {
      return new Response("This file type is not supported", { status: 400 });
    }
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
    expect(sent[1]!.user as string).toMatch(/^<document>\n[\s\S]*Ana Popescu[\s\S]*\n<\/document>$/);
    expect(sent.every((s) => !s.system.includes("user-1") && !JSON.stringify(s.user).includes("user-1"))).toBe(true);
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

  it("keeps the owner's rules from the old app", () => {
    for (const rule of [
      "cultural assumptions",
      "infer a URL from the email",
      "employer website",
      "Keep an absent summary absent",
      "Preserve all certifications",
      "Uncertainty must never mean leaving it out",
      "Do not invent missing names, dates, employers, metrics, tools, qualifications or confirmations",
      "workforce management",
      "Experience prose is the main evidence",
    ]) {
      expect(extractPrompt).toContain(rule);
    }
    // Import keeps the CV's own wording; normalizing skill names is a later, separate step.
    expect(extractPrompt).not.toMatch(/merge synonyms/i);
  });
});

describe("processImport with a PDF", () => {
  const cvPdf = () => makePdf(CV_LINES);
  const pdfInput = (bytes: Uint8Array) => ({ userId: "user-1", bytes, format: "pdf" as const });
  const parts = (user: string | Part[] | undefined) => (Array.isArray(user) ? user : []);

  it("a PDF is sent to the model as a file", async () => {
    const { model, sent } = fakeModel({ cv_admit: { kind: "cv", reason: "A CV" }, cv_extract: organized });
    const result = await processImport({ model }, pdfInput(cvPdf()));

    const extract = sent.find((s) => s.task === "cv_extract")!;
    expect(parts(extract.user).map((p) => p.type)).toEqual(["text", "file"]);
    expect(parts(extract.user)[0]!.text).toBe("Organize this CV.");
    expect(parts(extract.user)[1]!.file!.filename).toBe("cv.pdf");
    // The admit step stays on text.
    expect(typeof sent.find((s) => s.task === "cv_admit")!.user).toBe("string");
    expect(result.isScan).toBe(false);
    expect(result.warnings).toEqual([]);
  });

  it("a DOCX is sent as text", async () => {
    const { model, sent } = fakeModel({ cv_admit: { kind: "cv", reason: "A CV" }, cv_extract: organized });
    await processImport({ model }, await input());
    const extract = sent.find((s) => s.task === "cv_extract")!;
    expect(typeof extract.user).toBe("string");
    expect(extract.user as string).toMatch(/^<document>/);
  });

  it("a rejected PDF part falls back to text with a warning", async () => {
    const { model, sent } = fakeModel({ cv_admit: { kind: "cv", reason: "A CV" }, cv_extract: organized, rejectPdf: true });
    const result = await processImport({ model }, pdfInput(cvPdf()));

    const extracts = sent.filter((s) => s.task === "cv_extract");
    expect(extracts).toHaveLength(2);
    expect(typeof extracts[1]!.user).toBe("string");
    expect(extracts[1]!.user as string).toMatch(/^<document>/);
    expect(result.warnings).toContain("We read this file as plain text, so text from different columns may be mixed. Check the result.");
  });

  it("a scan is admitted from the file and carries the scan warning", async () => {
    const { model, sent } = fakeModel({ cv_admit: { kind: "cv", reason: "A CV" }, cv_extract: organized });
    const result = await processImport({ model }, pdfInput(makePdf([])));

    expect(parts(sent[0]!.user).map((p) => p.type)).toEqual(["text", "file"]);
    expect(parts(sent[1]!.user).map((p) => p.type)).toEqual(["text", "file"]);
    expect(result.isScan).toBe(true);
    expect(result.warnings).toContain("This file is a scan. Check every line.");
    expect(result.unsourcedLines).toEqual([]);
  });

  it("a scan whose file the model rejects is ai_unavailable", async () => {
    const { model } = fakeModel({ cv_admit: { kind: "cv", reason: "" }, rejectPdf: true });
    expect(await failureCode(processImport({ model }, pdfInput(makePdf([]))))).toBe("ai_unavailable");
  });
});
