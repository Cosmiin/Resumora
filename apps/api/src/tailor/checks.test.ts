import { describe, expect, it } from "vitest";
import type { Proposal } from "@resumora/shared";
import { checkProposal, type CheckContext } from "./checks.ts";

const ctx: CheckContext = {
  sources: ["Ran payroll for 40 staff at Acme Payroll", "Used Docker and PostgreSQL daily", "Answer: I led four people"],
  original: { company: "Acme Payroll", title: "Payroll Specialist", startDate: "2020-01", endDate: "2022-01" },
};
const proposal = (text: string, over: Partial<Proposal> = {}): Proposal =>
  ({ itemId: "b1", field: "text", text, inferred: false, flags: [], ...over });
const rules = (p: Proposal) => checkProposal(p, ctx).map((flag) => flag.rule);

describe("checkProposal", () => {
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

  it("flags an untagged tool that is not in the sources and passes it when tagged inferred", () => {
    expect(rules(proposal("Deployed the payroll service on Kubernetes"))).toEqual(["tool"]);
    expect(checkProposal(proposal("Deployed the payroll service on Kubernetes"), ctx)[0]?.detail).toContain("Kubernetes");
    expect(rules(proposal("Deployed the payroll service on Kubernetes", { inferred: true }))).toEqual([]);
    expect(rules(proposal("Moved payroll data to PostgreSQL with Docker"))).toEqual([]);
    expect(rules(proposal("Ran AWS Lambda jobs for payroll"))).toEqual(["tool"]);
  });

  it("does not treat the first word of a sentence as a tool", () => {
    expect(rules(proposal("Streamlined payroll. Reduced manual steps for staff."))).toEqual([]);
  });

  it("flags an untagged one-word skill name that isn't in the sources", () => {
    expect(rules(proposal("Kubernetes", { itemId: "new-skill", field: "name" }))).toEqual(["tool"]);
    expect(rules(proposal("Docker", { itemId: "s1", field: "name" }))).toEqual([]);
  });

  it("does not flag abbreviations or ordinals as tools", () => {
    expect(rules(proposal("Ran payroll, e.g. for staff, i.e. monthly, as the 1st and 3rd step"))).not.toContain("tool");
  });
});
