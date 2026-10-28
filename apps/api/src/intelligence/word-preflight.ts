import { Inflate } from "fflate";
import * as CFB from "cfb";
import {
  documentFormat,
  documentLimits,
  type DocumentFormat,
  type ProcessedDocument,
} from "@resumora/contracts/intelligence/model";
/** Container/text-size admission only; the provider's documented native reader interprets Word content. No Office process. */
export async function preflightWord(
  format: DocumentFormat,
  bytes: Uint8Array,
): Promise<ProcessedDocument> {
  documentFormat(`upload.${format}`, bytes);
  if (format === "pdf") throw new Error("DOCUMENT_TYPE");
  if (format === "docx") validateDocx(bytes);
  else validateDoc(bytes);
  const hash = Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>),
    ),
  )
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
  const native = bytes as Uint8Array & { toBase64?: () => string };
  let fileBase64: string;
  if (native.toBase64) fileBase64 = native.toBase64();
  else {
    let binary = "";
    for (let i = 0; i < bytes.length; i += 8192)
      binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    fileBase64 = btoa(binary);
  }
  return {
    schemaVersion: "document-pages/1",
    format,
    sha256: hash,
    parserVersion: "word-container-bounds/1",
    pages: [],
    fileBase64,
    warnings: [
      "Word uses native provider text reading. Original pagination and embedded image content are not established; no ten-page claim is made for Word.",
    ],
  };
}
function validateDoc(bytes: Uint8Array) {
  if (
    bytes.length < 512 ||
    bytes[28] !== 254 ||
    bytes[29] !== 255 ||
    ![9, 12].includes(bytes[30])
  )
    throw new Error("DOCUMENT_MALFORMED");
  let cfb: ReturnType<typeof CFB.read>;
  try {
    cfb = CFB.read(bytes, { type: "array" });
  } catch {
    throw new Error("DOCUMENT_MALFORMED");
  }
  if (cfb.FileIndex.length > 256) throw new Error("DOCUMENT_COMPLEXITY");
  let word: Uint8Array | undefined,
    metadata = 0;
  for (const f of cfb.FileIndex) {
    if (/vba|macros|objectpool|encryptedpackage|encryptioninfo/i.test(f.name))
      throw new Error("ACTIVE_DOCUMENT_CONTENT");
    if (f.name === "WordDocument" && f.content)
      word = new Uint8Array(f.content as ArrayLike<number>);
    if (f.content && !["Data", "Pictures"].includes(f.name))
      metadata += f.content.length;
  }
  if (!word || word.length < 32) throw new Error("DOCUMENT_MALFORMED");
  if (
    word[0] === 236 &&
    word[1] === 165 &&
    new DataView(word.buffer, word.byteOffset, word.byteLength).getUint16(
      10,
      true,
    ) & 0x8100
  )
    throw new Error("DOCUMENT_ENCRYPTED");
  // DOC stores text in the WordDocument stream (compressed single-byte or UTF16).
  // Byte cap conservatively bounds either encoding; do not guess pages from ccpText metadata.
  if (word.length > documentLimits.characters || metadata > 160_000)
    throw new Error("DOCUMENT_TEXT_LIMIT");
}
function validateDocx(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    u16 = (p: number) => view.getUint16(p, true),
    u32 = (p: number) => view.getUint32(p, true);
  const decode = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false });
  let end = -1;
  for (let p = bytes.length - 22; p >= Math.max(0, bytes.length - 65557); p--)
    if (u32(p) === 0x06054b50) {
      end = p;
      break;
    }
  if (
    end < 0 ||
    u16(end + 4) ||
    u16(end + 6) ||
    u16(end + 8) !== u16(end + 10) ||
    u16(end + 10) > 256 ||
    end + 22 + u16(end + 20) !== bytes.length
  )
    throw new Error("DOCUMENT_MALFORMED");
  const entries = u16(end + 10),
    start = u32(end + 16),
    size = u32(end + 12);
  if (start + size !== end) throw new Error("DOCUMENT_MALFORMED");
  let p = start,
    total = 0,
    xmlTotal = 0,
    text = 0,
    hasDocument = false;
  const names = new Set(),
    regions: { from: number; to: number }[] = [];
  for (let i = 0; i < entries; i++) {
    if (p + 46 > end || u32(p) !== 0x02014b50)
      throw new Error("DOCUMENT_MALFORMED");
    const flags = u16(p + 8),
      method = u16(p + 10),
      compressed = u32(p + 20),
      expanded = u32(p + 24),
      nameLength = u16(p + 28),
      extra = u16(p + 30),
      comment = u16(p + 32),
      local = u32(p + 42);
    if (flags & 1) throw new Error("DOCUMENT_ENCRYPTED");
    if (
      ![0, 8].includes(method) ||
      p + 46 + nameLength + extra + comment > end ||
      nameLength > 240 ||
      local + 30 > start
    )
      throw new Error("DOCUMENT_MALFORMED");
    const name = decode.decode(bytes.subarray(p + 46, p + 46 + nameLength));
    if (
      names.has(name) ||
      name.includes("..") ||
      name.startsWith("/") ||
      name.includes("\\") ||
      name.includes("\0")
    )
      throw new Error("DOCUMENT_MALFORMED");
    names.add(name);
    if (/vba|macros|word\/embeddings|\.bin$/i.test(name))
      throw new Error("ACTIVE_DOCUMENT_CONTENT");
    total += expanded;
    if (
      total > 10_000_000 ||
      expanded > 10_000_000 ||
      expanded > Math.max(1024, compressed * 200)
    )
      throw new Error("DOCUMENT_TEXT_LIMIT");
    if (
      u32(local) !== 0x04034b50 ||
      u16(local + 6) !== flags ||
      u16(local + 8) !== method
    )
      throw new Error("DOCUMENT_MALFORMED");
    const localName = u16(local + 26),
      localExtra = u16(local + 28),
      from = local + 30 + localName + localExtra,
      to = from + compressed;
    if (
      to > start ||
      decode.decode(bytes.subarray(local + 30, local + 30 + localName)) !==
        name ||
      regions.some((r) => local < r.to && to > r.from)
    )
      throw new Error("DOCUMENT_MALFORMED");
    if (
      !(flags & 8) &&
      (u32(local + 18) !== compressed || u32(local + 22) !== expanded)
    )
      throw new Error("DOCUMENT_MALFORMED");
    regions.push({ from: local, to });
    if (name.endsWith(".xml")) {
      xmlTotal += expanded;
      if (xmlTotal > 1_000_000 || expanded > 500_000)
        throw new Error("DOCUMENT_TEXT_LIMIT");
      let count = 0;
      const chunks: Uint8Array[] = [];
      const receive = (chunk: Uint8Array) => {
        count += chunk.length;
        if (count > expanded || count > 500_000)
          throw new Error("DOCUMENT_TEXT_LIMIT");
        chunks.push(chunk);
      };
      if (method === 0) receive(bytes.subarray(from, to));
      else {
        const inflate = new Inflate(receive);
        for (let c = from; c < to; c += 512)
          inflate.push(bytes.subarray(c, Math.min(to, c + 512)), c + 512 >= to);
      }
      if (count !== expanded) throw new Error("DOCUMENT_MALFORMED");
      const xmlBytes = new Uint8Array(count);
      let pos = 0;
      for (const chunk of chunks) {
        xmlBytes.set(chunk, pos);
        pos += chunk.length;
      }
      const xml = decode.decode(xmlBytes);
      if (/<!DOCTYPE|<!ENTITY/i.test(xml))
        throw new Error("ACTIVE_DOCUMENT_CONTENT");
      if (
        name.startsWith("word/") &&
        !/styles|settings|fontTable|numbering|theme/i.test(name)
      ) {
        text += xml.replace(/<[^>]*>/g, "").length;
        if (text > documentLimits.characters)
          throw new Error("DOCUMENT_TEXT_LIMIT");
      }
      if (name === "word/document.xml") hasDocument = true;
    }
    p += 46 + nameLength + extra + comment;
  }
  if (p !== end || !hasDocument || !names.has("[Content_Types].xml"))
    throw new Error("DOCUMENT_MALFORMED");
}
