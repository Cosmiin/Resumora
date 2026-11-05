/** One step of a streamed rewrite. `index` counts blocks from 0 in the order they start. */
export type BlockEvent =
  | { type: "start"; index: number; key: string }
  | { type: "delta"; index: number; text: string }
  | { type: "end"; index: number; text: string };

const MARKER = /^###[ \t]+(\S.*?)[ \t]*$/;

/**
 * Reads the rewrite line format as it streams in:
 *
 *   ### b2        starts a block ("b2" is a bullet id, "new", or "summary")
 *   text...       the block's text, up to the next marker
 *   ### end       closes the open block (end of input does too)
 *
 * Text outside a block is ignored. A half-received line that could still turn into a marker
 * is held back, so a marker never leaks into a delta.
 */
export class BlockParser {
  private pending = "";
  private open: { index: number; text: string } | null = null;
  private count = 0;
  /** True after part of the current line was already shown, so the rest of it is plain text. */
  private midLine = false;

  push(chunk: string): BlockEvent[] {
    const events: BlockEvent[] = [];
    this.pending += chunk;
    let newline = this.pending.indexOf("\n");
    while (newline !== -1) {
      this.line(this.pending.slice(0, newline).replace(/\r$/, ""), true, events);
      this.midLine = false;
      this.pending = this.pending.slice(newline + 1);
      newline = this.pending.indexOf("\n");
    }
    // The unfinished line is only shown if it cannot be the start of a marker.
    if (this.open && this.pending !== "" && (this.midLine || (!this.pending.trimStart().startsWith("#") && this.pending.trim() !== ""))) {
      this.add(this.pending, events);
      this.pending = "";
      this.midLine = true;
    }
    return events;
  }

  end(): BlockEvent[] {
    const events: BlockEvent[] = [];
    if (this.pending !== "") this.line(this.pending.replace(/\r$/, ""), false, events);
    this.pending = "";
    this.close(events);
    return events;
  }

  private line(line: string, hasNewline: boolean, events: BlockEvent[]): void {
    const marker = this.midLine ? null : MARKER.exec(line);
    if (marker) {
      this.close(events);
      const key = marker[1]!;
      if (key.toLowerCase() === "end") return;
      this.open = { index: this.count++, text: "" };
      events.push({ type: "start", index: this.open.index, key });
      return;
    }
    if (this.open) this.add(hasNewline ? `${line}\n` : line, events);
  }

  private add(text: string, events: BlockEvent[]): void {
    this.open!.text += text;
    events.push({ type: "delta", index: this.open!.index, text });
  }

  private close(events: BlockEvent[]): void {
    if (!this.open) return;
    events.push({ type: "end", index: this.open.index, text: this.open.text.trim() });
    this.open = null;
  }
}
