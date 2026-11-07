import { describe, expect, it } from "vitest";
import { looksLikeJob } from "./job-check";
import type { ReaderResult } from "./readers";

const exampleText = (
  "This domain is for use in documentation examples without needing permission. "
  + "Avoid use in operations. هذا النطاق مخصص للاستخدام في الأمثلة التوضيحية. "
  + "此域名用于文档中的示例，无需事先许可。 "
).repeat(8);
const page = (overrides: Partial<ReaderResult> = {}): ReaderResult => ({
  url: "https://example.com/", pageText: "", jsonLd: [], ...overrides,
});

describe("looksLikeJob", () => {
  it("rejects a long multilingual example.com notice", () => {
    expect(exampleText.length).toBeGreaterThan(900);
    expect(looksLikeJob(page({ pageText: exampleText }))).toBe(false);
  });

  it.each([
    { "@type": "JobPosting" },
    { "@graph": [{ "@type": "Organization" }, { "@type": "JobPosting" }] },
    { "@type": ["Thing", "JobPosting"] },
    { "@graph": [{ "@graph": [{ "@type": ["JobPosting"] }] }] },
    [{ "@type": "JobPosting" }],
  ])("recognizes JobPosting in JSON-LD %j", (item) => {
    expect(looksLikeJob(page({ jsonLd: [null, "JobPosting", item] }))).toBe(true);
  });

  it.each([
    "https://boards.greenhouse.io/acme/jobs/1", "https://greenhouse.io/acme",
    "https://www.linkedin.com/jobs/view/1/", "https://linkedin.com/jobs/search/",
    "https://www.indeed.com/viewjob?jk=1", "https://indeed.com/rc/clk?jk=1",
    "https://acme.myworkdayjobs.com/en-US/openings",
  ])("recognizes the job site %s without keywords", (url) => {
    expect(looksLikeJob(page({ url }))).toBe(true);
  });

  it.each([
    "https://greenhouse.io.evil.example/", "https://fakegreenhouse.io/",
    "https://www.linkedin.com/feed/", "https://www.indeed.com/about",
  ])("does not trust unrelated hosts or paths: %s", (url) => {
    expect(looksLikeJob(page({ url }))).toBe(false);
  });

  it("combines a company careers path with one text signal", () => {
    expect(looksLikeJob(page({ url: "https://acme.example/careers/data-engineer", pageText: "Requirements" }))).toBe(true);
  });

  it("compares Romanian signals without case or diacritics", () => {
    expect(looksLikeJob(page({ url: "https://firma.example/", pageText: "Cerințe și Beneficii" }))).toBe(true);
  });

  it("recognizes two English phrases", () => {
    expect(looksLikeJob(page({ pageText: "About the role: what you'll do" }))).toBe(true);
  });

  it.each([
    ["https://news.example/article", "salary"],
    ["https://news.example/article", "salary salary SALARY"],
    ["https://acme.example/careers/data-engineer", "No details yet"],
    ["https://acme.example/careers/data-engineer/jobs", "No details yet"],
    ["https://acme.example/careers-news?job=1", "salary"],
  ])("requires two distinct signals on %s: %s", (url, pageText) => {
    expect(looksLikeJob(page({ url, pageText }))).toBe(false);
  });
});
