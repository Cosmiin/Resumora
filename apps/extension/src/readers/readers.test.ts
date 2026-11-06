// @vitest-environment node
import { readFileSync } from "node:fs";
// @ts-expect-error jsdom has no bundled declarations; use standard DOM types below.
import { JSDOM } from "jsdom";
import { afterEach, describe, expect, it } from "vitest";
import { blockText, collectJsonLd, readGeneric } from "./generic";
import { readPage } from "./index";
import { linkedInJobId, readLinkedIn } from "./linkedin";

const canonicalUrl = "https://www.linkedin.com/jobs/view/4012345678/";
const windows: Window[] = [];

function load(name: string, url = "https://careers.example.test/jobs/data") {
  const html = readFileSync(new URL(`./fixtures/${name}.html`, import.meta.url), "utf8");
  const window = new JSDOM(html, { url }).window as Window;
  windows.push(window);
  return { doc: window.document, loc: window.location };
}

afterEach(() => {
  windows.splice(0).forEach((window) => window.close());
});

const linkedInPages = [
  ["linkedin-view", `${canonicalUrl}?trk=x`],
  ["linkedin-search", "https://www.linkedin.com/jobs/search-results/?currentJobId=4012345678&keywords=data"],
  ["linkedin-collection", "https://www.linkedin.com/jobs/collections/recommended/?currentJobId=4012345678"],
] as const;

describe("LinkedIn pages", () => {
  it.each(linkedInPages)("reads the selected job from %s", (fixture, url) => {
    const { doc, loc } = load(fixture, url);
    const result = readPage(doc, loc);

    expect(result.url).toBe(canonicalUrl);
    for (const text of [
      "Senior Data Engineer", "Northwind Labs", "Bucharest, Romania", "Hybrid",
      "Build dependable data platforms with Northwind Labs.",
      "You will own data quality from ingestion through reporting.",
    ]) expect(result.pageText).toContain(text);
    for (const text of [
      "People also viewed", "About the company", "Company history", "About the job",
      "Alex Example", "Feed update", "Junior Data Analyst", "Platform Operations Manager",
      "Unrelated Systems Architect", "… more",
    ]) expect(result.pageText).not.toContain(text);
    expect(result.pageText).toContain("\n\nBuild dependable data platforms");
    expect(doc.querySelector('[aria-expanded="false"]')).not.toBeNull();
  });

  it("falls back when only the company section has a description box", () => {
    const { doc, loc } = load("linkedin-no-description", `${canonicalUrl}?trk=preview`);
    expect(readLinkedIn(doc, loc)).toBeNull();
    expect(readPage(doc, loc)).toEqual(readGeneric(doc, loc));
    expect(readPage(doc, loc).url).toBe(loc.href);
    expect(readPage(doc, loc).pageText).toContain("The description is unavailable.");
  });

  it.each(["Overview", "Despre job"])("falls back for the heading %s", (text) => {
    const { doc, loc } = load("linkedin-view", canonicalUrl);
    doc.querySelector("h2")!.textContent = text;
    expect(readLinkedIn(doc, loc)).toBeNull();
    expect(readPage(doc, loc)).toEqual(readGeneric(doc, loc));
  });

  it("falls back without a job id", () => {
    const { doc, loc } = load("linkedin-search", "https://www.linkedin.com/jobs/search-results/?currentJobId=abc");
    expect(readLinkedIn(doc, loc)).toBeNull();
    expect(readPage(doc, loc)).toEqual(readGeneric(doc, loc));
  });

  it("includes structured data with a LinkedIn job", () => {
    const { doc, loc } = load("linkedin-view", canonicalUrl);
    const script = doc.createElement("script");
    script.type = "application/ld+json";
    script.textContent = '{"@type":"JobPosting","title":"Senior Data Engineer"}';
    doc.head.append(script);
    expect(readPage(doc, loc).jsonLd).toEqual([
      { "@type": "JobPosting", title: "Senior Data Engineer" },
    ]);
  });

  it.each([
    "https://careers.example.test/jobs/view/4012345678/",
    "https://www.linkedin.com/feed/?currentJobId=4012345678",
    "https://linkedin.com/jobs/view/4012345678/",
  ])("uses the general reader outside www.linkedin.com/jobs/: %s", (url) => {
    const { doc, loc } = load("linkedin-view", url);
    expect(readPage(doc, loc)).toEqual(readGeneric(doc, loc));
    expect(readPage(doc, loc).url).toBe(url);
  });
});

