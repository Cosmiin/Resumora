import { expect, it } from "vitest";
import { fact, newRole } from "./model";
import {
  experienceDuration,
  formatExperienceDuration,
  formatMonths,
} from "./dates";
const asOf = { year: "2026", month: "10" };
function role(start: string, end: string, ongoing = false) {
  const r = newRole();
  const date = (v: string) => ({
    year: v.split("-")[0],
    month: v.split("-")[1] ?? "",
  });
  r.start = fact(date(start));
  r.end = fact(date(end));
  r.ongoing = fact(ongoing);
  return r;
}
it("counts dated roles separately and unions overlap without counting gaps as experience", () => {
  const roles = [
    role("2020-1", "2021-1"),
    role("2020-7", "2022-1"),
    role("2023-1", "2023-4"),
  ];
  expect(roles.map((r) => experienceDuration([r], asOf).min)).toEqual([
    12, 18, 3,
  ]);
  expect(experienceDuration(roles, asOf)).toEqual({
    min: 27,
    max: 27,
    known: 3,
    unknown: 0,
  });
  expect(formatExperienceDuration(experienceDuration(roles, asOf), "en")).toBe(
    "2 years 3 months",
  );
});
it("pins ongoing work to the reference month and caps future end dates", () => {
  expect(experienceDuration([role("2024-8", "", true)], asOf).min).toBe(26);
  expect(experienceDuration([role("2024-8", "2028-1")], asOf).min).toBe(26);
  expect(experienceDuration([role("2028-1", "", true)], asOf).unknown).toBe(1);
});
it("retains year-only uncertainty and never guesses dates for invalid or undated roles", () => {
  const partial = experienceDuration([role("2020", "2022")], asOf);
  expect(partial).toEqual({ min: 13, max: 35, known: 1, unknown: 0 });
  expect(formatExperienceDuration(partial, "en")).toBe(
    "1 year 1 month – 2 years 11 months",
  );
  for (const r of [
    role("", ""),
    role("2022-8", "2020-1"),
    role("2020-13", "2022-1"),
  ])
    expect(experienceDuration([r], asOf).unknown).toBe(1);
  expect(
    experienceDuration([role("2020-1", "2021-1")], { year: "", month: "" })
      .unknown,
  ).toBe(1);
});
it("does not expose hidden/unreviewed date calculations and accepts an evidenced closed end without an ongoing assertion", () => {
  const r = role("2020-1", "2021-1");
  r.ongoing.status = "draft";
  expect(experienceDuration([r], asOf).min).toBe(12);
  expect(experienceDuration([r], asOf, [r.start.fieldId]).known).toBe(0);
  r.start.status = "extracted_unconfirmed";
  expect(formatExperienceDuration(experienceDuration([r], asOf), "en")).toBe(
    "Duration unavailable",
  );
  const mixed = experienceDuration([role("2020-1", "2021-1"), r], asOf);
  expect(formatExperienceDuration(mixed, "en")).toBe("at least 1 year");
});
it("formats singular, plural, zero and Romanian year/month units", () => {
  expect(formatMonths(0, "en")).toBe("0 months");
  expect(formatMonths(13, "en")).toBe("1 year 1 month");
  expect(formatMonths(26, "ro")).toBe("2 ani 2 luni");
  expect(formatMonths(240, "ro")).toBe("20 de ani");
});
