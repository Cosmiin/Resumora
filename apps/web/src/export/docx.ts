import {
  CATEGORY, formatYearMonth, normalizeLayout, type CvContent, type SectionKey,
} from "@resumora/shared";
import { Document, HeadingLevel, ImageRun, Packer, Paragraph, TextRun, type IParagraphOptions } from "docx";
import { formatRange, SKILL_GROUPS } from "../cv/page/blocks.ts";
import { getTemplate, type TemplateId } from "../cv/page/templates.ts";

export type LetterDocxInput = { greeting?: string; paragraphs: string[]; signOff?: string };
export type ExportPhoto = { data: Uint8Array; type: "jpeg" | "png" | "webp" };
export type LetterHeader = {
  name: string;
  contact?: string[];
  company?: string;
  role?: string;
  date?: Date;
};

const STYLES = {
  classic: { font: "Georgia", size: 22, space: 120, line: 276, accent: "222222" },
  modern: { font: "Arial", size: 22, space: 120, line: 276, accent: "2563EB" },
  compact: { font: "Arial", size: 20, space: 70, line: 240, accent: "222222" },
};
const PAGE = {
  size: { width: 11906, height: 16838 },
  margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 },
};
const join = (parts: string[]) => parts.filter(Boolean).join(" · ");

function paragraph(text: string, options: IParagraphOptions = {}) {
  return new Paragraph({
    ...options,
    children: text.split(/\r\n|\r|\n/).map((line, index) =>
      new TextRun({ text: line, ...(index > 0 ? { break: 1 } : {}) })),
  });
}

function pack(children: Paragraph[], style = STYLES.classic): Promise<Blob> {
  return Packer.toBlob(new Document({
    styles: {
      default: {
        document: {
          run: { font: style.font, size: style.size },
          paragraph: { spacing: { after: style.space, line: style.line } },
        },
        title: { run: { font: style.font, size: style.size + 16, bold: true } },
        heading1: {
          run: { font: style.font, size: style.size + 2, bold: true, color: style.accent },
          paragraph: { spacing: { before: style.space * 2, after: style.space }, keepNext: true },
        },
      },
    },
    sections: [{ properties: { page: PAGE }, children }],
  }));
}

export function buildCvDocx(
  content: CvContent,
  template: TemplateId | string | undefined,
  photo?: ExportPhoto,
): Promise<Blob> {
  const selectedTemplate = getTemplate(template);
  const b = content.basics;
  const children: Paragraph[] = [];
  if (selectedTemplate.showsPhoto && b.photo && photo && photo.type !== "webp") {
    // Read the dimensions to fit the whole image within a 96 px square.
    const bytes = new DataView(photo.data.buffer, photo.data.byteOffset, photo.data.byteLength);
    let width = 96;
    let height = 96;
    if (photo.type === "png") {
      width = bytes.getUint32(16);
      height = bytes.getUint32(20);
    } else {
      for (let offset = 2; offset + 8 < bytes.byteLength;) {
        const marker = bytes.getUint16(offset);
        if (marker >= 0xffc0 && marker <= 0xffcf && ![0xffc4, 0xffc8, 0xffcc].includes(marker)) {
          height = bytes.getUint16(offset + 5);
          width = bytes.getUint16(offset + 7);
          break;
        }
        const length = bytes.getUint16(offset + 2);
        if (length < 2) break;
        offset += length + 2;
      }
    }
    const scale = 96 / Math.max(width, height);
    children.push(new Paragraph({ children: [new ImageRun({
      data: photo.data, type: photo.type === "jpeg" ? "jpg" : "png",
      transformation: { width: width * scale, height: height * scale },
    })] }));
  }
  if (b.fullName) children.push(paragraph(b.fullName, { heading: HeadingLevel.TITLE }));
  const titles = join(b.titles);
  if (titles) children.push(paragraph(titles));
  const contact = join([b.email, b.phone, b.location, b.website, b.linkedin]);
  if (contact) children.push(paragraph(contact));

  const entry = (title: string, ...details: string[]) => [
    paragraph(title), ...details.filter(Boolean).map((line) => paragraph(line)),
  ];
  const bullet = (text: string) => paragraph(text, { bullet: { level: 0 } });
  const heading = (text: string) => paragraph(text, { heading: HeadingLevel.HEADING_1 });
  const date = (value: string) => formatYearMonth(value, content.locale);
  const roles = (items: CvContent["experience"]) => items.flatMap((job) => [
    ...entry(
      job.title, join([job.company, job.location]),
      formatRange(job.startDate, job.endDate, job.current, content.locale), job.description,
    ),
    ...job.bullets.map((item) => bullet(item.text)),
  ]);

  const sections: Record<SectionKey, Paragraph[]> = {
    summary: b.summary ? [paragraph(b.summary)] : [],
    achievements: content.achievements.map((item) => bullet(item.text)),
    experience: roles(content.experience),
    education: content.education.flatMap((item) => entry(
      item.school, formatRange(item.startDate, item.endDate, false, content.locale),
      [item.degree, item.field].filter(Boolean).join(", "), item.notes,
    )),
    skills: [
      { label: SKILL_GROUPS[content.locale].technical, items: content.technicalSkills },
      { label: SKILL_GROUPS[content.locale].professional, items: content.professionalSkills },
    ].filter((row) => row.items.length > 0).map((row) =>
      paragraph(`${row.label}: ${row.items.map((item) => item.name).join(", ")}`)),
    languages: content.languages.flatMap((item) => entry(item.name, item.level)),
    certifications: content.certifications.flatMap((item) => entry(item.name, date(item.date), item.issuer)),
    projects: content.projects.flatMap((item) => entry(item.name, item.url, item.description)),
    volunteering: roles(content.volunteering),
    awards: content.awards.flatMap((item) => entry(item.name, date(item.date), item.issuer, item.description)),
    courses: content.courses.flatMap((item) => entry(item.name, date(item.date), item.provider)),
    publications: content.publications.flatMap((item) => entry(item.title, date(item.date), join([item.publisher, item.url]))),
    interests: content.interests.length ? [paragraph(join(content.interests.map((item) => item.name)))] : [],
    other: content.custom.flatMap((item) => [heading(item.title), ...(item.details ? [paragraph(item.details)] : [])]),
  };

  const layout = normalizeLayout(content.layout);
  for (const key of layout.order) {
    if (layout.hidden.includes(key) || sections[key].length === 0) continue;
    if (key !== "other") children.push(heading(layout.titles[key]?.trim() || CATEGORY[key].label[content.locale]));
    children.push(...sections[key]);
  }
  return pack(children, STYLES[selectedTemplate.id]);
}

export function buildLetterDocx(
  letter: LetterDocxInput,
  header: LetterHeader,
  locale: string,
): Promise<Blob> {
  const contact = join(header.contact ?? []);
  const recipient = join([header.company ?? "", header.role ?? ""]);
  return pack([
    paragraph(header.name, { heading: HeadingLevel.TITLE }),
    ...(contact ? [paragraph(contact)] : []),
    paragraph(new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(header.date ?? new Date())),
    ...(recipient ? [paragraph(recipient)] : []),
    ...(letter.greeting ? [paragraph(letter.greeting)] : []),
    ...letter.paragraphs.map((text) => paragraph(text)),
    ...(letter.signOff ? [paragraph(letter.signOff)] : []),
    paragraph(header.name),
  ]);
}
