import type { CvContent } from "@resumora/shared";

const MAX_REPORTED = 50;
const MIN_LINE_CHARS = 3;
const WORD_MATCH_SHARE = 0.9;

/** Lower-case, unify look-alike characters, drop bullet marks, collapse spaces. Keeps diacritics. */
export function normalizeForCheck(s: string): string {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[‐‑‒–—−]/g, "-")
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/(^|\n)[\s]*-+[ \t]+/g, "$1")
    .replace(/[•·▪●◦‣*]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Every line of the CV that should be word for word from the file. */
function linesToCheck(c: CvContent): string[] {
  const lines: string[] = [];
  const add = (s: string) => lines.push(s);
  c.basics.summary.split(/(?<=[.!?])\s+/).forEach(add);
  for (const job of [...c.experience, ...c.volunteering]) {
    add(job.company);
    add(job.title);
    add(job.description);
    job.bullets.forEach((b) => add(b.text));
  }
  c.achievements.forEach((b) => add(b.text));
  for (const e of c.education) {
    add(e.degree);
    add(e.school);
  }
  c.languages.forEach((l) => add(l.name));
  c.certifications.forEach((x) => add(x.name));
  for (const p of c.projects) {
    add(p.title);
    add(p.description);
    p.bullets.forEach((b) => add(b.text));
  }
  c.awards.forEach((a) => add(a.name));
  c.courses.forEach((x) => add(x.name));
  c.publications.forEach((p) => add(p.title));
  for (const section of c.custom) {
    add(section.title);
    section.details.split("\n").forEach(add);
  }
  for (const g of [c.technicalSkills, c.professionalSkills, c.unclearSkills]) g.forEach((s) => add(s.name));
  c.interests.forEach((i) => add(i.name));
  return lines;
}

/** True when most words of the line appear in the source, in the same order. */
function wordsInOrder(line: string, sourceWords: string[]): boolean {
  const words = line.split(" ").filter((w) => w.length >= 2);
  if (words.length === 0) return false;
  let at = 0;
  let found = 0;
  for (const w of words) {
    const i = sourceWords.indexOf(w, at);
    if (i >= 0) {
      found++;
      at = i + 1;
    }
  }
  return found / words.length >= WORD_MATCH_SHARE;
}

/**
 * Lines of the organized CV that cannot be found in the file's text (so the model may have changed
 * or invented them). Returns the original lines, at most 50.
 */
export function findUnsourcedLines(content: CvContent, source: string): string[] {
  const joined = source.replace(/[-‐‑‒–—−][ \t]*\r?\n[ \t]*/g, "");
  const norm = normalizeForCheck(joined);
  const squeezed = norm.replace(/ /g, "");
  const sourceWords = norm.split(" ");

  const missing: string[] = [];
  for (const line of linesToCheck(content)) {
    const trimmed = line.trim();
    if (trimmed.length < MIN_LINE_CHARS || missing.includes(trimmed)) continue;
    const n = normalizeForCheck(trimmed);
    if (n.length < MIN_LINE_CHARS) continue;
    if (norm.includes(n) || squeezed.includes(n.replace(/ /g, "")) || wordsInOrder(n, sourceWords)) continue;
    missing.push(trimmed);
    if (missing.length >= MAX_REPORTED) break;
  }
  return missing;
}
