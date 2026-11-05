import { describe, expect, it } from "vitest";
import { formatYearMonth, parseTypedDate } from "./index.ts";

describe("parseTypedDate", () => {
  const okCases: [string, string][] = [
    ["", ""],
    ["2021", "2021"],
    ["Mar 2021", "2021-03"],
    ["march 2021", "2021-03"],
    ["Mar. 2021", "2021-03"],
    ["03/2021", "2021-03"],
    ["3.2021", "2021-03"],
    ["3/2021", "2021-03"],
    ["2021-03", "2021-03"],
    ["mai 2020", "2020-05"],
    ["septembrie 2019", "2019-09"],
    ["sept. 2019", "2019-09"],
    ["ian 2018", "2018-01"],
  ];
  it.each(okCases)("reads %j as %j", (input, value) => {
    expect(parseTypedDate(input)).toEqual({ ok: true, value, present: false });
  });

  it.each(["present", "Present", "prezent", "now", "acum"])("reads %j as present", (input) => {
    expect(parseTypedDate(input)).toEqual({ ok: true, value: "", present: true });
  });

  it.each(["Spring", "13/2021", "2021-13", "21", "Mar"])("rejects %j", (input) => {
    expect(parseTypedDate(input)).toEqual({ ok: false });
  });
});

describe("formatYearMonth", () => {
  it("formats in the CV's language", () => {
    expect(formatYearMonth("2021-03", "en")).toBe("Mar 2021");
    expect(formatYearMonth("2021-03", "ro")).toBe("mar. 2021");
    expect(formatYearMonth("2021-09", "ro")).toBe("sept. 2021");
    expect(formatYearMonth("2021", "en")).toBe("2021");
    expect(formatYearMonth("", "en")).toBe("");
  });
});
