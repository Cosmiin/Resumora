import { Fragment, type ReactNode } from "react";
import { CATEGORY, normalizeLayout, type CvContent, type SectionKey } from "@resumora/shared";
import { t } from "../../i18n/t.ts";
import { newSectionBody } from "./NewSections.tsx";
import { blockKey, formatRange, type BlockRef } from "./blocks.ts";

type Props = {
  content: CvContent;
  selected?: BlockRef | null;
  onSelect?: (ref: BlockRef) => void;
  showUnsorted?: boolean;
};

function sameBlock(a: BlockRef | null | undefined, b: BlockRef): boolean {
  return !!a && a.section === b.section && (a.itemId ?? "") === (b.itemId ?? "");
}

const joinParts = (parts: string[], sep = " · ") => parts.filter(Boolean).join(sep);

type BlockProps = Pick<Props, "selected" | "onSelect"> & { gref: BlockRef; label: string; children: ReactNode };

/** A clickable block when editable, a plain block otherwise. */
function Block({ gref, label, children, selected, onSelect }: BlockProps) {
  if (!onSelect) return <div className="cv-block">{children}</div>;
  const isSelected = sameBlock(selected, gref);
  return (
    <button
      type="button"
      className="cv-block cv-block-button"
      data-block={blockKey(gref)}
      aria-label={label}
      aria-pressed={isSelected}
      onClick={() => onSelect(gref)}
    >
      {isSelected && <span className="cv-editing-tag">{t("cv.page.editing")}</span>}
      {children}
    </button>
  );
}

