import { describe, expect, it } from "vitest";
import type { JobExtraction, TailorQuestion } from "@resumora/shared";
import { adLine, withWhy } from "./ad-line.ts";

const ad = [
  "Lifecycle Operations Lead: Employee Relations & Transitions",
  "Team: Employee Relations & Transitions",
  "As a Lifecycle Operations Lead: Employee Relations & Transitions, you will support the Employee Relations and Transitions team on day to day operational challenges. This includes workflow design, process improvement, tooling, automations, data management, knowledge management, and the creation and maintenance of standard operating procedures.",
  "Actively support the ER&T team with tool debugging, integration, automation, and optimization.",
  "Manage ER&T technical and automation requirements across the tool stack, including Zendesk, Kissflow, Docusign, Google Workspace, and other tools used to deliver ER&T operations.",
  "Hands on experience identifying, piloting, and scaling AI enabled workflows, including prompt based tools, knowledge retrieval, summarization, and decision support, with a strong focus on quality, privacy, and risk",
  "Ability to define AI success metrics and evaluate outcomes, such as cycle time reduction, quality improvements, and risk reduction",
  "Experience working in a startup or high-growth environment is highly desirable",
].join("\n");

describe("the ad's own words behind a question", () => {
  it("quotes the sentence that names the requirement, whole when it is short", () => {
    expect(adLine(ad, "Startup or high-growth environment")).toBe("Experience working in a startup or high-growth environment is highly desirable");
    expect(adLine(ad, "tool debugging")).toBe("Actively support the ER&T team with tool debugging, integration, automation, and optimization.");
    // Another form of a word still finds it.
    expect(adLine(ad, "Define AI success metric")).toBe("Ability to define AI success metrics and evaluate outcomes, such as cycle time reduction, quality improvements, and risk reduction");
  });

  it("cuts a long sentence to a piece around the words, at word ends", () => {
    const line = adLine(ad, "Knowledge retrieval")!;
    expect(line).toContain("knowledge retrieval, summarization, and decision support");
    expect(line.length).toBeLessThanOrEqual(172);
    expect(line.startsWith("…")).toBe(true);
    expect(ad).toContain(line.replace(/^…|…$/g, ""));
    expect(adLine(ad, "Kissflow")).toContain("including Zendesk, Kissflow, Docusign");
  });

  it("needs every word of the name, short ones too", () => {
    const text = [ad, "Strong analytical skills using data and BI tools with a special focus on operational metrics"].join("\n");
    expect(adLine(text, "BI tools")).toBe("Strong analytical skills using data and BI tools with a special focus on operational metrics");
    expect(adLine(ad, "BI tools")).toBeNull();
  });

  it("takes a real sentence over a heading that only names it", () => {
    expect(adLine(ad, "Employee Relations")).toContain("you will support the Employee Relations and Transitions team");
  });

  it("quotes nothing when the ad has no sentence with all of the words", () => {
    expect(adLine(ad, "Kubernetes")).toBeNull();
    expect(adLine(ad, "knowledge of budgets")).toBeNull();
    expect(adLine(null, "Kissflow")).toBeNull();
    expect(adLine(ad, "")).toBeNull();
  });
});

describe("why a gap question is asked", () => {
  const job = { requirements: [{ text: "Knowledge retrieval", kind: "must", category: "skill" }, { text: "Startup or high-growth environment", kind: "nice", category: "experience" }] } as Pick<JobExtraction, "requirements">;
  const question = (gap: string, over: Partial<TailorQuestion> = {}): TailorQuestion => ({
    id: gap, section: "experience", roleId: null, text: "Did you?", kind: "skill", options: [], reason: "", gap, scope: "all", skill: "x", ...over });

  it("says whether the ad needs it, wants it or only names it, with the ad's words", () => {
    expect(withWhy(question("r0"), job, ad)).toMatchObject({ need: "must", adLine: expect.stringContaining("knowledge retrieval") });
    expect(withWhy(question("r1"), job, ad)).toMatchObject({ need: "nice", adLine: "Experience working in a startup or high-growth environment is highly desirable" });
    expect(withWhy(question("k:Kissflow"), job, ad)).toMatchObject({ need: "keyword", adLine: expect.stringContaining("Kissflow") });
  });

  it("keeps the kind without a quote when the ad's text is not at hand, and leaves other questions alone", () => {
    const plain = withWhy(question("r0"), job, null);
    expect(plain.need).toBe("must");
    expect(plain).not.toHaveProperty("adLine");
    expect(withWhy(question("r9"), job, ad)).not.toHaveProperty("need");
    const own = question("r0", { scope: undefined });
    expect(withWhy(own, job, ad)).toBe(own);
  });
});
