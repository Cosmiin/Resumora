import type { ReactElement, ReactNode } from "react";
import { Document, Page, pdf, StyleSheet, Text, View } from "@react-pdf/renderer";
import {
  CATEGORY, formatYearMonth, normalizeLayout, type CvContent, type SectionKey,
} from "@resumora/shared";
import { formatRange } from "../cv/page/blocks.ts";
import { getTemplate, type TemplateId } from "../cv/page/templates.ts";
import { t } from "../i18n/t.ts";
import type { LetterDocxInput, LetterHeader } from "./docx.ts";
import { PDF_FONTS, registerPdfFonts } from "./pdf-fonts.ts";

const TEMPLATES = {
  classic: { fontFamily: PDF_FONTS.serif, fontSize: 11, lineHeight: 1.45, gap: 5, sectionGap: 12, accent: "#222222" },
  modern: { fontFamily: PDF_FONTS.sans, fontSize: 11, lineHeight: 1.45, gap: 5, sectionGap: 12, accent: "#17695d" },
  compact: { fontFamily: PDF_FONTS.sans, fontSize: 10, lineHeight: 1.35, gap: 3, sectionGap: 8, accent: "#222222" },
};
const join = (parts: string[]) => parts.filter(Boolean).join(" · ");

export function buildCvPdf(
  content: CvContent,
  template: TemplateId | string | undefined,
): Promise<Blob> {
  registerPdfFonts();
  const selectedTemplate = getTemplate(template);
  // Task 26: showsPhoto draws nothing until the CV has a photo field.
  const theme = TEMPLATES[selectedTemplate.id];
  const styles = StyleSheet.create({
    page: { padding: 54, color: "#222222", fontFamily: theme.fontFamily, fontSize: theme.fontSize, lineHeight: theme.lineHeight },
    header: { marginBottom: 12 },
    name: { fontSize: theme.fontSize + 12, fontWeight: 700, color: theme.accent },
    contact: { fontSize: theme.fontSize - 1 },
    section: { marginTop: theme.sectionGap },
    heading: { fontSize: theme.fontSize + 1, fontWeight: 700, color: theme.accent, marginBottom: theme.gap },
    block: { marginBottom: theme.gap },
    itemHead: { flexDirection: "row", justifyContent: "space-between" },
    itemTitle: { fontWeight: 700, flex: 1, paddingRight: 8 },
    bullet: { paddingLeft: 10 },
  });
  const paragraph = (text: string) => <Text>{text}</Text>;
  const heading = (text: string) => <Text style={styles.heading} minPresenceAhead={24}>{text}</Text>;
  const bullet = (item: { id: string; text: string }) =>
    <Text key={item.id} style={styles.bullet}>{`• ${item.text}`}</Text>;
  const entry = (id: string, title: string, date: string, ...details: string[]) => (
    <View key={id} style={styles.block}>
      <View style={styles.itemHead}>
        <Text style={styles.itemTitle}>{title}</Text>
        {date ? <Text>{date}</Text> : null}
      </View>
      {details.filter(Boolean).map((line, index) => <Text key={index}>{line}</Text>)}
    </View>
  );
  const roles = (items: CvContent["experience"]) => items.map((job) => (
    <View key={job.id} style={styles.block}>
      {entry(
        job.id, job.title, formatRange(job.startDate, job.endDate, job.current, content.locale),
        join([job.company, job.location]), job.description,
      )}
      {job.bullets.map(bullet)}
    </View>
  ));
  const date = (value: string) => formatYearMonth(value, content.locale);
  const b = content.basics;
  const sections: Record<SectionKey, ReactElement[]> = {
    summary: b.summary ? [paragraph(b.summary)] : [],
    achievements: content.achievements.map(bullet),
    experience: roles(content.experience),
    education: content.education.map((item) => entry(
      item.id, item.school, formatRange(item.startDate, item.endDate, false, content.locale),
      [item.degree, item.field].filter(Boolean).join(", "), item.notes,
    )),
    skills: [
      { label: t("cv.page.technical"), items: content.technicalSkills },
      { label: t("cv.page.professional"), items: content.professionalSkills },
    ].filter((row) => row.items.length > 0).map((row) => (
      <Text key={row.label} style={styles.block}>
        <Text style={{ fontWeight: 700 }}>{row.label}: </Text>
        {row.items.map((item) => item.name).join(", ")}
      </Text>
    )),
    languages: content.languages.map((item) => entry(item.id, item.name, "", item.level)),
    certifications: content.certifications.map((item) => entry(
      item.id, item.name, formatRange(item.date, "", false, content.locale), item.issuer,
    )),
    projects: content.projects.map((item) => entry(item.id, item.name, "", item.url, item.description)),
    volunteering: roles(content.volunteering),
    awards: content.awards.map((item) => entry(item.id, item.name, date(item.date), item.issuer, item.description)),
    courses: content.courses.map((item) => entry(item.id, item.name, date(item.date), item.provider)),
    publications: content.publications.map((item) => entry(item.id, item.title, date(item.date), join([item.publisher, item.url]))),
    interests: content.interests.length ? [paragraph(join(content.interests.map((item) => item.name)))] : [],
    other: content.custom.map((item) => (
      <View key={item.id} style={styles.section}>
        {heading(item.title)}
        {item.details ? paragraph(item.details) : null}
      </View>
    )),
  };
  const layout = normalizeLayout(content.layout);
  const titles = join(b.titles);
  const contact = join([b.email, b.phone, b.location, b.website, b.linkedin]);
  return pdf(
    <Document title={b.fullName} language={content.locale}>
      <Page size="A4" style={styles.page}>
        {b.fullName || titles || contact ? (
          <View style={styles.header}>
            {b.fullName ? <Text style={styles.name}>{b.fullName}</Text> : null}
            {titles ? paragraph(titles) : null}
            {contact ? <Text style={styles.contact}>{contact}</Text> : null}
          </View>
        ) : null}
        {layout.order.filter((key) => !layout.hidden.includes(key) && sections[key].length > 0).map((key) => (
          <View key={key} style={key === "other" ? undefined : styles.section}>
            {key !== "other" ? heading(layout.titles[key]?.trim() || CATEGORY[key].label[content.locale]) : null}
            {sections[key].map((body, index) => <View key={index}>{body}</View>)}
          </View>
        ))}
      </Page>
    </Document>,
  ).toBlob();
}

export function buildLetterPdf(
  letter: LetterDocxInput,
  header: LetterHeader,
  locale: string,
): Promise<Blob> {
  registerPdfFonts();
  const styles = StyleSheet.create({
    page: { padding: 54, fontFamily: PDF_FONTS.letter, fontSize: 11, lineHeight: 1.45, color: "#222222" },
    name: { fontSize: 23, fontWeight: 700, marginBottom: 6 },
    paragraph: { marginBottom: 10 },
  });
  const contact = join(header.contact ?? []);
  const recipient = join([header.company ?? "", header.role ?? ""]);
  const paragraphs: ReactNode[] = [
    ...(contact ? [contact] : []),
    new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(header.date ?? new Date()),
    ...(recipient ? [recipient] : []),
    ...(letter.greeting ? [letter.greeting] : []),
    ...letter.paragraphs,
    ...(letter.signOff ? [letter.signOff] : []),
    header.name,
  ];
  return pdf(
    <Document title={header.name} language={locale}>
      <Page size="A4" style={styles.page}>
        <Text style={styles.name}>{header.name}</Text>
        {paragraphs.map((text, index) => <Text key={index} style={styles.paragraph}>{text}</Text>)}
      </Page>
    </Document>,
  ).toBlob();
}
