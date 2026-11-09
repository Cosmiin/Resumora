// The tailoring eval in CI mode: the whole pipeline on all 6 fixture pairs with the fake model.
// Every check passes except one known gap: tailoring rewords but never removes bullets, so the 6-role, 48-bullet
// long-career CV can't reach 2 pages even fully condensed (owner decision, see the tailoring progress file R30).
import { describe, expect, it } from "vitest";
import { emptyCv, type JobExtraction } from "@resumora/shared";
import { fakeTailorModel, inventedFacts, loadPairs, report, runPair } from "../eval/tailor/run.ts";

describe("tailoring eval (fake model)", () => {
  it("validates all 6 fixture pairs against the CV and job schemas", () => {
    expect(loadPairs().map((pair) => pair.id)).toHaveLength(6);
  });

  it("runs every pair through the full pipeline with all checks passing (except the known page gap)", async () => {
    const rows = await Promise.all(loadPairs().map((pair) => runPair(pair, fakeTailorModel)));
    for (const row of rows) {
      if (row.id === "en-engineering-manager-long-career") expect(row.problems.join("; ")).toMatch(/^[3-9] pages > 2$/);
      else expect(row.problems, row.id).toEqual([]);
      expect(row.invented, row.id).toEqual([]);
      expect(row.score1, row.id).toHaveLength(3);
      expect(row.score2, row.id).not.toBeNull();
      expect(row.pages, row.id).toBeGreaterThanOrEqual(1);
    }
    expect(report(rows)).toContain("5/6 pairs pass");
  }, 120_000);

  it("counts a new number or a new employer as an invented fact", () => {
    const base = { ...emptyCv("en"), experience: [{ id: "r1", company: "Acme", title: "Dev", location: "", startDate: "2020-01", endDate: "", current: true, description: "Cut costs by 10%.", bullets: [], notes: [] }] };
    const job = { title: "Dev", requirements: [], responsibilities: ["Grow 3 teams"] } as unknown as JobExtraction;
    expect(inventedFacts(base, job, base)).toEqual([]);
    const tailored = { ...base, experience: [{ ...base.experience[0]!, company: "Globex", description: "Cut costs by 40% across 3 teams." }] };
    expect(inventedFacts(base, job, tailored)).toEqual(["number: Cut costs by 40% across 3 teams.", "employer: Globex"]);
  });
});
