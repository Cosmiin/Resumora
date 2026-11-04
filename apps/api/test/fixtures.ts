import JSZip from "jszip";

/** A minimal one-page PDF 1.4 with one Helvetica text line per entry. No lines = a page with no text (like a scan). */
export function makePdf(lines: string[]): Uint8Array {
  const escape = (s: string) => s.replace(/[\\()]/g, (c) => "\\" + c);
  const ops = lines.map((line, i) => `${i === 0 ? "72 720 Td" : "0 -16 Td"} (${escape(line)}) Tj`).join("\n");
  const stream = lines.length ? `BT /F1 12 Tf\n${ops}\nET` : "";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}

/** A minimal .docx with one paragraph per entry. */
export async function makeDocx(paragraphs: string[]): Promise<Uint8Array> {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
  );
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
${paragraphs.map((p) => `<w:p><w:r><w:t xml:space="preserve">${esc(p)}</w:t></w:r></w:p>`).join("\n")}
</w:body></w:document>`,
  );
  return zip.generateAsync({ type: "uint8array" });
}

/** Text long enough to pass the "has text" check (200+ non-space characters). */
export const CV_LINES = [
  "Ana Popescu",
  "Senior Product Manager",
  "ana.popescu@example.test | Bucharest",
  "Experience",
  "Acme SRL, Product Manager, 2019-2024",
  "Led the redesign of the onboarding flow used by 40,000 customers.",
  "Skills: SQL, Airtable, Team leadership, Requirements analysis",
  "Education: University of Bucharest, Computer Science, 2015",
];
