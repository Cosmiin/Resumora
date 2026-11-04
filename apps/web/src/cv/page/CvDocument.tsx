import type { ReactNode } from "react";
import type { CvContent } from "@resumora/shared";
import { t } from "../../i18n/t.ts";
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

  const b = cv.basics;
  const contact = joinParts([b.email, b.phone, b.location, b.website, b.linkedin]);
  const titles = joinParts(b.titles);
  const hasBasics = !!(b.fullName || titles || contact);

  const skillRows = [
    { key: "technical", label: t("cv.page.technical"), items: cv.technicalSkills, sort: false },
    { key: "professional", label: t("cv.page.professional"), items: cv.professionalSkills, sort: false },
    ...(showUnsorted ? [{ key: "sort", label: t("cv.page.toSort"), items: cv.unclearSkills, sort: true }] : []),
  ].filter((row) => row.items.length > 0);

  const section = (label: string, show: boolean, children: ReactNode) =>
    show ? (
      <section className="cv-section">
        <h2 className="cv-section-label">{label}</h2>
        {children}
      </section>
    ) : null;

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

      {section(
        t("cv.summary"),
        !!b.summary || editable,
        <Block {...ctx}
          gref={{ section: "summary" }}
          label={b.summary ? t("cv.page.editSummary") : t("cv.page.addSummary")}
        >
          <span className={b.summary ? "cv-text" : "cv-text cv-placeholder"}>
            {b.summary || t("cv.page.addSummary")}
          </span>
        </Block>,
      )}

      {section(
        t("cv.experience"),
        cv.experience.length > 0,
        cv.experience.map((job) => {
          const name = job.title || job.company;
          const range = formatRange(job.startDate, job.endDate, job.current, cv.locale);
          return (
            <Block {...ctx} key={job.id} gref={{ section: "experience", itemId: job.id }} label={t("cv.page.edit", { name })}>
              <span className="cv-item-head">
                <span className="cv-item-title">{job.title}</span>
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
      )}

      {section(
        t("cv.education"),
        cv.education.length > 0,
        cv.education.map((edu) => {
          const range = formatRange(edu.startDate, edu.endDate, false, cv.locale);
          return (
            <Block {...ctx}
              key={edu.id}
              gref={{ section: "education", itemId: edu.id }}
              label={t("cv.page.edit", { name: edu.school || edu.degree })}
            >
              <span className="cv-item-head">
                <span className="cv-item-title">{edu.school}</span>
                {range && <span className="cv-item-dates">{range}</span>}
              </span>
              {(edu.degree || edu.field) && <span className="cv-item-sub">{joinParts([edu.degree, edu.field], ", ")}</span>}
              {edu.notes && <span className="cv-text">{edu.notes}</span>}
            </Block>
          );
        }),
      )}

      {section(
        t("cv.skills"),
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
      )}

      {section(
        t("cv.languages"),
        cv.languages.length > 0,
        <div className="cv-inline-items">
          {cv.languages.map((lang) => (
            <Block {...ctx}
              key={lang.id}
              gref={{ section: "languages", itemId: lang.id }}
              label={t("cv.page.edit", { name: lang.name })}
            >
              <span className="cv-item-title">{lang.name}</span>
              {lang.level && <span className="cv-item-sub"> {lang.level}</span>}
            </Block>
          ))}
        </div>,
      )}

      {section(
        t("cv.certifications"),
        cv.certifications.length > 0,
        cv.certifications.map((c) => {
          const date = formatRange(c.date, "", false, cv.locale);
          return (
            <Block {...ctx}
              key={c.id}
              gref={{ section: "certifications", itemId: c.id }}
              label={t("cv.page.edit", { name: c.name })}
            >
              <span className="cv-item-head">
                <span className="cv-item-title">{c.name}</span>
                {date && <span className="cv-item-dates">{date}</span>}
              </span>
              {c.issuer && <span className="cv-item-sub">{c.issuer}</span>}
            </Block>
          );
        }),
      )}

      {section(
        t("cv.projects"),
        cv.projects.length > 0,
        cv.projects.map((p) => (
          <Block {...ctx} key={p.id} gref={{ section: "projects", itemId: p.id }} label={t("cv.page.edit", { name: p.name })}>
            <span className="cv-item-title">{p.name}</span>
            {p.url && <span className="cv-item-sub">{p.url}</span>}
            {p.description && <span className="cv-text">{p.description}</span>}
          </Block>
        )),
      )}

      {cv.custom.map((c) => (
        <section key={c.id} className="cv-section">
          <Block {...ctx} gref={{ section: "custom", itemId: c.id }} label={t("cv.page.edit", { name: c.title })}>
            <span className="cv-section-label">{c.title}</span>
            {c.details && <span className="cv-text">{c.details}</span>}
          </Block>
        </section>
      ))}
    </article>
  );
}
