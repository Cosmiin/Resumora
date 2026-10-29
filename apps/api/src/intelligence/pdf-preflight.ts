import {
  PDFDocument,
  PDFDict,
  PDFName,
  PDFArray,
  PDFRef,
} from "@cantoo/pdf-lib";
import {
  documentFormat,
  type ProcessedDocument,
} from "@resumora/contracts/intelligence/model";
/** Page-tree admission only: no rendering, OCR, JS execution, filesystem, native process or external fetch. */
export async function preflightPdf(
  bytes: Uint8Array,
): Promise<ProcessedDocument> {
  documentFormat("upload.pdf", bytes);
  if (
    !new TextDecoder("latin1")
      .decode(bytes.subarray(Math.max(0, bytes.length - 2048)))
      .includes("%%EOF")
  )
    throw new Error("DOCUMENT_MALFORMED");
  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(bytes, {
      ignoreEncryption: false,
      updateMetadata: false,
      throwOnInvalidObject: true,
    });
  } catch {
    throw new Error("DOCUMENT_MALFORMED_OR_ENCRYPTED");
  }
  if (doc.isEncrypted) throw new Error("DOCUMENT_ENCRYPTED");
  if (!(doc.catalog instanceof PDFDict)) throw new Error("DOCUMENT_MALFORMED");
  const objects = doc.context.enumerateIndirectObjects();
  if (objects.length > 5000) throw new Error("DOCUMENT_COMPLEXITY");
  const forbidden = new Set([
    "JS",
    "JavaScript",
    "OpenAction",
    "AA",
    "EmbeddedFiles",
    "XFA",
    "RichMediaContent",
  ]);
  let inspected = 0;
  function inspect(value: unknown, depth: number) {
    if (++inspected > 50_000 || depth > 32)
      throw new Error("DOCUMENT_COMPLEXITY");
    if (value instanceof PDFDict) {
      for (const [key, child] of value.entries()) {
        if (
          forbidden.has(key.decodeText()) ||
          (child instanceof PDFName &&
            ["JavaScript", "Launch", "EmbeddedFile"].includes(
              child.decodeText(),
            ))
        )
          throw new Error("ACTIVE_DOCUMENT_CONTENT");
        inspect(child, depth + 1);
      }
    } else if (value instanceof PDFArray) {
      if (value.size() > 5000) throw new Error("DOCUMENT_COMPLEXITY");
      for (let i = 0; i < value.size(); i++) inspect(value.get(i), depth + 1);
    } else if (value && typeof value === "object" && "dict" in value)
      inspect((value as { dict: unknown }).dict, depth + 1);
  }
  for (const [, value] of objects) inspect(value, 0);
  // Traverse actual leaf references; /Count is never accepted as page authority.
  const root = doc.catalog.get(PDFName.of("Pages"));
  const visited = new Set<string>();
  let nodes = 0,
    count = 0;
  function walk(ref: unknown, depth: number) {
    if (
      !(ref instanceof PDFRef) ||
      depth > 32 ||
      ++nodes > 1000 ||
      visited.has(ref.toString())
    )
      throw new Error("DOCUMENT_PAGE_TREE");
    visited.add(ref.toString());
    const item = doc.context.lookup(ref);
    if (!(item instanceof PDFDict)) throw new Error("DOCUMENT_PAGE_TREE");
    const type = item.get(PDFName.of("Type"));
    if (!(type instanceof PDFName)) throw new Error("DOCUMENT_PAGE_TREE");
    if (type.decodeText() === "Page") {
      if (++count > 10) throw new Error("DOCUMENT_PAGES");
      return;
    }
    if (type.decodeText() !== "Pages") throw new Error("DOCUMENT_PAGE_TREE");
    const kids = doc.context.lookup(item.get(PDFName.of("Kids")));
    if (!(kids instanceof PDFArray) || kids.size() > 1000)
      throw new Error("DOCUMENT_PAGE_TREE");
    for (let i = 0; i < kids.size(); i++) walk(kids.get(i), depth + 1);
  }
  walk(root, 0);
  if (count < 1) throw new Error("DOCUMENT_PAGES");
  const hash = Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>),
    ),
  )
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
  // Native base64 when available; bounded fallback uses modest chunks, never spreads a10MB buffer.
  let base64: string;
  const native = bytes as Uint8Array & { toBase64?: () => string };
  if (native.toBase64) base64 = native.toBase64();
  else {
    let binary = "";
    for (let i = 0; i < bytes.length; i += 8192)
      binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    base64 = btoa(binary);
  }
  return {
    schemaVersion: "document-pages/1",
    format: "pdf",
    sha256: hash,
    parserVersion: "cantoo-pdf-lib/2.11.1-page-tree",
    pages: Array.from({ length: count }, (_, i) => ({
      number: i + 1,
      warnings: [
        "Original PDF page is passed to the model; transcription is not independently verified.",
      ],
    })),
    fileBase64: base64,
    warnings: [],
  };
}
