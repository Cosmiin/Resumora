/** Bounded SSE data decoder shared by the provider and authenticated browser transports. */
export async function* sseData(
  response: Response,
  limit: number,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const reader = response.body?.getReader();
  if (!reader) throw Error("STREAM_MISSING");
  const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false });
  let buffer = "",
    data: string[] = [],
    bytes = 0;
  let rejectAbort: (error: Error) => void = () => {};
  const stopped = new Promise<never>((_, reject) => {
    rejectAbort = reject;
  });
  const abort = () => {
    rejectAbort(Error("STOP"));
    void reader.cancel().catch(() => {});
  };
  signal?.addEventListener("abort", abort, { once: true });
  try {
    if (signal?.aborted) throw Error("STOP");
    while (true) {
      const { value, done } = await Promise.race([reader.read(), stopped]);
      if (value) {
        bytes += value.byteLength;
        if (bytes > limit) throw Error("STREAM_LIMIT");
        buffer += decoder.decode(value, { stream: true });
      }
      if (done) buffer += decoder.decode();
      while (true) {
        const match = /\r\n|\n|\r/.exec(buffer);
        if (
          !match ||
          (!done && match[0] === "\r" && match.index === buffer.length - 1)
        )
          break;
        const line = buffer.slice(0, match.index);
        buffer = buffer.slice(match.index + match[0].length);
        if (line === "") {
          if (data.length) {
            yield data.join("\n");
            data = [];
          }
        } else if (line.startsWith("data:"))
          data.push(line.slice(5).replace(/^ /, ""));
      }
      if (done) break; // An unterminated event is not a completed SSE event.
    }
  } finally {
    signal?.removeEventListener("abort", abort);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

/** Decode only the top-level text value; incomplete escapes never reach the UI. */
export function proposalTextPreview(raw: string): string {
  let depth = 0;
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === "{" || raw[i] === "[") depth++;
    else if (raw[i] === "}" || raw[i] === "]") depth--;
    else if (raw[i] === '"') {
      const start = i++;
      for (; i < raw.length; i++) {
        if (raw[i] === "\\") i++;
        else if (raw[i] === '"') break;
      }
      if (i >= raw.length) return "";
      if (depth !== 1) continue;
      let key: string;
      try {
        key = JSON.parse(raw.slice(start, i + 1));
      } catch {
        return "";
      }
      const tail = /^\s*:\s*"/.exec(raw.slice(i + 1));
      if (key !== "text" || !tail) continue;
      let value = "";
      for (let j = i + 1 + tail[0].length; j < raw.length; j++) {
        const ch = raw[j];
        if (ch === '"') break;
        if (ch !== "\\") {
          if (ch < " ") break;
          value += ch;
          continue;
        }
        if (++j >= raw.length) break;
        const escaped = raw[j];
        if (escaped === "u") {
          const hex = raw.slice(j + 1, j + 5);
          if (!/^[a-f\d]{4}$/i.test(hex)) break;
          value += String.fromCharCode(parseInt(hex, 16));
          j += 4;
        } else {
          const escapes: Record<string, string> = {
            '"': '"',
            "\\": "\\",
            "/": "/",
            b: "\b",
            f: "\f",
            n: "\n",
            r: "\r",
            t: "\t",
          };
          if (!(escaped in escapes)) break;
          value += escapes[escaped];
        }
      }
      return value.replace(/[\uD800-\uDBFF]$/, "");
    }
  }
  return "";
}
