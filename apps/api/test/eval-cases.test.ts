import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { CvContentSchema, defaultLayout, missingCategories } from "@resumora/shared";
import { describe, expect, it } from "vitest";
import { extractText, sniffFormat } from "../src/imports/extract-text.ts";

const CASES = join(import.meta.dirname, "../eval/import/cases");
const folders = readdirSync(CASES).sort();

const withIds = (value: unknown, n = { i: 0 }): unknown => {
  if (Array.isArray(value)) return value.map((v) => withIds(v, n));
  if (value && typeof value === "object") {
    const out = Object.fromEntries(Object.entries(value).map(([k, v]) => [k, withIds(v, n)]));
    return "text" in out || "name" in out || "title" in out || "school" in out ? { id: `x${n.i++}`, ...out } : out;
  }
  return value;
};

describe("evaluation cases", () => {
  it("has the twelve cases", () => {
    expect(folders).toHaveLength(12);
  });

  describe.each(folders)("%s", (folder) => {
    const dir = join(CASES, folder);
    const file = ["cv.pdf", "cv.docx"].find((f) => existsSync(join(dir, f)));
    const key = JSON.parse(readFileSync(join(dir, "expected.json"), "utf8"));

    it("has a file and an answer key that is a valid CV", () => {
      expect(file).toBeDefined();
      const content = { ...(withIds(key.content) as object), layout: defaultLayout() };
      expect(CvContentSchema.safeParse(content).success).toBe(true);
      expect(key.headings.length).toBeGreaterThan(0);
    });

    it("lists the flags the rules give", () => {
      const content = CvContentSchema.parse({ ...(withIds(key.content) as object), layout: defaultLayout() });
      expect(missingCategories(content)).toEqual(key.flags);
    });

    it("has a text layer, except the scan", async () => {
      const bytes = new Uint8Array(readFileSync(join(dir, file!)));
      const format = sniffFormat(bytes)!;
      const { isScan, pages } = await extractText(bytes, format);
      expect(isScan).toBe(folder === "10-scan");
      if (folder === "12-long-four-pages") expect(pages).toBe(4);
    });
  });
});
