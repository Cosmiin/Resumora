import type { SourceBox } from "./source-location";
export type OcrWord = {
  text: string;
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
};
export type OcrPage = {
  width: number;
  height: number;
  scale: number;
  words: OcrWord[];
};
export type OcrRaster = {
  bytes: Uint8Array;
  width: number;
  height: number;
  scale: number;
};
export type OcrPort = {
  send(packet: unknown): void;
  onMessage(
    receive: (packet: {
      jobId?: string;
      status?: string;
      data?: unknown;
    }) => void,
  ): void;
  onError(receive: () => void): void;
  terminate(): void;
};
type Options = {
  createPort: () => OcrPort;
  corePath: string;
  models: (
    signal: AbortSignal,
  ) => Promise<{ code: string; data: Uint8Array }[]>;
};
const normalized = (text: string) => text.normalize("NFC").toLowerCase().trim();
/** Exact normalized OCR tokens only; never derive boxes from quote length or pick an ambiguous occurrence. */
export function locateOcrQuote(words: OcrWord[], quote: string): OcrWord[] {
  const tokens = quote.normalize("NFC").trim().split(/\s+/).map(normalized);
  if (!tokens.length || !tokens[0]) return [];
  const matches: OcrWord[][] = [];
  for (let start = 0; start + tokens.length <= words.length; start++) {
    const window = words.slice(start, start + tokens.length);
    if (window.every((word, index) => normalized(word.text) === tokens[index]))
      matches.push(window);
  }
  return matches.length === 1 &&
    matches[0].every((word) => word.confidence >= 70)
    ? matches[0]
    : [];
}
export function ocrSourceBox(
  word: OcrWord,
  toPdf: (x: number, y: number) => number[],
  toView: (x: number, y: number) => number[],
): SourceBox {
  const { x0, y0, x1, y1 } = word.bbox;
  const points = [x0, x1].flatMap((x) =>
    [y0, y1].map((y) => {
      const pdf = toPdf(x, y);
      return toView(pdf[0], pdf[1]);
    }),
  );
  const xs = points.map((p) => p[0]),
    ys = points.map((p) => p[1]);
  return {
    x: Math.min(...xs),
    y: Math.min(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
}
function readWords(value: unknown, width: number, height: number): OcrWord[] {
  const data = value as {
    blocks?: { paragraphs?: { lines?: { words?: OcrWord[] }[] }[] }[];
  };
  const words = (data?.blocks ?? []).flatMap((block) =>
    (block.paragraphs ?? []).flatMap((p) =>
      (p.lines ?? []).flatMap((line) => line.words ?? []),
    ),
  );
  if (words.length > 4000) throw new Error("OCR_OUTPUT_LIMIT");
  return words.map((word) => {
    const box = word.bbox;
    if (
      typeof word.text !== "string" ||
      word.text.length > 200 ||
      !Number.isFinite(word.confidence) ||
      word.confidence < 0 ||
      word.confidence > 100 ||
      !box ||
      ![box.x0, box.y0, box.x1, box.y1].every(Number.isFinite) ||
      box.x0 < 0 ||
      box.y0 < 0 ||
      box.x1 > width ||
      box.y1 > height ||
      box.x1 <= box.x0 ||
      box.y1 <= box.y0
    )
      throw new Error("OCR_OUTPUT_INVALID");
    return { text: word.text, confidence: word.confidence, bbox: { ...box } };
  });
}
/** One source/account lifetime, one cancellable worker, at most two pages of in-memory word geometry.
 * Uses the pinned Tesseract 6 worker protocol directly so initialization can also be terminated. */
export class LocalPageOcr {
  private options: Options;
  private port?: OcrPort;
  private ready?: Promise<void>;
  private commands = new Map<
    string,
    { resolve(value: unknown): void; reject(error: Error): void }
  >();
  private sequence = 0;
  private generation = 0;
  private closed = false;
  private running = false;
  private controller?: AbortController;
  private cache = new Map<number, OcrPage>();
  constructor(options: Options) {
    this.options = options;
  }
  private command(action: string, payload: unknown): Promise<unknown> {
    const jobId = String(++this.sequence);
    return new Promise((resolve, reject) => {
      this.commands.set(jobId, { resolve, reject });
      try {
        this.port!.send({
          workerId: "local-source-ocr",
          jobId,
          action,
          payload,
        });
      } catch {
        this.commands.delete(jobId);
        reject(new Error("OCR_UNAVAILABLE"));
      }
    });
  }
  private initialize(signal: AbortSignal) {
    if (this.ready) return this.ready;
    this.port = this.options.createPort();
    const port = this.port;
    this.port.onMessage((packet) => {
      if (this.port !== port) return;
      const pending = this.commands.get(packet.jobId ?? "");
      if (!pending || !["resolve", "reject"].includes(packet.status ?? ""))
        return;
      this.commands.delete(packet.jobId!);
      if (packet.status === "resolve") pending.resolve(packet.data);
      else pending.reject(new Error("OCR_UNAVAILABLE"));
    });
    this.port.onError(() => {
      if (this.port === port) this.cancel();
    });
    this.ready = (async () => {
      const [, models] = await Promise.all([
        this.command("load", {
          options: { lstmOnly: true, corePath: this.options.corePath },
        }),
        this.options.models(signal),
      ]);
      if (signal.aborted) throw new Error("OCR_CANCELLED");
      await this.command("loadLanguage", {
        langs: models,
        options: { gzip: true, cacheMethod: "none", lstmOnly: true },
      });
      await this.command("initialize", {
        langs: models.map((model) => model.code),
        oem: 1,
        config: {},
      });
    })();
    return this.ready;
  }
  forget(page: number) {
    this.cache.delete(page);
  }
  get(page: number) {
    return this.cache.get(page);
  }
  async recognize(
    page: number,
    raster: OcrRaster,
    signal: AbortSignal,
  ): Promise<OcrPage> {
    if (this.closed || signal.aborted) throw new Error("OCR_CANCELLED");
    const cached = this.get(page);
    if (cached) return cached;
    if (this.running) throw new Error("OCR_BUSY");
    if (
      ![raster.width, raster.height].every(
        (n) => Number.isInteger(n) && n > 0 && n <= 2400,
      ) ||
      raster.width * raster.height > 4_000_000 ||
      raster.bytes.length > 16_000_000 ||
      !Number.isFinite(raster.scale) ||
      raster.scale <= 0 ||
      raster.scale > 4
    )
      throw new Error("OCR_RASTER_LIMIT");
    this.running = true;
    const generation = ++this.generation;
    this.controller = new AbortController();
    const stop = () => this.cancel();
    signal.addEventListener("abort", stop, { once: true });
    const timeout = setTimeout(stop, 45_000);
    try {
      const cancelled = new Promise<never>((_, reject) =>
        this.controller!.signal.addEventListener(
          "abort",
          () => reject(new Error("OCR_CANCELLED")),
          { once: true },
        ),
      );
      await Promise.race([this.initialize(this.controller.signal), cancelled]);
      if (generation !== this.generation || signal.aborted || this.closed)
        throw new Error("OCR_CANCELLED");
      const data = await this.command("recognize", {
        image: raster.bytes,
        options: {},
        output: { text: false, blocks: true },
      });
      if (generation !== this.generation || signal.aborted || this.closed)
        throw new Error("OCR_CANCELLED");
      const result = {
        width: raster.width,
        height: raster.height,
        scale: raster.scale,
        words: readWords(data, raster.width, raster.height),
      };
      this.cache.set(page, result);
      if (this.cache.size > 2)
        this.cache.delete(this.cache.keys().next().value!);
      return result;
    } catch (error) {
      if (generation === this.generation) this.cancel();
      throw error;
    } finally {
      signal.removeEventListener("abort", stop);
      clearTimeout(timeout);
      if (generation === this.generation) this.running = false;
    }
  }
  cancel() {
    this.generation++;
    this.running = false;
    this.controller?.abort();
    this.controller = undefined;
    this.port?.terminate();
    this.port = undefined;
    this.ready = undefined;
    for (const pending of this.commands.values())
      pending.reject(new Error("OCR_CANCELLED"));
    this.commands.clear();
  }
  dispose() {
    this.closed = true;
    this.cancel();
    this.cache.clear();
  }
}
