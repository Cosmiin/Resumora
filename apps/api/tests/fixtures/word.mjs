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
