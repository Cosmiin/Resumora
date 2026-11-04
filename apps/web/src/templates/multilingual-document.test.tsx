import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { blankDraft, fact, newRole } from "../base/model";
import {
  builtInDocumentLabels,
  documentLabelKeys,
} from "@resumora/contracts/editor/document-labels";
import { DocumentPreview } from "../components/DocumentContent";
import { renderPrintHtml } from "../export/render";
it.each([
  ["fr", "Expérience professionnelle", "Présent", "ltr"],
  ["ar", "الخبرة المهنية", "الحاضر", "rtl"],
])(
  "uses saved %s labels and direction consistently in preview and print",
  (locale, experience, present, dir) => {
    const d = blankDraft();
    d.language = locale;
    d.documentLocale = locale;
    d.summary.text = "Texte original العربية";
    const labels = Object.fromEntries(
      documentLabelKeys.map((k) => [k, `${locale}:${k}`]),
    );
    labels.experience = experience;
    labels.present = present;
    d.contentLanguage = {
      locale,
      confidence: "high",
      source: "narrative",
      policyVersion: "cv-language/1",
      labels,
    };
    const r = newRole();
    r.title = fact("Director");
    r.company = fact("Organisation");
    r.start = fact({ year: "2020", month: "1" });
    r.ongoing = fact(true);
    d.roles = [r];
    const preview = renderToStaticMarkup(
        <DocumentPreview
          draft={d}
          documentOnly
          asOf={{ year: "2026", month: "1" }}
        />,
      ),
      print = renderPrintHtml(d, ".document{color:black}");
    for (const html of [preview, print]) {
      expect(html).toContain(experience);
      expect(html).toContain(present);
      expect(html).toContain(`dir="${dir}"`);
      expect(html).toContain(`lang="${locale}"`);
      expect(html).not.toContain("Professional experience");
      expect(html).not.toContain("Experiență profesională");
    }
  },
);
it("does not silently export a document without localized resources", () => {
  const d = blankDraft();
  d.language = "fr";
  d.documentLocale = "fr";
  d.summary.text = "Texte";
  expect(
    renderToStaticMarkup(
      <DocumentPreview
        draft={d}
        documentOnly
        asOf={{ year: "2026", month: "1" }}
      />,
    ),
  ).toContain('role="status"');
  expect(() => renderPrintHtml(d, ".document{}")).toThrow(
    "CONTENT_LANGUAGE_LABELS_UNAVAILABLE",
  );
});
