import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { sampleCv } from "../../test/sample-cv.ts";
import { CvDocument } from "./CvDocument.tsx";
import { getTemplate } from "./templates.ts";

const templateIds = ["classic", "modern", "compact"] as const;

describe("CV templates", () => {
  it("renders the same CV text in every template", () => {
    const cv = sampleCv();
    const { rerender } = render(<CvDocument content={cv} template="classic" showUnsorted />);
    const text = screen.getByRole("article").textContent;
    expect(text).toContain(cv.basics.fullName);
    expect(text).toContain("Management");

    for (const template of templateIds) {
      rerender(<CvDocument content={cv} template={template} showUnsorted />);
      expect(screen.getByRole("article").textContent).toBe(text);
    }
  });

  it.each(templateIds)("applies the %s template class to the CV page", (template) => {
    render(<CvDocument content={sampleCv()} template={template} />);
    expect(screen.getByRole("article")).toHaveClass("cv-page", `cv-template-${template}`);
  });

  it("defaults to Classic when no template is passed", () => {
    render(<CvDocument content={sampleCv()} />);
    expect(screen.getByRole("article")).toHaveClass("cv-template-classic");
  });

  it.each([undefined, "", "unknown", "toString"])("looks up Classic for an unknown or missing id (%s)", (id) => {
    expect(getTemplate(id).id).toBe("classic");
    expect(getTemplate(id).className).toBe("cv-template-classic");
  });
});
