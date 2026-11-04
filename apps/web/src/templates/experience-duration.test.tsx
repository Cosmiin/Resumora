import { render } from "@testing-library/react";
import { expect, it } from "vitest";
import { blankDraft, fact, newRole, localId } from "../base/model";
import { DocumentPreview } from "../components/DocumentPreview";
import { renderPrintHtml } from "../export/render";
import { cvTemplates } from "./registry";
const asOf = { year: "2026", month: "10" };
const templates = [undefined, ...cvTemplates.map((t) => t.versionId)];
function draft(version?: string) {
  const d = blankDraft();
  d.language = "en";
  d.presentation.templateVersionId = version;
  d.name = fact("Synthetic Analyst");
  d.roles = ["First", "Second"].map((name, i) => {
    const r = newRole();
    r.title = fact(name);
    r.company = fact("QA Company");
    r.start = fact({ year: "2020", month: i ? "7" : "1" });
    r.end = fact({ year: i ? "2022" : "2021", month: "1" });
    return r;
  });
  d.contacts.push({
    id: localId(),
    kind: "social",
    platform: "website",
    visible: true,
    value: fact("portfolio.example.com"),
  });
  return d;
}
it.each(templates)(
  "%s renders per-role and union experience in the paper and export, with the personal website",
  (version) => {
    const d = draft(version),
      before = structuredClone(d);
    const { container } = render(
      <DocumentPreview draft={d} asOf={asOf} documentOnly />,
    );
    const paper = container.querySelector("article")!;
    expect(
      paper.querySelector(".document-experience-total")?.textContent,
    ).toContain("Total experience: 2 years");
    expect(
      [...paper.querySelectorAll(".document-role-duration")].map(
        (e) => e.textContent,
      ),
    ).toEqual(["1 year", "1 year 6 months"]);
    expect(
      paper.querySelector('a[href="https://portfolio.example.com"]')
        ?.textContent,
    ).toBe("portfolio.example.com");
    const html = renderPrintHtml(d, "body { color: black; }", undefined, asOf);
    expect(html).toContain("Total experience: 2 years");
    expect(html).toContain("1 year 6 months");
    expect(html).toContain("https://portfolio.example.com");
    expect(d).toEqual(before);
  },
);
it("exports ongoing tenure using the current month rather than an empty reference date", () => {
  const d = draft();
  d.roles = [d.roles[0]];
  d.roles[0].ongoing = fact(true);
  const html = renderPrintHtml(d, "body { color: black; }");
  expect(html).toContain("document-role-duration");
  expect(html).not.toContain("Duration unavailable");
});
it("hiding experience removes both aggregate and per-role duration from the document", () => {
  const d = draft();
  d.presentation.hidden = ["experience"];
  const { container } = render(
    <DocumentPreview draft={d} asOf={asOf} documentOnly />,
  );
  expect(
    container.querySelector(
      ".document-experience-total,.document-role-duration",
    ),
  ).toBeNull();
});
