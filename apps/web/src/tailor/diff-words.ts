export type Segment = { text: string; changed: boolean };

/**
 * The after-text as segments, with the words that are new marked `changed` (a word-level longest common
 * subsequence). A word is a run of non-space characters, so punctuation stays with its word; the spaces
 * between two changed words belong to the change, so one inserted phrase is one segment.
 */
export function diffWords(before: string, after: string): Segment[] {
  const tokens = after.split(/(\s+)/).filter((token) => token !== "");
  const words = before.split(/\s+/).filter(Boolean);
  const afterWords = tokens.filter((token) => !/^\s/.test(token));

  // lcs[i][j]: the common length of words[i..] and afterWords[j..].
  const lcs = Array.from({ length: words.length + 1 }, () => new Array<number>(afterWords.length + 1).fill(0));
  for (let i = words.length - 1; i >= 0; i--) {
    for (let j = afterWords.length - 1; j >= 0; j--) {
      lcs[i]![j] = words[i] === afterWords[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }
  const kept = new Set<number>();
  for (let i = 0, j = 0; i < words.length && j < afterWords.length;) {
    if (words[i] === afterWords[j]) { kept.add(j); i++; j++; }
    else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) i++;
    else j++;
  }

  const marks: Segment[] = [];
  let word = 0;
  for (const token of tokens) {
    if (/^\s/.test(token)) marks.push({ text: token, changed: false });
    else marks.push({ text: token, changed: !kept.has(word++) });
  }
  // Spaces between two changed words join the change.
  marks.forEach((mark, i) => {
    if (/^\s/.test(mark.text) && marks[i - 1]?.changed && marks[i + 1]?.changed) mark.changed = true;
  });
  const segments: Segment[] = [];
  for (const mark of marks) {
    const last = segments[segments.length - 1];
    if (last && last.changed === mark.changed) last.text += mark.text;
    else segments.push({ ...mark });
  }
  return segments;
}
