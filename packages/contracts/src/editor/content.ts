/** Plain, source-preserving career text. Markers become structure, never HTML. */
export type CareerBlock =
  | { kind: "paragraph"; text: string }
  | { kind: "unordered" | "ordered"; items: string[] };
const marker = /^\s*(?:[-*+•●▪◦‣]\s+|\d{1,3}[.)]\s+)/;
export const stripListMarker = (text: string) => text.replace(marker, "");
export function careerBlocks(text: string): CareerBlock[] {
  const blocks: CareerBlock[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length)
      blocks.push({ kind: "paragraph", text: paragraph.join(" ") });
    paragraph = [];
  };
  let list: Extract<CareerBlock, { items: string[] }> | undefined;
  for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim();
    if (!line) {
      flush();
      list = undefined;
      continue;
    }
    if (marker.test(raw)) {
      flush();
      const kind = /^\s*\d{1,3}[.)]\s+/.test(raw) ? "ordered" : "unordered";
      if (!list || list.kind !== kind) {
        list = { kind, items: [] };
        blocks.push(list);
      }
      list.items.push(stripListMarker(raw));
    } else if (list && /^\s{2,}\S/.test(raw))
      list.items[list.items.length - 1] += " " + line;
    else {
      list = undefined;
      paragraph.push(line);
    }
  }
  flush();
  return blocks;
}
export function replaceRoleIntroduction(
  current: string,
  summary: string,
): string {
  const blocks = careerBlocks(current);
  if (blocks[0]?.kind === "paragraph") blocks.shift();
  return [
    summary.trim(),
    ...blocks.map((b) =>
      b.kind === "paragraph"
        ? b.text
        : b.items
            .map(
              (item, i) =>
                `${b.kind === "ordered" ? `${i + 1}.` : "-"} ${item}`,
            )
            .join("\n"),
    ),
  ].join("\n\n");
}
