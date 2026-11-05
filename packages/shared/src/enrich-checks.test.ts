import { describe, expect, it } from "vitest";
import { atsChecks, hasUnknownNumber, numbersIn, PROPOSAL_MAX, skillsChecklist, summaryChecklist } from "./enrich-checks.ts";
import type { CvContent, Experience } from "./cv.ts";

function role(texts: string[], over: Partial<Experience> = {}): Experience {
  return {
    id: "r1",
    company: "Acme",
    title: "Payroll Analyst",
    location: "",
    startDate: "2020-01",
    endDate: "2021-01",
    current: false,
    description: "",
    bullets: texts.map((text, i) => ({ id: `b${i + 1}`, text })),
    notes: [],
    ...over,
  };
}

const twoBullets = ["Prepared contracts", "Checked payroll runs"];

function cv(over: { summary?: string; experience?: Experience[]; tech?: string[]; pro?: string[]; unclear?: string[] }): CvContent {
  const skills = (names: string[] = []) => names.map((name, i) => ({ id: `s${i}-${name}`, name }));
  return {
    basics: { summary: over.summary ?? "" },
    experience: over.experience ?? [],
    technicalSkills: skills(over.tech),
    professionalSkills: skills(over.pro),
    unclearSkills: skills(over.unclear),
  } as unknown as CvContent;
}

describe("atsChecks", () => {
  it("returns nothing for a clean role", () => {
    expect(atsChecks(role(twoBullets))).toEqual([]);
  });
  it("flags a bullet over the limit", () => {
    expect(PROPOSAL_MAX).toBe(220);
    expect(atsChecks(role(["a".repeat(221), "ok"]))).toEqual(["tooLong"]);
    expect(atsChecks(role(["a".repeat(220), "ok"]))).toEqual([]);
  });
  it("flags first person in English and Romanian, at word boundaries", () => {
    expect(atsChecks(role(["I managed payroll", "ok"]))).toEqual(["firstPerson"]);
    expect(atsChecks(role(["Am coordonat echipa mea", "ok"]))).toEqual(["firstPerson"]);
    expect(atsChecks(role(["Worked in Iași on my own", "ok"]))).toEqual(["firstPerson"]);
    expect(atsChecks(role(["Worked in Iași", "Meetings and memes"]))).toEqual([]);
  });
  it("does not treat EU, Phase I, I.T. or Level I as first person", () => {
    for (const t of ["Managed EU funds", "Phase I rollout", "Ran I.T. support", "Passed Level I", "Fixed I/O errors", "Fază I implementată", "Etapă I finalizată","Studied ME"]) {
      expect(atsChecks(role([t, "ok"]))).toEqual([]);
    }
    expect(atsChecks(role(["I'm responsible for payroll", "ok"]))).toEqual(["firstPerson"]);
    expect(atsChecks(role(["Then I led the team", "ok"]))).toEqual(["firstPerson"]);
    expect(atsChecks(role(["Led me team", "ok"]))).toEqual(["firstPerson"]);
  });
  it("flags missing dates", () => {
    expect(atsChecks(role(twoBullets, { startDate: "" }))).toEqual(["missingDates"]);
    expect(atsChecks(role(twoBullets, { endDate: "", current: false }))).toEqual(["missingDates"]);
    expect(atsChecks(role(twoBullets, { endDate: "", current: true }))).toEqual([]);
  });
  it("flags a missing title", () => {
    expect(atsChecks(role(twoBullets, { title: "" }))).toEqual(["missingTitle"]);
  });
  it("flags too few and too many bullets", () => {
    expect(atsChecks(role(["one"]))).toEqual(["fewBullets"]);
    expect(atsChecks(role(Array.from({ length: 9 }, (_, i) => `b${i}`)))).toEqual(["manyBullets"]);
    expect(atsChecks(role(Array.from({ length: 8 }, (_, i) => `b${i}`)))).toEqual([]);
  });
  it("flags characters ATS parsers mangle", () => {
    expect(atsChecks(role(["★ Led team", "ok"]))).toEqual(["oddCharacters"]);
    expect(atsChecks(role(["✓ Led team", "ok"]))).toEqual(["oddCharacters"]);
    expect(atsChecks(role(["Led\tteam", "ok"]))).toEqual(["oddCharacters"]);
    expect(atsChecks(role(["Led team 🚀", "ok"]))).toEqual(["oddCharacters"]);
  });
  it("lists tips in a fixed order", () => {
    const tips = atsChecks(role(["I " + "a".repeat(230) + "★"], { title: "", startDate: "" }));
    expect(tips).toEqual(["tooLong", "firstPerson", "missingDates", "missingTitle", "fewBullets", "oddCharacters"]);
  });
});

