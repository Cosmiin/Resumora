/** Strip APP/COM headers added by the canvas encoder after local orientation/color conversion. */
export function stripCanvasJpegMetadata(
  bytes: Uint8Array,
): Uint8Array<ArrayBuffer> {
  if (bytes[0] !== 255 || bytes[1] !== 216) throw Error("canvas");
  const output = new Uint8Array(bytes.length);
  output.set(bytes.subarray(0, 2));
  let pos = 2,
    written = 2;
  while (pos < bytes.length) {
    const start = pos;
    if (bytes[pos++] !== 255) throw Error("canvas");
    while (bytes[pos] === 255) pos++;
    const marker = bytes[pos++];
    // Keep image tables and compressed scan bytes unchanged.
    if (marker === 218 || marker === 217) {
      output.set(bytes.subarray(start), written);
      return output.subarray(0, written + bytes.length - start);
    }
    if (pos + 2 > bytes.length) throw Error("canvas");
    const length = bytes[pos] * 256 + bytes[pos + 1];
    if (length < 2 || pos + length > bytes.length) throw Error("canvas");
    pos += length;
    if ((marker < 224 || marker > 239) && marker !== 254) {
      output.set(bytes.subarray(start, pos), written);
      written += pos - start;
    }
  }
  throw Error("canvas");
}
