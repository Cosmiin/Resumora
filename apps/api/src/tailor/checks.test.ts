import { describe, expect, it } from "vitest";
import { emptyCv, type JobExtraction, type Proposal } from "@resumora/shared";
import { checkProposal, type CheckContext } from "./checks.ts";
import { fakeModel, roleWith } from "../enrich/fake-model.ts";
import { memoryTailorRepo } from "./memory-repo.ts";
import { passProposals } from "./section-pass.ts";

const ctx: CheckContext = {
  sources: ["Ran payroll for 40 staff at Acme Payroll", "Used Docker and PostgreSQL daily", "Answer: I led four people"],
  original: { company: "Acme Payroll", title: "Payroll Specialist", startDate: "2020-01", endDate: "2022-01" },
};
const proposal = (text: string, over: Partial<Proposal> = {}): Proposal =>
  ({ itemId: "b1", field: "text", text, inferred: false, flags: [], ...over });
const rules = (p: Proposal) => checkProposal(p, ctx).map((flag) => flag.rule);

describe("checkProposal", () => {
  it.each(["text", "description"])("flags present tense in a past role's %s only for English", (field) => {
    const p = proposal("Coordinate partner onboarding", { field });
    expect(checkProposal(p, { sources: [], pastRole: true, locale: "en" })).toEqual([
      { rule: "tense", detail: "The role has ended: start with a past-tense verb." },
    ]);
    expect(checkProposal(p, { sources: [], pastRole: false, locale: "en" })).toEqual([]);
    expect(checkProposal(p, { sources: [], pastRole: true, locale: "ro" })).toEqual([]);
    expect(checkProposal(proposal("Coordinated partner onboarding", { field }), { sources: [], pastRole: true, locale: "en" })).toEqual([]);
  });

  it("keeps sources-only checks unchanged when locale and role context are absent", () => {
    expect(checkProposal(proposal("Coordinate partner onboarding"), { sources: [] })).toEqual([]);
    expect(checkProposal(proposal("Coordinate onboarding for 99 partners"), { sources: [] })).toEqual([
      { rule: "number", detail: "A number that isn't in your CV, notes or answers" },
    ]);
  });

  it("does not tense-check other fields or a past role without an output language", () => {
    expect(checkProposal(proposal("Coordinate onboarding", { field: "summary" }), { sources: [], pastRole: true, locale: "en" })).toEqual([]);
    expect(checkProposal(proposal("Coordinate onboarding"), { sources: [], pastRole: true })).toEqual([]);
  });

  it("flags an invented number and passes a known one", () => {
    expect(rules(proposal("Cut payroll errors by 30% for 40 staff"))).toEqual(["number"]);
    expect(rules(proposal("Ran payroll for 40 staff using Docker"))).toEqual([]);
  });

  it("flags a changed employer, title or date and passes an unchanged one", () => {
    expect(rules(proposal("Acme Payments", { itemId: "role", field: "company" }))).toEqual(["entity"]);
    expect(rules(proposal("Senior Payroll Specialist", { itemId: "role", field: "title" }))).toEqual(["entity"]);
    expect(rules(proposal("2019-06", { itemId: "role", field: "startDate" }))).toEqual(["entity"]);
    expect(rules(proposal("Acme Payroll", { itemId: "role", field: "company" }))).toEqual([]);
  });

  it("flags a tool that is not in the sources, whether or not it is marked inferred", () => {
    expect(rules(proposal("Deployed the payroll service on Kubernetes"))).toEqual(["tool"]);
    expect(checkProposal(proposal("Deployed the payroll service on Kubernetes"), ctx)[0]?.detail).toContain("Kubernetes");
    expect(rules(proposal("Deployed the payroll service on Kubernetes", { inferred: true, reason: "Ran payroll" }))).toEqual(["tool"]);
    expect(rules(proposal("Built Power BI reports for staff", { inferred: true, reason: "Ran payroll" }))).toEqual(["tool"]);
    expect(rules(proposal("Moved payroll data to PostgreSQL with Docker"))).toEqual([]);
    expect(rules(proposal("Ran AWS Lambda jobs for payroll"))).toEqual(["tool"]);
  });

  it("does not treat the first word of a sentence as a tool", () => {
    expect(rules(proposal("Streamlined payroll. Reduced manual steps for staff."))).toEqual([]);
  });

  it("flags a one-word skill name that isn't in the sources", () => {
    expect(rules(proposal("Kubernetes", { itemId: "new-skill", field: "name" }))).toEqual(["tool"]);
    expect(rules(proposal("Kubernetes", { itemId: "new-skill", field: "name", inferred: true, reason: "Used Docker" }))).toEqual(["tool"]);
    expect(rules(proposal("Docker", { itemId: "s1", field: "name" }))).toEqual([]);
  });

  it("flags a guess without a reason that names its basis", () => {
    expect(rules(proposal("Led payroll for staff", { inferred: true }))).toEqual(["guess"]);
    expect(rules(proposal("Led payroll for staff", { inferred: true, reason: "  " }))).toEqual(["guess"]);
    expect(rules(proposal("Led payroll for staff", { inferred: true, reason: "Answer: I led four people" }))).toEqual([]);
    expect(rules(proposal("Led payroll for staff"))).toEqual([]);
  });

  it("does not flag abbreviations or ordinals as tools", () => {
    expect(rules(proposal("Ran payroll, e.g. for staff, i.e. monthly, as the 1st and 3rd step"))).not.toContain("tool");
  });
});

