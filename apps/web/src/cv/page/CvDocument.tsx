import { Fragment, useEffect, useState, type ReactNode } from "react";
import { CATEGORY, normalizeLayout, type CvContent, type SectionKey } from "@resumora/shared";
import { t } from "../../i18n/t.ts";
import { supabase } from "../../lib/supabase.ts";
import { newSectionBody } from "./NewSections.tsx";
import { formatRange } from "./blocks.ts";
import { getTemplate, type TemplateId } from "./templates.ts";
import "./templates.css";

type Props = {
  content: CvContent;
  showUnsorted?: boolean;
  template?: TemplateId;
};

const joinParts = (parts: string[], sep = " · ") => parts.filter(Boolean).join(sep);

function Block({ children }: { children: ReactNode }) {
  return <div className="cv-block">{children}</div>;
}

/** The CV as it will print: read-only (History preview and the import review). */
export function CvDocument({ content: cv, showUnsorted, template = "classic" }: Props) {
  const itemTitle = (text: string, className = "cv-item-title") => <span className={className}>{text}</span>;

  const b = cv.basics;
  const photo = getTemplate(template).showsPhoto ? b.photo : null;
  const path = photo?.path;
  const [signedPhoto, setSignedPhoto] = useState<{ path: string; url: string } | null>(null);
  const photoUrl = path && signedPhoto?.path === path ? signedPhoto.url : null;
  useEffect(() => {
    if (!path) return;
    let active = true;
    supabase.storage.from("cv-photos").createSignedUrl(path, 3600).then(({ data, error }) => {
      if (active) setSignedPhoto(!error && data ? { path, url: data.signedUrl } : null);
    }).catch(() => { if (active) setSignedPhoto(null); });
    return () => { active = false; };
  }, [path]);
  const contact = joinParts([b.email, b.phone, b.location, b.website, b.linkedin]);
  const titles = joinParts(b.titles);
  const hasBasics = !!(b.fullName || titles || contact || photoUrl);

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
        !!b.summary,
        <Block>
          <span className="cv-text">{b.summary}</span>
        </Block>,
    ),

    experience: section(
        "experience",
        cv.experience.length > 0,
        cv.experience.map((job) => {
          const range = formatRange(job.startDate, job.endDate, job.current, cv.locale);
          return (
            <Block key={job.id}>
              <span className="cv-item-head">
                {itemTitle(job.title)}
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
            <Block key={edu.id}>
              <span className="cv-item-head">
                {itemTitle(edu.school)}
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
        <Block>
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
            <Block key={lang.id}>
              {itemTitle(lang.name)}
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
            <Block key={c.id}>
              <span className="cv-item-head">
                {itemTitle(c.name)}
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
          <Block key={p.id}>
            {itemTitle(p.name)}
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
          <Block>
            {itemTitle(c.title, "cv-section-label")}
            {c.details && <span className="cv-text">{c.details}</span>}
          </Block>
        </section>
      ))}
      </>
    ),
  };

  return (
    <article className={`cv-page ${getTemplate(template).className}`} aria-label={t("cv.page.label")}>
      {hasBasics && (
        <header className="cv-header" style={{ display: "flow-root" }}>
          {photo && photoUrl && (
            <div style={{ width: 96, height: 96, overflow: "hidden", float: "right", marginInlineStart: "var(--space-4)" }}>
              <img src={photoUrl} alt={t("cv.photo.alt")} onError={() => setSignedPhoto(null)}
                style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: `${photo.x}% ${photo.y}%`,
                  transform: `scale(${photo.zoom})`, transformOrigin: `${photo.x}% ${photo.y}%` }} />
            </div>
          )}
          <Block>
            {b.fullName && <span className="cv-name">{b.fullName}</span>}
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
