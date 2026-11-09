import { getTemplate, type TemplateId } from "../cv/page/templates.ts";

/** One way to lay out the CV: the template's spacing or the tighter one, at a body font size in points. */
export type FitStep = { tight: boolean; fontSize: number };

/** Body text size each template starts at, and the smallest the export may shrink it to (owner's ruling, 2026-11-09). */
const FONT: Record<TemplateId, { start: number; min: number }> = {
  classic: { start: 11, min: 10 },
  modern: { start: 11, min: 10 },
  compact: { start: 10, min: 9.5 },
};

/** The template as is, then tighter spacing, then the body font 0.5pt smaller at a time down to the minimum. */
export function fitSteps(template: TemplateId | string | undefined): FitStep[] {
  const { start, min } = FONT[getTemplate(template).id];
  const steps: FitStep[] = [{ tight: false, fontSize: start }];
  for (let size = start; size >= min; size -= 0.5) steps.push({ tight: true, fontSize: size });
  return steps;
}

/** Renders each step in order and keeps the first one within `maxPages`; if none fits, the last (smallest) one. */
export async function fitToPages<T>(
  steps: FitStep[],
  render: (step: FitStep) => Promise<{ result: T; pages: number }>,
  maxPages: number,
): Promise<{ step: FitStep; result: T; pages: number; fits: boolean }> {
  let last: { step: FitStep; result: T; pages: number; fits: boolean } | undefined;
  for (const step of steps) {
    const { result, pages } = await render(step);
    last = { step, result, pages, fits: pages <= maxPages };
    if (last.fits) break;
  }
  if (!last) throw new Error("No layout steps to try.");
  return last;
}

/** Pages in a PDF the way react-pdf writes it (plain objects, no compressed object streams). */
export function pdfPageCount(bytes: Uint8Array): number {
  const text = new TextDecoder("latin1").decode(bytes);
  return text.match(/\/Type\s*\/Page(?![A-Za-z])/g)?.length ?? 0;
}
