import { describe, expect, it } from "vitest";
import type { Experience } from "./cv.ts";
import { buildRoleResult, fingerprint, type ModelBullet } from "./enrich.ts";
import { ShapeAnswerSchema, applyChanges, keepsNumbers, needsShape, strongestFirst, type Change } from "./enrich-shape.ts";

const role = (texts: string[], over: Partial<Experience> = {}): Experience => ({
  id: "r1", company: "Vevol Media", title: "Ecommerce Specialist", location: "Dublin", startDate: "2024-01", endDate: "2026-01",
  current: false, description: "", notes: [], bullets: texts.map((text, i) => ({ id: `b${i + 1}`, text })), ...over,
});

const mb = (id: string, over: Partial<ModelBullet> = {}): ModelBullet => ({
  id, meaningful: true, contribution: "specific", clarity: "specific", specificity: "specific", impact: "missing",
  concise: "specific", issue: "impact", duplicateOf: null, tip: null, question: null, options: [], ...over,
});
const model = (bullets: ModelBullet[]) => ({ bullets, nextStepId: null, roleQuestions: [], thin: false });

const vevol = [
  "Managed Shopify and Shopify Plus stores for 5-10 client accounts across international markets.",
  "Coordinated with external developers to prioritize UX/UI updates for 5-10 client accounts.",
  "Implemented and tested new features for 5-10 client accounts in Shopify Plus via Asana.",
  "Executed ecommerce campaigns by configuring discount codes.",
  "Managed technical store operations for 5-10 client accounts in Asana.",
  "Designed visual assets in Canva to increase monthly revenue by 10–20%.",
  "Resolved 30–50 support tickets per week for the Noblesse Shopify theme.",
  "Organized the first Shopify Meetup in Eastern and Central Europe in 2025 for 50–100 attendees.",
];

describe("applyChanges", () => {
  const base = role(["One", "Two", "Three"]);

  it("replaces a line's text, removes a line and appends a new one with the change's id", () => {
    const changes: Change[] = [
      { id: "c1", kind: "bullet", bulletId: "b1", text: "One and two" },
      { id: "c2", kind: "remove", bulletId: "b2" },
      { id: "new-1", kind: "new", text: "Four" },
    ];
    expect(applyChanges(base, changes).bullets).toEqual([
      { id: "b1", text: "One and two" }, { id: "b3", text: "Three" }, { id: "new-1", text: "Four" },
    ]);
  });

  it("sets the description and reorders lines, keeping ids it doesn't name after the named ones", () => {
    const out = applyChanges(base, [
      { id: "d", kind: "description", text: "What the role was for." },
      { id: "o", kind: "order", ids: ["b3", "nope", "b1"] },
    ]);
    expect(out.description).toBe("What the role was for.");
    expect(out.bullets.map((b) => b.id)).toEqual(["b3", "b1", "b2"]);
  });

  it("names a line once even when an order change repeats it", () => {
    expect(applyChanges(base, [{ id: "o", kind: "order", ids: ["b2", "b2", "b1"] }]).bullets.map((b) => b.id)).toEqual(["b2", "b1", "b3"]);
  });

  it("ignores changes to lines that don't exist and leaves the input untouched", () => {
    const before = structuredClone(base);
    const out = applyChanges(base, [{ id: "x", kind: "bullet", bulletId: "zz", text: "?" }, { id: "y", kind: "remove", bulletId: "zz" }]);
    expect(out.bullets).toEqual(base.bullets);
    expect(base).toEqual(before);
  });

  it("gives the same fingerprint every time for the same changes", () => {
    const changes: Change[] = [{ id: "new-1", kind: "new", text: "Four" }, { id: "o", kind: "order", ids: ["new-1"] }];
    expect(fingerprint(applyChanges(base, changes), "en")).toBe(fingerprint(applyChanges(base, changes), "en"));
  });
});

describe("numbers", () => {
  it("treats an en dash and a hyphen in a range as the same number", () => {
    expect(keepsNumbers(["revenue by 10–20%"], "revenue by 10-20%")).toBe(true);
    expect(keepsNumbers(["for 5-10 client accounts, 30–50 tickets, in 2025"], "30-50 tickets for 5–10 clients in 2025")).toBe(true);
    expect(keepsNumbers(["for 5-10 client accounts, 30–50 tickets, in 2025"], "30-50 tickets for 5–10 clients")).toBe(false);
  });

  it("knows when a merge loses a number", () => {
    expect(keepsNumbers(["for 5-10 client accounts"], "for several clients")).toBe(false);
    expect(keepsNumbers(["for 5-10 client accounts", "via Asana"], "via Asana for 5–10 client accounts")).toBe(true);
  });
});

describe("strongestFirst", () => {
  it("moves the line with the clearest result to the top", () => {
    const r = role(vevol);
    const graded = vevol.map((_, i) => mb(`b${i + 1}`, i === 5 ? { impact: "specific", issue: "none" } : {}));
    expect(strongestFirst(r, buildRoleResult(r, model(graded), "fp"))).toBe("b6");
  });

  it("leaves the order alone when the first line already has a result, or no line has one", () => {
    const r = role(vevol);
    const first = vevol.map((_, i) => mb(`b${i + 1}`, i === 0 || i === 5 ? { impact: "specific", issue: "none" } : {}));
    expect(strongestFirst(r, buildRoleResult(r, model(first), "fp"))).toBeNull();
    const none = vevol.map((_, i) => mb(`b${i + 1}`));
    expect(strongestFirst(r, buildRoleResult(r, model(none), "fp"))).toBeNull();
  });
});

describe("needsShape", () => {
  const clean = (n: number) => role(vevol.slice(0, n));
  const graded = (r: Experience, dup = false) => buildRoleResult(r, model(r.bullets.map((b, i) => mb(b.id, dup && i === 1 ? { duplicateOf: "b1" } : {}))), "fp");

  it("is true above 6 lines, or with a repeated line", () => {
    expect(needsShape(clean(8), graded(clean(8)))).toBe(true);
    expect(needsShape(clean(5), graded(clean(5), true))).toBe(true);
  });

  it("is false for 6 or fewer clean lines", () => {
    expect(needsShape(clean(5), graded(clean(5)))).toBe(false);
    expect(needsShape(clean(6), undefined)).toBe(false);
  });
});

describe("ShapeAnswerSchema", () => {
  it("caps a merged line at 220 characters and needs at least two lines per merge", () => {
    expect(ShapeAnswerSchema.safeParse({ merges: [{ ids: ["b1", "b2"], text: "x".repeat(221) }] }).success).toBe(false);
    expect(ShapeAnswerSchema.safeParse({ merges: [{ ids: ["b1"], text: "ok" }] }).success).toBe(false);
    expect(ShapeAnswerSchema.safeParse({ merges: [{ ids: ["b1", "b2"], text: "ok" }] }).success).toBe(true);
  });
});
