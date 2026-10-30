import { zipSync, strToU8 } from "fflate";
import * as CFB from "cfb";
export function docx(text = "Mara Ionescu operations coordinator", extra = {}) {
  return zipSync(
    {
      "[Content_Types].xml": strToU8(
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
      ),
      "_rels/.rels": strToU8(
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
      ),
      "word/document.xml": strToU8(
        `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`,
      ),
      ...extra,
    },
    { level: 0 },
  );
}
export function doc(encrypted = false, size = 1024) {
  const cfb = CFB.utils.cfb_new(),
    stream = new Uint8Array(size);
  stream[0] = 236;
  stream[1] = 165;
  if (encrypted) stream[11] = 1;
  CFB.utils.cfb_add(cfb, "WordDocument", stream);
  return CFB.write(cfb, { type: "array" });
}


export function textDoc(text, compressed = false) {
  const cfb = CFB.utils.cfb_new();
  const content = compressed ? Uint8Array.from(text, (c) => c.charCodeAt(0)) : new Uint8Array(text.length * 2);
  if (!compressed) {
    const view = new DataView(content.buffer);
    for (let i = 0; i < text.length; i++) view.setUint16(i * 2, text.charCodeAt(i), true);
  }
  const word = new Uint8Array(1024 + content.length), fib = new DataView(word.buffer);
  fib.setUint16(0, 0xa5ec, true); fib.setUint16(2, 0x00c1, true);
  fib.setUint32(24, 1024, true); fib.setUint32(28, word.length, true);
  fib.setUint16(32, 14, true); fib.setUint16(62, 22, true); fib.setUint32(76, text.length, true);
  fib.setUint16(152, 93, true); fib.setUint32(418, 0, true); fib.setUint32(422, 21, true);
  word.set(content, 1024);
  const table = new Uint8Array(21), plc = new DataView(table.buffer);
  table[0] = 2; plc.setUint32(1, 16, true); plc.setUint32(9, text.length, true);
  plc.setUint32(15, compressed ? (0x40000000 | 2048) : 1024, true);
  CFB.utils.cfb_add(cfb, "WordDocument", word); CFB.utils.cfb_add(cfb, "0Table", table);
  return CFB.write(cfb, { type: "array" });
}