describe("summaryChecklist", () => {
  const get = (c: CvContent, key: string) => summaryChecklist(c).find((x) => x.key === key)?.ok;
  const withRole = (summary: string) => cv({ summary, experience: [role(twoBullets)] });

  it("passes 2 to 4 sentences and fails 1 or 5", () => {
    expect(get(withRole("One."), "sentences")).toBe(false);
    expect(get(withRole("One. Two."), "sentences")).toBe(true);
    expect(get(withRole("One. Two. Three. Four!"), "sentences")).toBe(true);
    expect(get(withRole("One. Two. Three. Four. Five."), "sentences")).toBe(false);
  });
  it("does not split on decimals", () => {
    expect(get(withRole("Grew sales 1.2 times. Led a team."), "sentences")).toBe(true);
  });
  it("catches first person in both languages", () => {
    for (const s of ["I lead teams.", "My team grew.", "Eu conduc echipe.", "Rolul meu conteaza."]) {
      expect(get(withRole(s), "firstPerson")).toBe(false);
    }
    expect(get(withRole("Leads teams."), "firstPerson")).toBe(true);
  });
  it("fails length over 600 characters", () => {
    expect(get(withRole("a".repeat(600)), "length")).toBe(true);
    expect(get(withRole("a".repeat(601)), "length")).toBe(false);
  });
  it("checks the latest role (first in CV order) by title or a 4+ letter word", () => {
    expect(get(withRole("Experienced in payroll."), "mentionsRole")).toBe(true);
    expect(get(withRole("A PAYROLL ANALYST."), "mentionsRole")).toBe(true);
    expect(get(withRole("Good with people."), "mentionsRole")).toBe(false);
    const older = cv({ summary: "Strong in design.", experience: [role(twoBullets), role(twoBullets, { id: "r2", title: "Designer" })] });
    expect(get(older, "mentionsRole")).toBe(false);
    expect(get(cv({ summary: "Anything." }), "mentionsRole")).toBe(false);
  });
  it("matches whole words only", () => {
    const c = cv({ summary: "Misleading claims.", experience: [role(twoBullets, { title: "Lead Engineer" })] });
    expect(get(c, "mentionsRole")).toBe(false);
    expect(get(cv({ summary: "Team lead.", experience: [role(twoBullets, { title: "Lead Engineer" })] }), "mentionsRole")).toBe(true);
  });
  it("ignores short title words", () => {
    const c = cv({ summary: "Works in HR and IT.", experience: [role(twoBullets, { title: "HR IT Lead" })] });
    expect(get(c, "mentionsRole")).toBe(false);
  });
  it("passes mentionsNumber on any digit", () => {
    expect(get(withRole("10 years in payroll."), "mentionsNumber")).toBe(true);
    expect(get(withRole("Years in payroll."), "mentionsNumber")).toBe(false);
  });
});

