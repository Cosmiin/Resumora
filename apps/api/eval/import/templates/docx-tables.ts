// Case 11: a Word CV that uses a borderless two-column table for layout (left: contact, skills,
// languages, education; right: profile, experience, certifications).
import {
  BorderStyle, Document, HeadingLevel, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType,
} from "docx";
import { fmtDate, fmtRange, mixedSkills, type Case, type Content, type Section } from "../types.ts";

const NONE = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const NO_BORDERS = { top: NONE, bottom: NONE, left: NONE, right: NONE };

const heading = (text: string) =>
  new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 80 }, children: [new TextRun({ text, bold: true })] });
const line = (text: string, opts: { bold?: boolean; gray?: boolean } = {}) =>
  new Paragraph({ children: [new TextRun({ text, bold: opts.bold, color: opts.gray ? "555555" : undefined })] });
const bullet = (text: string) => new Paragraph({ text, bullet: { level: 0 } });
const dot = (...parts: string[]) => parts.filter(Boolean).join(" · ");

function body(sec: Section, c: Content): Paragraph[] {
  const l = c.locale;
  switch (sec.category) {
    case "summary":
      return [line(c.basics.summary)];
    case "experience":
      return c.experience.flatMap((r) => [
        line(r.title, { bold: true }),
        line(dot(r.company, r.location), { gray: true }),
        line(fmtRange(r.startDate, r.endDate, r.current, l), { gray: true }),
        ...(r.description ? [line(r.description)] : []),
        ...r.bullets.map((b) => bullet(b.text)),
      ]);
    case "skills":
      return mixedSkills(c).map(bullet);
    case "education":
      return c.education.flatMap((e) => [
        line([e.degree, e.field].filter(Boolean).join(", "), { bold: true }),
        line(dot(e.school, fmtRange(e.startDate, e.endDate, false, l)), { gray: true }),
      ]);
    case "languages":
      return c.languages.map((x) => line(`${x.name} – ${x.level}`));
    case "certifications":
      return c.certifications.flatMap((x) => [line(x.name, { bold: true }), line(dot(x.issuer, fmtDate(x.date, l)), { gray: true })]);
    default:
      throw new Error(`docx case does not render ${sec.category}`);
  }
}

export async function buildDocx(k: Case): Promise<Buffer> {
  const b = k.content.basics;
  const cell = (cells: Paragraph[], width: number) =>
    new TableCell({ borders: NO_BORDERS, width: { size: width, type: WidthType.PERCENTAGE }, margins: { top: 60, bottom: 60, left: 100, right: 160 }, children: cells });
  const column = (n: number) => k.sections.filter((s) => (s.col ?? 0) === n).flatMap((s) => [heading(s.heading), ...body(s, k.content)]);
  const contact = [
    heading(k.contactTitle ?? "Contact"),
    ...[b.email, b.phone, b.location, b.website, b.linkedin].filter(Boolean).map((t) => line(t)),
  ];
  const table = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { ...NO_BORDERS, insideHorizontal: NONE, insideVertical: NONE },
    rows: [new TableRow({ children: [cell([...contact, ...column(0)], 32), cell(column(1), 68)] })],
  });
  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: b.fullName, bold: true })] }),
          line(b.titles.join(" | "), { gray: true }),
          table,
        ],
      },
    ],
  });
  return Packer.toBuffer(doc);
}
