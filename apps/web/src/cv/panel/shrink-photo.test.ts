import { describe, expect, it, vi } from "vitest";
import { cropRectangle, shrinkToFit } from "./shrink-photo.ts";

const blob = (size: number) => new Blob([new Uint8Array(size)], { type: "image/jpeg" });

describe("shrinkToFit", () => {
  it("lowers the quality first, then the size, until the photo fits", async () => {
    // Each step down in quality or scale makes the file smaller; it fits on the second scale.
    const encode = vi.fn(async (scale: number, quality: number) => blob(Math.round(3000 * scale * quality)));
    const result = await shrinkToFit(encode, 1500);
    expect(result!.size).toBeLessThanOrEqual(1500);
    expect(encode.mock.calls[0]).toEqual([1, 0.9]);
    expect(encode.mock.calls.some(([scale]) => scale < 1)).toBe(true);
  });

  it("stops at the first version that fits", async () => {
    const encode = vi.fn(async () => blob(100));
    expect((await shrinkToFit(encode, 1500))!.size).toBe(100);
    expect(encode).toHaveBeenCalledTimes(1);
  });

  it("gives up (null) when nothing fits", async () => {
    const encode = vi.fn(async () => blob(5000));
    expect(await shrinkToFit(encode, 1500)).toBeNull();
  });
});

describe("cropRectangle", () => {
  it.each([
    { width: 200, height: 100, x: 50, y: 50, zoom: 1, expected: { left: 50, top: 0, side: 100 } },
    { width: 200, height: 100, x: 50, y: 50, zoom: 2, expected: { left: 75, top: 25, side: 50 } },
    { width: 200, height: 100, x: 0, y: 50, zoom: 2, expected: { left: 0, top: 25, side: 50 } },
    { width: 100, height: 200, x: 50, y: 100, zoom: 2, expected: { left: 25, top: 150, side: 50 } },
    { width: 200, height: 100, x: 25, y: 75, zoom: 2, expected: { left: 37.5, top: 37.5, side: 50 } },
    { width: 100, height: 100, x: 100, y: 0, zoom: 2, expected: { left: 50, top: 0, side: 50 } },
  ])("matches the page crop for $width x $height at $x/$y, zoom $zoom", ({ width, height, x, y, zoom, expected }) => {
    expect(cropRectangle(width, height, x, y, zoom)).toEqual(expected);
  });
});