describe("skillsChecklist", () => {
  it("fails nothingToSort when unclear skills remain", () => {
    expect(skillsChecklist(cv({ unclear: ["Stuff"] }))[0]).toEqual({ key: "nothingToSort", ok: false });
    expect(skillsChecklist(cv({}))[0]).toEqual({ key: "nothingToSort", ok: true });
  });
  it("lists tool-like words from bullets missing from skills", () => {
    const c = cv({ experience: [role(["Built reports in SQL and PowerBI for the HR team"])], tech: ["Excel"] });
    expect(skillsChecklist(c)[1]).toEqual({ key: "toolsListed", ok: false, missing: ["SQL", "PowerBI"] });
  });
  it("accepts tools already listed in any group, ignoring case and spaces", () => {
    const c = cv({ experience: [role(["Built reports in SQL and PowerBI"])], tech: ["sql"], pro: ["Power BI"] });
    expect(skillsChecklist(c)[1]).toEqual({ key: "toolsListed", ok: true, missing: [] });
  });
  it("recognises GA4 and Node.js and skips the stop list", () => {
    const c = cv({ experience: [role(["Tracked GA4 events for the CEO and CV tool in Node.js, EU"])] });
    expect(skillsChecklist(c)[1]?.missing).toEqual(["GA4", "Node.js"]);
  });
  it("skips quarters, plurals of abbreviations, e.g. and the extended stop list", () => {
    const c = cv({ experience: [role(["Hit Q3 KPIs, e.g. U.S. ROI for IT, B2B and S.R.L. clients"])] });
    expect(skillsChecklist(c)[1]).toEqual({ key: "toolsListed", ok: true, missing: [] });
  });
  it("lists camel-case and letter-digit tools", () => {
    const c = cv({ experience: [role(["Wrote JavaScript and Python3"])] });
    expect(skillsChecklist(c)[1]?.missing).toEqual(["JavaScript", "Python3"]);
  });
  it("does not list plain capitalised words", () => {
    const c = cv({ experience: [role(["Built reports for Marketing"])] });
    expect(skillsChecklist(c)[1]).toEqual({ key: "toolsListed", ok: true, missing: [] });
  });
});

describe("numbersIn", () => {
  it("normalises separators, scales, percent and units", () => {
    expect(numbersIn("20 minutes, 20 min")).toEqual(["20", "20"]);
    expect(numbersIn("1.2M")).toEqual(["1200000"]);
    expect(numbersIn("1,2 mil clienți")).toEqual(["1200000"]);
    expect(numbersIn("3k and 2 mii and 4 million and 5 milioane")).toEqual(["3000", "2000", "4000000", "5000000"]);
    expect(numbersIn("30 %")).toEqual(["30"]);
    expect(numbersIn("30%")).toEqual(["30"]);
    expect(numbersIn("no digits")).toEqual([]);
  });
  // Ruling: a comma or dot followed by exactly 3 digits, with no scale suffix, is a thousands
  // separator ("1,200" and "1.200" are both 1200). Any other single separator is a decimal.
  it("treats a separator before exactly 3 digits as thousands", () => {
    expect(numbersIn("1,200")).toEqual(["1200"]);
    expect(numbersIn("1.200")).toEqual(["1200"]);
    expect(numbersIn("1.234.567")).toEqual(["1234567"]);
    expect(numbersIn("1.5")).toEqual(["1.5"]);
    expect(numbersIn("2,50")).toEqual(["2.5"]);
    expect(numbersIn("1.200M")).toEqual(["1200000"]);
  });
  it("does not read 'min' as a million", () => {
    expect(numbersIn("5 min")).toEqual(["5"]);
  });
  it("reads milion, miliard and billion scales", () => {
    expect(numbersIn("1 milion de clienți")).toEqual(["1000000"]);
    expect(numbersIn("2 millions, 3 miliarde, 1 billion, 2B")).toEqual(["2000000", "3000000000", "1000000000", "2000000000"]);
    expect(hasUnknownNumber("1M customers", ["1 milion clienți"])).toBe(false);
  });
  it("reads space, non-breaking space and apostrophe thousands as one number", () => {
    expect(numbersIn("10 000")).toEqual(["10000"]);
    expect(numbersIn("10 000 and 10'000")).toEqual(["10000", "10000"]);
    expect(hasUnknownNumber("10,000 users", ["10 000 users"])).toBe(false);
  });
  it("takes a one-letter scale only when attached and not followed by a letter, digit or &", () => {
    expect(numbersIn("Led 3 M&A deals")).toEqual(["3"]);
    expect(numbersIn("3M&A deals")).toEqual(["3"]);
    expect(numbersIn("6 M")).toEqual(["6"]);
    expect(numbersIn("3M users")).toEqual(["3000000"]);
  });
  it("ignores digits glued to a letter, as in B2B, GA4 and Q3", () => {
    expect(numbersIn("B2B clients")).toEqual([]);
    expect(numbersIn("GA4 and Q3")).toEqual([]);
    expect(numbersIn("ISO27001 and Q32020 and Y2K")).toEqual([]);
    expect(numbersIn("x3")).toEqual(["3"]);
    expect(numbersIn("grew sales x3")).toEqual(["3"]);
    expect(numbersIn("3B users")).toEqual(["3000000000"]);
  });
  it("reads 0.250 as a decimal", () => {
    expect(numbersIn("0.250")).toEqual(["0.25"]);
  });
});

