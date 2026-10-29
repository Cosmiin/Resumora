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
  return { cfb, word };
}
function validateDocx(bytes: Uint8Array, includeText = false): string {
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
  const content: string[] = [];
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
        text += xml.replace(
          /<!\[CDATA\[([\s\S]*?)\]\]>|<[^>]*>/g,
          (_, cdata: string | undefined) => cdata ?? "",
        ).length;
        if (text > documentLimits.characters)
          throw new Error("DOCUMENT_TEXT_LIMIT");
        if (includeText) content.push(xmlText(xml));
      }
      if (name === "word/document.xml") hasDocument = true;
    }
    p += 46 + nameLength + extra + comment;
  }
  if (p !== end || !hasDocument || !names.has("[Content_Types].xml"))
    throw new Error("DOCUMENT_MALFORMED");
  return content.join("\n");
}

function xmlText(xml: string): string {
  let inText = false,
    result = "";
  const entities: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
  };
  for (const token of xml.match(
    /<!\[CDATA\[[\s\S]*?\]\]>|<!--[\s\S]*?-->|<[^>]*>|[^<]+/g,
  ) ?? []) {
    if (/^<(?:[\w.-]+:)?t(?:\s|>)/.test(token)) inText = true;
    else if (/^<\/(?:[\w.-]+:)?t\s*>/.test(token)) inText = false;
    else if (/^<(?:[\w.-]+:)?(?:tab|br|cr)(?:\s|\/|>)/.test(token))
      result += /^<[^>]*tab/.test(token) ? "\t" : "\n";
    else if (/^<\/(?:[\w.-]+:)?(?:p|tr)\s*>/.test(token)) result += "\n";
    else if (inText && token.startsWith("<![CDATA["))
      result += token.slice(9, -3);
    else if (inText && !token.startsWith("<"))
      result += token.replace(
        /&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi,
        (whole, entity: string) => {
          if (entities[entity] !== undefined) return entities[entity];
          const point = entity.startsWith("#x")
            ? parseInt(entity.slice(2), 16)
            : Number(entity.slice(1));
          if (
            !Number.isInteger(point) ||
            point < 1 ||
            point > 0x10ffff ||
            (point >= 0xd800 && point <= 0xdfff)
          )
            throw new Error("DOCUMENT_MALFORMED");
          return String.fromCodePoint(point);
        },
      );
  }
  return result;
}

export function extractWordText(
  format: "doc" | "docx",
  bytes: Uint8Array,
): string {
  documentFormat(`upload.${format}`, bytes);
  let text: string;
  if (format === "docx") text = validateDocx(bytes, true);
  else {
    const { cfb, word } = validateDoc(bytes);
    const view = new DataView(word.buffer, word.byteOffset, word.byteLength);
    const u16 = (at: number) => view.getUint16(at, true),
      u32 = (at: number) => view.getUint32(at, true);
    const tableName = u16(10) & 0x0200 ? "1Table" : "0Table";
    const tableStream = cfb.FileIndex.find(
      (f) => f.name === tableName,
    )?.content;
    if (!tableStream) throw new Error("SOURCE_TEXT_UNAVAILABLE");
    const table = new Uint8Array(tableStream as ArrayLike<number>);
    let at = 34 + u16(32) * 2;
    if (at + 2 > word.length) throw new Error("DOCUMENT_MALFORMED");
    at += 2 + u16(at) * 4;
    if (at + 2 + 34 * 8 > word.length || u16(at) < 34)
      throw new Error("DOCUMENT_MALFORMED");
    const clx = at + 2 + 33 * 8,
      end = u32(clx) + u32(clx + 4);
    at = u32(clx);
    if (end > table.length) throw new Error("DOCUMENT_MALFORMED");
    const tableView = new DataView(
      table.buffer,
      table.byteOffset,
      table.byteLength,
    );
    while (at < end && table[at] === 1) {
      if (at + 3 > end) throw new Error("DOCUMENT_MALFORMED");
      at += 3 + tableView.getUint16(at + 1, true);
    }
    if (at + 5 > end || table[at] !== 2) throw new Error("DOCUMENT_MALFORMED");
    const length = tableView.getUint32(at + 1, true),
      pieces = (length - 4) / 12;
    at += 5;
    if (
      !Number.isInteger(pieces) ||
      pieces < 1 ||
      pieces > documentLimits.characters ||
      at + length > end
    )
      throw new Error("DOCUMENT_MALFORMED");
    const chunks: string[] = [];
    for (let i = 0; i < pieces; i++) {
      const start = tableView.getUint32(at + i * 4, true),
        finish = tableView.getUint32(at + (i + 1) * 4, true);
      if (
        (i === 0 && start !== 0) ||
        finish < start ||
        finish > documentLimits.characters
      )
        throw new Error("DOCUMENT_TEXT_LIMIT");
      const encoded = tableView.getUint32(
        at + (pieces + 1) * 4 + i * 8 + 2,
        true,
      );
      const compressed = !!(encoded & 0x40000000),
        offset = (encoded & 0x3fffffff) / (compressed ? 2 : 1);
      const count = (finish - start) * (compressed ? 1 : 2);
      if (!Number.isInteger(offset) || offset + count > word.length)
        throw new Error("DOCUMENT_MALFORMED");
      chunks.push(
        new TextDecoder(compressed ? "windows-1252" : "utf-16le", {
          fatal: true,
        }).decode(word.subarray(offset, offset + count)),
      );
    }
    text = chunks
      .join("")
      .replace(/[\r\x07]/g, "\n")
      .replace(/[\x00-\x08\x0b-\x1f]/g, "");
  }
  if (text.length > documentLimits.characters)
    throw new Error("DOCUMENT_TEXT_LIMIT");
  if (!text.trim()) throw new Error("SOURCE_TEXT_UNAVAILABLE");
  return text;
}
