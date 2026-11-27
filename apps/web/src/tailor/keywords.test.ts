import { describe, expect, it } from "vitest";
import type { MatchLabel, MatchScore } from "@resumora/shared";
import { keywordsOf } from "./KeywordsStep.tsx";

const label = (ref: string, status: MatchLabel["status"], kind: MatchLabel["kind"] = "keyword"): MatchLabel => ({ ref, kind, status, evidence: null, inferred: false });
const score = (labels: MatchLabel[]): MatchScore => ({ policy: "match/1", total: 60, band: "fair", capped: false, labels,
  parts: { requirements: null, keywords: null, seniority: null, langEdu: null } });

describe("the ad's keywords on a CV", () => {
  it("counts only keywords the CV fully shows; requirements are not keywords", () => {
    expect(keywordsOf(score([label("k:SQL", "met"), label("k:dbt", "partial"), label("k:Excel", "missing"), label("r0", "met", "requirement")])))
      .toEqual({ has: ["SQL"], missing: ["dbt", "Excel"] });
    expect(keywordsOf(null)).toEqual({ has: [], missing: [] });
  });
});
