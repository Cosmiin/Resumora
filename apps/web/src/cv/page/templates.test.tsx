import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { sampleCv } from "../../test/sample-cv.ts";
import { CvDocument } from "./CvDocument.tsx";
import { getTemplate } from "./templates.ts";

const templateIds = ["classic", "modern", "compact"] as const;
const signPhoto = vi.hoisted(() => vi.fn());
vi.mock("../../lib/supabase.ts", () => ({
  supabase: { storage: { from: () => ({ createSignedUrl: signPhoto }) } },
}));

beforeEach(() => {
  signPhoto.mockReset().mockResolvedValue({ data: { signedUrl: "https://example.test/photo" }, error: null });
});

describe("CV templates", () => {
  it("declares a header-right photo slot for Classic and Modern, and none for Compact", () => {
    expect(getTemplate("classic").photo).toBe("header-right");
    expect(getTemplate("modern").photo).toBe("header-right");
    expect(getTemplate("compact").photo).toBeNull();
  });

  it("shows photos in default Classic and Modern, and hides them in Compact", async () => {
    const cv = sampleCv();
    cv.basics.photo = { path: "user-a/photo.jpg", x: 50, y: 50, zoom: 1 };
    const { rerender } = render(<CvDocument content={cv} />);
    expect(await screen.findByRole("img", { name: "CV photo" })).toHaveAttribute("src", "https://example.test/photo");
    expect(screen.getByRole("article")).toHaveClass("cv-template-classic");
    rerender(<CvDocument content={cv} template="modern" />);
    expect(screen.getByRole("img", { name: "CV photo" })).toHaveAttribute("src", "https://example.test/photo");
    rerender(<CvDocument content={cv} template="compact" />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

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
