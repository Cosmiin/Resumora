import { describe, expect, it, vi } from "vitest";
import { fitSteps, fitToPages, pdfPageCount, type FitStep } from "./fit.ts";

describe("fitSteps", () => {
  it("starts with the template as is, then tightens spacing, then lowers the font 0.5pt at a time to the owner's minimum", () => {
    expect(fitSteps("classic")).toEqual([
      { tight: false, fontSize: 11 }, { tight: true, fontSize: 11 },
      { tight: true, fontSize: 10.5 }, { tight: true, fontSize: 10 },
    ]);
    expect(fitSteps("modern").at(-1)).toEqual({ tight: true, fontSize: 10 });
    expect(fitSteps("compact")).toEqual([
      { tight: false, fontSize: 10 }, { tight: true, fontSize: 10 }, { tight: true, fontSize: 9.5 },
    ]);
    expect(fitSteps("unknown")).toEqual(fitSteps("classic"));
  });
});

describe("fitToPages", () => {
  const steps: FitStep[] = fitSteps("classic");

  it("keeps the first step when it already fits, without trying the others", async () => {
    const render = vi.fn(async (step: FitStep) => ({ result: step, pages: 2 }));
    const fitted = await fitToPages(steps, render, 2);
    expect(fitted).toEqual({ step: steps[0], result: steps[0], pages: 2, fits: true });
    expect(render).toHaveBeenCalledTimes(1);
  });

  it("stops at the first step that fits", async () => {
    const pages = [3, 3, 2, 2];
    const render = vi.fn(async (step: FitStep) => ({ result: step, pages: pages[steps.indexOf(step)]! }));
    const fitted = await fitToPages(steps, render, 2);
    expect(fitted).toMatchObject({ step: steps[2], pages: 2, fits: true });
    expect(render).toHaveBeenCalledTimes(3);
  });

  it("returns the smallest step and fits: false when nothing fits", async () => {
    const fitted = await fitToPages(steps, async (step) => ({ result: step, pages: 3 }), 2);
    expect(fitted).toMatchObject({ step: steps.at(-1), pages: 3, fits: false });
  });
});

describe("pdfPageCount", () => {
  it("counts page objects, not the page tree", () => {
    const pdf = "%PDF-1.3\n1 0 obj << /Type /Pages /Count 2 >>\n2 0 obj << /Type /Page /Parent 1 0 R >>\n3 0 obj <</Type/Page/Parent 1 0 R>>\n";
    expect(pdfPageCount(new TextEncoder().encode(pdf))).toBe(2);
  });
});