export function CvDocument({ content: cv, selected, onSelect, showUnsorted }: Props) {
  const editable = !!onSelect;

  const ctx = { selected, onSelect };

  // A new, still blank item gets "New entry" as its button name and, while editing, a muted line
  // so it can be seen and clicked on the page.
  const untitled = t("panel.title.untitled");
  const editLabel = (name: string) => t("cv.page.edit", { name: name || untitled });
  const itemTitle = (text: string, name: string, className = "cv-item-title") =>
    editable && !name ? <span className={`${className} cv-placeholder`}>{untitled}</span> : <span className={className}>{text}</span>;

  const b = cv.basics;
  const contact = joinParts([b.email, b.phone, b.location, b.website, b.linkedin]);
  const titles = joinParts(b.titles);
  const hasBasics = !!(b.fullName || titles || contact);

  const skillRows = [
    { key: "technical", label: t("cv.page.technical"), items: cv.technicalSkills, sort: false },
    { key: "professional", label: t("cv.page.professional"), items: cv.professionalSkills, sort: false },
    ...(showUnsorted ? [{ key: "sort", label: t("cv.page.toSort"), items: cv.unclearSkills, sort: true }] : []),
  ].filter((row) => row.items.length > 0);

  const layout = normalizeLayout(cv.layout);
  const heading = (key: SectionKey) => layout.titles[key]?.trim() || CATEGORY[key].label[cv.locale];
  const section = (key: SectionKey, show: boolean, children: ReactNode) =>
    show ? (
      <section className="cv-section">
        <h2 className="cv-section-label">{heading(key)}</h2>
        {children}
      </section>
    ) : null;


  // Sections added in format v2 are read-only for now.
  const roleRange = (start: string, end: string, current: boolean) => formatRange(start, end, current, cv.locale);
  const newSection = (key: SectionKey) => {
    const { show, body } = newSectionBody(key, cv, roleRange);
    return section(key, show, body);
  };

  const sections: Record<SectionKey, ReactNode> = {
    achievements: newSection("achievements"),
    summary: section(
        "summary",
        !!b.summary || editable,
        <Block {...ctx}
          gref={{ section: "summary" }}
          label={b.summary ? t("cv.page.editSummary") : t("cv.page.addSummary")}
        >
          <span className={b.summary ? "cv-text" : "cv-text cv-placeholder"}>
            {b.summary || t("cv.page.addSummary")}
          </span>
        </Block>,
    ),

    experience: section(
        "experience",
        cv.experience.length > 0,
        cv.experience.map((job) => {
          const name = job.title || job.company;
          const range = formatRange(job.startDate, job.endDate, job.current, cv.locale);
          return (
            <Block {...ctx} key={job.id} gref={{ section: "experience", itemId: job.id }} label={editLabel(name)}>
              <span className="cv-item-head">
                {itemTitle(job.title, name)}
                {range && <span className="cv-item-dates">{range}</span>}
              </span>
              {(job.company || job.location) && (
                <span className="cv-item-sub">{joinParts([job.company, job.location])}</span>
              )}
              {job.description && <span className="cv-text">{job.description}</span>}
              {job.bullets.length > 0 && (
                <ul className="cv-bullets">
                  {job.bullets.map((bullet) => (
                    <li key={bullet.id}>{bullet.text}</li>
                  ))}
                </ul>
              )}
            </Block>
          );
        }),
    ),

    education: section(
        "education",
        cv.education.length > 0,
        cv.education.map((edu) => {
          const range = formatRange(edu.startDate, edu.endDate, false, cv.locale);
          return (
            <Block {...ctx}
              key={edu.id}
              gref={{ section: "education", itemId: edu.id }}
              label={editLabel(edu.school || edu.degree)}
            >
              <span className="cv-item-head">
                {itemTitle(edu.school, edu.school || edu.degree)}
                {range && <span className="cv-item-dates">{range}</span>}
              </span>
              {(edu.degree || edu.field) && <span className="cv-item-sub">{joinParts([edu.degree, edu.field], ", ")}</span>}
              {edu.notes && <span className="cv-text">{edu.notes}</span>}
            </Block>
          );
        }),
    ),

    skills: section(
        "skills",
        skillRows.length > 0,
        <Block {...ctx} gref={{ section: "skills" }} label={t("cv.page.editSkills")}>
          {skillRows.map((row) => (
            <span key={row.key} className="cv-skill-row">
              <span className="cv-skill-label">{row.label}</span>
              <span className="cv-chips">
                {row.items.map((skill) => (
                  <span key={skill.id} className={row.sort ? "cv-chip cv-chip-sort" : "cv-chip"}>
                    {skill.name}
                  </span>
                ))}
              </span>
            </span>
          ))}
        </Block>,
    ),

    languages: section(
        "languages",
        cv.languages.length > 0,
        <div className="cv-inline-items">
          {cv.languages.map((lang) => (
            <Block {...ctx}
              key={lang.id}
              gref={{ section: "languages", itemId: lang.id }}
              label={editLabel(lang.name)}
            >
              {itemTitle(lang.name, lang.name)}
              {lang.level && <span className="cv-item-sub"> {lang.level}</span>}
            </Block>
          ))}
        </div>,
    ),

    certifications: section(
        "certifications",
        cv.certifications.length > 0,
        cv.certifications.map((c) => {
          const date = formatRange(c.date, "", false, cv.locale);
          return (
            <Block {...ctx}
              key={c.id}
              gref={{ section: "certifications", itemId: c.id }}
              label={editLabel(c.name)}
            >
              <span className="cv-item-head">
                {itemTitle(c.name, c.name)}
                {date && <span className="cv-item-dates">{date}</span>}
              </span>
              {c.issuer && <span className="cv-item-sub">{c.issuer}</span>}
            </Block>
          );
        }),
    ),

    projects: section(
        "projects",
        cv.projects.length > 0,
        cv.projects.map((p) => (
          <Block {...ctx} key={p.id} gref={{ section: "projects", itemId: p.id }} label={editLabel(p.name)}>
            {itemTitle(p.name, p.name)}
            {p.url && <span className="cv-item-sub">{p.url}</span>}
            {p.description && <span className="cv-text">{p.description}</span>}
          </Block>
        )),
    ),

    volunteering: newSection("volunteering"),
    awards: newSection("awards"),
    courses: newSection("courses"),
    publications: newSection("publications"),
    interests: newSection("interests"),
    other: cv.custom.length > 0 && (
      <>
      {cv.custom.map((c) => (
        <section key={c.id} className="cv-section">
          <Block {...ctx} gref={{ section: "custom", itemId: c.id }} label={editLabel(c.title)}>
            {itemTitle(c.title, c.title, "cv-section-label")}
            {c.details && <span className="cv-text">{c.details}</span>}
          </Block>
        </section>
      ))}
      </>
    ),
  };

  return (
    <article className="cv-page" aria-label={t("cv.page.label")}>
      {(hasBasics || editable) && (
        <header className="cv-header">
          <Block {...ctx}
            gref={{ section: "basics" }}
            label={b.fullName ? t("cv.page.editDetails") : t("cv.page.addName")}
          >
            <span className={b.fullName ? "cv-name" : "cv-name cv-placeholder"}>
              {b.fullName || t("cv.page.addName")}
            </span>
            {titles && <span className="cv-titles">{titles}</span>}
            {contact && <span className="cv-contact">{contact}</span>}
          </Block>
        </header>
      )}

      {layout.order.filter((key) => !layout.hidden.includes(key)).map((key) => (
        <Fragment key={key}>{sections[key]}</Fragment>
      ))}
    </article>
  );
}
