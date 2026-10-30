import { getDocument } from "pdfjs-dist";
export type PdfExpectation = {
  text: string;
  links: string[];
  paper: "A4" | "Letter";
};
export type PdfReport = { pages: number; characters: number; bytes: number };
export const comparableText = (text: string) =>
  text
    .normalize("NFKC")
    .toLocaleLowerCase("en-GB")
    .replace(/[^\p{L}\p{N}+#%&/@]/gu, "");

/** Checks the returned bytes, never an HTML proxy or a provider's success flag. */
export async function validatePdf(
  bytes: Uint8Array,
  expected: PdfExpectation,
): Promise<PdfReport> {
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
  const task = getDocument({
    data: bytes.slice(),
    useSystemFonts: false,
    disableFontFace: true,
    stopAtErrors: true,
  });
  try {
    const pdf = await task.promise;
    if (pdf.numPages < 1 || pdf.numPages > 20)
      throw new Error("PDF_PAGE_LIMIT");
    const permissions = await pdf.getPermissions();
    // Renderer output must remain unrestricted/searchable.
    if (permissions !== null) throw new Error("PDF_RESTRICTED");
    let text = "";
    const links: string[] = [];
    const [width, height] =
      expected.paper === "A4" ? [595.28, 841.89] : [612, 792];
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number);
      const viewport = page.getViewport({ scale: 1 });
      if (
        Math.abs(viewport.width - width) > 2 ||
        Math.abs(viewport.height - height) > 2
      )
        throw new Error("PDF_PAGE_SIZE");
      const content = await page.getTextContent({ disableNormalization: true });
      let count = 0;
      for (const item of content.items) {
        if (!("str" in item)) continue;
        text += item.str + " ";
        if (!item.str.trim()) continue;
        count += item.str.length;
        const [a, b, , , x, y] = item.transform;
        const fontHeight = Math.hypot(a, b);
        if (
          ![x, y, item.width, fontHeight].every(Number.isFinite) ||
          x < 0 ||
          x + item.width > viewport.width + 1 ||
          y < 0 ||
          y + fontHeight > viewport.height + 1
        )
          throw new Error("PDF_TEXT_OUTSIDE_PAGE");
        if (
          !item.fontName ||
          !content.styles[item.fontName] ||
          /[\u0000\uFFFD]/u.test(item.str)
        )
          throw new Error("PDF_GLYPH_INVALID");
      }
      if (!count) throw new Error("PDF_EMPTY_PAGE");
      for (const annotation of await page.getAnnotations())
        if (annotation.subtype === "Link" && typeof annotation.url === "string")
          links.push(annotation.url);
      page.cleanup();
    }
    const actual = comparableText(text),
      wanted = comparableText(expected.text);
    if (!wanted || actual !== wanted) throw new Error("PDF_CONTENT_MISMATCH");
    if (expected.links.some((link) => !links.includes(link)))
      throw new Error("PDF_LINK_MISSING");
    return {
      pages: pdf.numPages,
      characters: text.length,
      bytes: bytes.length,
    };
  } finally {
    await task.destroy();
  }
}
