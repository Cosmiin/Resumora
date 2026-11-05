import type { JobExtraction } from "@resumora/shared";

type Segment = { text: string; kind?: "must" | "nice" };
type Requirement = Pick<JobExtraction["requirements"][number], "text" | "kind">;

export function markRequirements(text: string, requirements: readonly Requirement[]): Segment[] {
  const matches: { start: number; end: number; kind: "must" | "nice" }[] = [];
  const sorted = requirements.map((requirement) => ({ ...requirement, text: requirement.text.trim() }))
    .filter((requirement) => requirement.text.length > 0)
    .sort((a, b) => b.text.length - a.text.length);
  for (const requirement of sorted) {
    const pattern = requirement.text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const found = new RegExp(pattern, "iu").exec(text);
    if (!found) continue;
    const start = found.index;
    const end = start + found[0].length;
    if (matches.some((match) => start < match.end && end > match.start)) continue;
    matches.push({ start, end, kind: requirement.kind });
  }
  if (matches.length === 0) return [{ text }];
  matches.sort((a, b) => a.start - b.start);
  const segments: Segment[] = [];
  let at = 0;
  for (const match of matches) {
    if (at < match.start) segments.push({ text: text.slice(at, match.start) });
    segments.push({ text: text.slice(match.start, match.end), kind: match.kind });
    at = match.end;
  }
  if (at < text.length) segments.push({ text: text.slice(at) });
  return segments;
}