const job: JobExtraction = {
  title: "Partner Coordinator", company: "Cedar", location: null, workMode: "remote", employmentType: "full_time",
  seniority: "mid", salary: null, isJobPosting: true, applyBy: null, benefits: [],
  summary: "Coordinate partner onboarding.", requirements: [], responsibilities: ["Partner onboarding"],
};

describe.each([
  { section: "experience", list: "experience" },
  { section: "projects", list: "projects" },
  { section: "projects", list: "volunteering" },
] as const)("past tense in the $list section pass", ({ section, list }) => {
  it.each([
    { locale: "ro", language: "en", current: false, endDate: "2022-01", tense: true },
    { locale: "en", language: "ro", current: false, endDate: "2022-01", tense: false },
    { locale: "en", language: "en", current: true, endDate: "2022-01", tense: false },
    { locale: "en", language: "en", current: false, endDate: "", tense: false },
  ] as const)("uses output language and role dates: %j", async ({ locale, language, current, endDate, tense }) => {
    const role = roleWith(["Coordinated partner onboarding"], { current, endDate });
    const cv = { ...emptyCv(locale), [list]: [role] };
    const tailor = memoryTailorRepo("user-a");
    const tailoredCvId = await tailor.createTailoredCv({
      jobId: "job-a", language, content: cv, baseSnapshotAt: "2026-11-10T10:00:00Z",
      tone: "neutral", instruction: null, steering: {},
    });
    const run = await tailor.createRun({
      jobId: "job-a", tailoredCvId, kind: "tailor", sections: [section], currentSection: section, currentRoleId: role.id,
    });
    const proposals = [
      { itemId: role.bullets[0]!.id, field: "text" }, { itemId: role.id, field: "description" },
    ].map((target) => ({ ...target, text: "Coordinate partner onboarding", inferred: false, reason: null, guesses: null }));
    const replies = [{ proposals }, { results: [] }, { proposals }, { results: [] }];
    const model = fakeModel(() => replies.shift());
    const result = await passProposals({ model: model.deps, tailor }, { userId: "user-a", run, job, cv, section, roleId: role.id });
    expect(result.removed).toBe(tense ? 2 : 0);
    expect(result.proposals).toHaveLength(tense ? 0 : 2);
    expect(model.requests).toHaveLength(tense ? 4 : 2);
    if (tense) {
      const messages = model.requests[2]!.messages as { role: string; content: string }[];
      const retry = JSON.parse(messages[1]!.content);
      expect(retry.fix.proposals).toHaveLength(2);
      for (const p of retry.fix.proposals) expect(p.flags).toEqual([
        { rule: "tense", detail: "The role has ended: start with a past-tense verb." },
      ]);
    }
  });
});
