import { describe, expect, it } from "vitest";
import { BlockParser, type BlockEvent } from "./blocks.ts";

const INPUT = "### b2\nCalled 6 suppliers.\nSecond line.\n### new\n  Trained 3 dispatchers.  \n### end\n";

function run(chunks: string[]): BlockEvent[] {
  const parser = new BlockParser();
  return [...chunks.flatMap((c) => parser.push(c)), ...parser.end()];
}
const ends = (events: BlockEvent[]) => events.filter((e) => e.type === "end").map((e) => (e as { text: string }).text);

describe("BlockParser", () => {
  it("parses a full input in one chunk", () => {
    const events = run([INPUT]);
    expect(events.filter((e) => e.type === "start")).toEqual([
      { type: "start", index: 0, key: "b2" },
      { type: "start", index: 1, key: "new" },
    ]);
    expect(ends(events)).toEqual(["Called 6 suppliers.\nSecond line.", "Trained 3 dispatchers."]);
  });

  it("gives the same end texts when split at every character", () => {
    const whole = ends(run([INPUT]));
    expect(ends(run([...INPUT]))).toEqual(whole);
  });

  it("streams deltas that add up to the block text", () => {
    const events = run([...INPUT]);
    const joined = events
      .filter((e): e is Extract<BlockEvent, { type: "delta" }> => e.type === "delta" && e.index === 0)
      .map((e) => e.text)
      .join("");
    expect(joined.trim()).toBe("Called 6 suppliers.\nSecond line.");
  });

  it("never leaks a split marker into a delta", () => {
    const events = run(["### b2\nHello\n#", "## new\nBye\n##", "# end"]);
    expect(events.filter((e) => e.type === "delta").every((e) => !(e as { text: string }).text.includes("#"))).toBe(true);
    expect(ends(events)).toEqual(["Hello", "Bye"]);
  });

  it("closes the last block on end() when ### end is missing", () => {
    expect(ends(run(["### summary\nA short summary."]))).toEqual(["A short summary."]);
  });

  it("ignores text before the first marker", () => {
    const events = run(["Sure, here you go:\n### b1\nText\n### end"]);
    expect(events.filter((e) => e.type === "start")).toHaveLength(1);
    expect(ends(events)).toEqual(["Text"]);
  });

  it("trims leading and trailing spaces in end", () => {
    expect(ends(run(["### b1\n   padded   \n### end\n"]))).toEqual(["padded"]);
  });

  it("emits nothing for empty input", () => {
    expect(run([])).toEqual([]);
  });
});