describe("linkedInJobId", () => {
  it.each([
    ["/jobs/view/4012345678/", "4012345678"],
    ["/jobs/view/data-engineer-at-acme-4012345678/", "4012345678"],
    ["/jobs/view/data-engineer-at-acme-4012345678", "4012345678"],
    ["/jobs/search-results/?currentJobId=4012345678", "4012345678"],
    ["/jobs/search-results/?currentJobId=abc", null],
    ["/jobs/search-results/?currentJobId=40123abc", null],
    ["/jobs/search-results/?currentJobId=%2040123", null],
    ["/jobs/search-results/?currentJobId=", null],
    ["/jobs/view/data-engineer-40123-preview/", null],
    ["/jobs/view/data-engineer/", null],
    ["/jobs/search-results/", null],
  ])("reads %s as %s", (path, expected) => {
    const { loc } = load("linkedin-view", `https://www.linkedin.com${path}`);
    expect(linkedInJobId(loc)).toBe(expected);
  });
});

describe("general pages", () => {
  it("prefers main and keeps headings and list items on separate lines", () => {
    const { doc, loc } = load("generic-main");
    expect(readPage(doc, loc)).toEqual({
      url: loc.href,
      pageText: "Data Engineer\nBuild useful data products.\nWrite clear SQL\nSupport your team",
      jsonLd: [],
    });
  });

  it("uses body and removes navigation, headers, footers, asides and forms", () => {
    const { doc, loc } = load("generic-no-main");
    expect(readPage(doc, loc).pageText)
      .toBe("Analytics Engineer\nHelp teams understand their data.");
  });

  it("prefers role main to article when main is absent", () => {
    const { doc, loc } = load("generic-main");
    doc.querySelector("main")!.remove();
    expect(readPage(doc, loc).pageText).toBe("Outside role main");
  });

  it("uses article when main and role main are absent", () => {
    const { doc, loc } = load("generic-main");
    doc.querySelector("main")!.remove();
    doc.querySelector('[role="main"]')!.remove();
    expect(readPage(doc, loc).pageText).toBe("Outside article");
  });

  it("separates block elements while preserving inline text and collapsing whitespace", () => {
    const { doc } = load("generic-no-main");
    const root = doc.createElement("div");
    root.innerHTML = `<h1>One</h1><h2>Two</h2><h3>Three</h3><h4>Four</h4>
      <h5>Five</h5><h6>Six</h6><section>Section <span>inline</span>
      text<div>Nested</div>After</section><p>A   paragraph<br>Next line</p>
      <ul><li>First</li><li>Second</li></ul><dl><dt>Term</dt><dd>Definition</dd></dl>
      <table><tbody><tr><td>Row one</td></tr><tr><td>Row two</td></tr></tbody></table>`;
    expect(blockText(root)).toBe([
      "One", "Two", "Three", "Four", "Five", "Six", "Section inline text", "Nested", "After",
      "A paragraph", "Next line", "First", "Second", "Term", "Definition", "Row one", "Row two",
    ].join("\n"));
  });
});

describe("JSON-LD", () => {
  it("keeps objects and graph documents unchanged and skips broken JSON", () => {
    const { doc, loc } = load("generic-jsonld");
    const expected = [
      {
        "@context": "https://schema.org", "@type": "JobPosting", title: "Senior Data Engineer",
        hiringOrganization: { "@type": "Organization", name: "Northwind Labs" },
      },
      {
        "@context": "https://schema.org",
        "@graph": [
          { "@type": "JobPosting", title: "Analytics Engineer" },
          { "@type": "Organization", name: "Fictional Orchard Studio" },
        ],
      },
    ];
    expect(collectJsonLd(doc)).toEqual(expected);
    expect(readPage(doc, loc).jsonLd).toEqual(expected);
    expect(readPage(doc, loc).pageText).toBe("Structured job data\nDetails from a fictional job board.");
  });

  it("keeps at most 20 parsed items, skipping invalid scripts", () => {
    const { doc } = load("generic-jsonld");
    for (let index = 0; index < 25; index++) {
      const script = doc.createElement("script");
      script.type = "application/ld+json";
      script.textContent = JSON.stringify({ index });
      doc.head.append(script);
    }
    const items = collectJsonLd(doc);
    expect(items).toHaveLength(20);
    expect(items[19]).toEqual({ index: 17 });
  });
});

it.each([
  ...linkedInPages,
  ["linkedin-no-description", canonicalUrl],
  ["generic-main", "https://careers.example.test/main"],
  ["generic-no-main", "https://careers.example.test/body"],
  ["generic-jsonld", "https://careers.example.test/jsonld"],
] as const)("leaves the live document unchanged for %s", (fixture, url) => {
  const { doc, loc } = load(fixture, url);
  const before = doc.body.innerHTML;
  readPage(doc, loc);
  expect(doc.body.innerHTML).toBe(before);
});
