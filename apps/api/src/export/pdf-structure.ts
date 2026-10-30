import {
  PDFDocument,
  PDFDict,
  PDFName,
  PDFArray,
  PDFRawStream,
} from "@cantoo/pdf-lib";
/** Native Worker-compatible structural complement to the browser's actual PDF
 * text/geometry parser. Font presence alone never substitutes for text comparison.
 */
export async function inspectExportPdf(
  bytes: Uint8Array,
): Promise<{ pages: number; embeddedFonts: number }> {
  if (
    bytes.length < 500 ||
    bytes.length > 10_000_000 ||
    new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-"
  )
    throw new Error("PDF_INVALID");
  if (
    !new TextDecoder()
      .decode(bytes.subarray(Math.max(0, bytes.length - 2048)))
      .includes("%%EOF")
  )
    throw new Error("PDF_INVALID");
  const pdf = await PDFDocument.load(bytes, {
    ignoreEncryption: false,
    updateMetadata: false,
    throwOnInvalidObject: true,
  });
  const pages = pdf.getPages();
  if (pdf.isEncrypted || pages.length < 1 || pages.length > 20)
    throw new Error("PDF_INVALID");
  const objects = pdf.context.enumerateIndirectObjects();
  if (objects.length > 10000) throw new Error("PDF_COMPLEXITY");
  const forbidden = new Set([
    "JS",
    "JavaScript",
    "OpenAction",
    "AA",
    "EmbeddedFiles",
    "XFA",
  ]);
  let visited = 0;
  const inspect = (item: unknown, depth = 0) => {
    if (++visited > 100000 || depth > 32) throw new Error("PDF_COMPLEXITY");
    if (item instanceof PDFDict)
      for (const [key, value] of item.entries()) {
        if (
          forbidden.has(key.decodeText()) ||
          (value instanceof PDFName &&
            ["JavaScript", "Launch", "EmbeddedFile"].includes(
              value.decodeText(),
            ))
        )
          throw new Error("PDF_ACTIVE_CONTENT");
        inspect(value, depth + 1);
      }
    else if (item instanceof PDFArray)
      for (let i = 0; i < item.size(); i++) inspect(item.get(i), depth + 1);
    else if (item instanceof PDFRawStream) inspect(item.dict, depth + 1);
  };
  for (const [, item] of objects) inspect(item);
  let count = 0;
  for (const page of pages) {
    const fonts = page.node.Resources()?.lookup(PDFName.of("Font"));
    if (!(fonts instanceof PDFDict)) throw new Error("PDF_TEXT_MISSING");
    for (const [, ref] of fonts.entries()) {
      const font = pdf.context.lookup(ref);
      if (
        !(font instanceof PDFDict) ||
        !(font.lookup(PDFName.of("ToUnicode")) instanceof PDFRawStream)
      )
        throw new Error("PDF_UNICODE_MAP_MISSING");
      // Chrome emits the bundled variable fonts as embedded Type3 vector glyph
      // programs plus ToUnicode. They remain searchable text; no system font
      // or full-document image is required.
      if (font.get(PDFName.of("Subtype")) === PDFName.of("Type3")) {
        const glyphs = font.lookup(PDFName.of("CharProcs"));
        if (
          !(glyphs instanceof PDFDict) ||
          !glyphs.entries().length ||
          glyphs
            .entries()
            .some(
              ([, ref]) => !(pdf.context.lookup(ref) instanceof PDFRawStream),
            )
        )
          throw new Error("PDF_FONT_NOT_EMBEDDED");
        count++;
        continue;
      }
      const descendants = font.lookup(PDFName.of("DescendantFonts"));
      const leaf =
        descendants instanceof PDFArray ? descendants.lookup(0) : font;
      if (!(leaf instanceof PDFDict)) throw new Error("PDF_FONT_INVALID");
      const descriptor = leaf.lookup(PDFName.of("FontDescriptor"));
      if (
        !(descriptor instanceof PDFDict) ||
        !["FontFile", "FontFile2", "FontFile3"].some(
          (key) => descriptor.lookup(PDFName.of(key)) instanceof PDFRawStream,
        )
      )
        throw new Error("PDF_FONT_NOT_EMBEDDED");
      count++;
    }
  }
  return { pages: pages.length, embeddedFonts: count };
}