describe("hasUnknownNumber", () => {
  it("accepts numbers written differently", () => {
    expect(hasUnknownNumber("Cut onboarding to 20 minutes", ["from 3 days to 20 min"])).toBe(false);
    expect(hasUnknownNumber("for 1.2M customers", ["1,2 mil clienți"])).toBe(false);
    expect(hasUnknownNumber("by 30%", ["30 %"])).toBe(false);
  });
  it("rejects numbers found nowhere", () => {
    expect(hasUnknownNumber("by 30%", ["improved a lot"])).toBe(true);
    expect(hasUnknownNumber("for 12 clients", ["for 120 clients"])).toBe(true);
  });
  it("accepts a proposal with no numbers", () => {
    expect(hasUnknownNumber("Improved onboarding", [])).toBe(false);
  });
  it("rejects digits glued to capitals that appear in no source", () => {
    expect(hasUnknownNumber("Saved USD1800 a year", ["Saved USD 900 a year"])).toBe(true);
    expect(hasUnknownNumber("Closed Q5 targets", ["Closed Q4 targets"])).toBe(true);
    expect(hasUnknownNumber("Cut costs by EUR500.", ["Cut costs"])).toBe(true);
  });
  it("accepts glued tokens found whole in a source, in any case", () => {
    expect(hasUnknownNumber("GA4 reports for the team", ["set up GA4"])).toBe(false);
    expect(hasUnknownNumber("Grew B2B sales", ["B2B sales"])).toBe(false);
    expect(hasUnknownNumber("Led the ISO27001 audit.", ["iso27001 audit"])).toBe(false);
    expect(hasUnknownNumber("Shipped in Q4.", ["Q4, 2023"])).toBe(false);
  });
  it("rejects unknown glued tokens that start with a digit", () => {
    expect(hasUnknownNumber("Results in 2024Q3", ["2024 Q2"])).toBe(true);
    expect(hasUnknownNumber("Growth in 1H2025", ["1H 2024"])).toBe(true);
    expect(hasUnknownNumber("Saved 1USD1800", ["1 team"])).toBe(true);
    expect(hasUnknownNumber("Hit 2xEUR500", ["2 offices"])).toBe(true);
  });
  it("accepts a digit-first glued token found whole, and leaves numbers with units to numbersIn", () => {
    expect(hasUnknownNumber("Results in 2024Q3", ["2024Q3 results"])).toBe(false);
    expect(hasUnknownNumber("Reached 5k users", ["5,000 users"])).toBe(false);
    expect(hasUnknownNumber("Grew sales x3 in 20min", ["sales x3 in 20 minutes"])).toBe(false);
    expect(hasUnknownNumber("for 3bn in 10x less time", ["3 billion", "10 times"])).toBe(false);
  });
  it("does not take a glued token from inside a longer source token", () => {
    expect(hasUnknownNumber("Built GA4 dashboards", ["GA45 migration"])).toBe(true);
  });
});
