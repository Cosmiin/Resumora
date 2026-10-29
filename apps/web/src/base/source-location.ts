/** Only complete, uniquely matched PDF text runs qualify as located evidence.
 * Coordinates come from the original PDF text matrix, never a model-generated box. */
export type SourceRun = {
  str: string;
  transform: number[];
  width: number;
  height: number;
  fontName: string;
};
export type SourceBox = { x: number; y: number; width: number; height: number };
const normalized = (s: string) =>
  s.normalize("NFC").replace(/\s+/g, " ").trim();
export function locateQuote(runs: SourceRun[], quote: string): SourceRun[] {
  const target = normalized(quote);
  if (!target) return [];
  const matches: SourceRun[][] = [];
  for (let start = 0; start < runs.length; start++) {
    if (!normalized(runs[start].str)) continue;
    let text = "";
    for (let end = start; end < runs.length; end++) {
      text = normalized(text + " " + runs[end].str);
      if (text === target) {
        matches.push(
          runs.slice(start, end + 1).filter((r) => normalized(r.str)),
        );
        break;
      }
      if (!target.startsWith(text)) break;
    }
  }
  return matches.length === 1 ? matches[0] : [];
}
export function sourceBox(
  run: SourceRun,
  ascent: number,
  descent: number,
  point: (x: number, y: number) => number[],
): SourceBox {
  const [a, b, c, d, x, y] = run.transform;
  const baseline = Math.hypot(a, b),
    vertical = Math.hypot(c, d);
  if (!baseline || !vertical) return { x: 0, y: 0, width: 0, height: 0 };
  const corners = [0, run.width].flatMap((w) =>
    [descent, ascent].map((h) =>
      point(
        x + (a / baseline) * w + (c / vertical) * run.height * h,
        y + (b / baseline) * w + (d / vertical) * run.height * h,
      ),
    ),
  );
  const xs = corners.map((p) => p[0]),
    ys = corners.map((p) => p[1]);
  return {
    x: Math.min(...xs),
    y: Math.min(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
}
