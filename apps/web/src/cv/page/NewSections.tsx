import type { ReactNode } from "react";
import { formatYearMonth, type CvContent, type SectionKey } from "@resumora/shared";

const joinParts = (parts: string[], sep = " · ") => parts.filter(Boolean).join(sep);

function Item({ title, date, sub, text }: { title: string; date?: string; sub?: string; text?: string }) {
  return (
    <div className="cv-block">
      <span className="cv-item-head">
        <span className="cv-item-title">{title}</span>
        {date && <span className="cv-item-dates">{date}</span>}
      </span>
      {sub && <span className="cv-item-sub">{sub}</span>}
      {text && <span className="cv-text">{text}</span>}
    </div>
  );
}

/** What the sections added in format v2 show. They are read-only for now: not clickable. */
export function newSectionBody(
  key: SectionKey,
  cv: CvContent,
  roleRange: (start: string, end: string, current: boolean) => string,
): { show: boolean; body: ReactNode } {
  const date = (value: string) => formatYearMonth(value, cv.locale);
  switch (key) {
    case "achievements":
      return {
        show: cv.achievements.length > 0,
        body: (
          <ul className="cv-bullets">
            {cv.achievements.map((a) => (
              <li key={a.id}>{a.text}</li>
            ))}
          </ul>
        ),
      };
    case "volunteering":
      return {
        show: cv.volunteering.length > 0,
        body: cv.volunteering.map((v) => (
          <div className="cv-block" key={v.id}>
            <span className="cv-item-head">
              <span className="cv-item-title">{v.title}</span>
              <span className="cv-item-dates">{roleRange(v.startDate, v.endDate, v.current)}</span>
            </span>
            {(v.company || v.location) && <span className="cv-item-sub">{joinParts([v.company, v.location])}</span>}
            {v.description && <span className="cv-text">{v.description}</span>}
            {v.bullets.length > 0 && (
              <ul className="cv-bullets">
                {v.bullets.map((bullet) => (
                  <li key={bullet.id}>{bullet.text}</li>
                ))}
              </ul>
            )}
          </div>
        )),
      };
    case "awards":
      return {
        show: cv.awards.length > 0,
        body: cv.awards.map((a) => (
          <Item key={a.id} title={a.name} date={date(a.date)} sub={a.issuer} text={a.description} />
        )),
      };
    case "courses":
      return {
        show: cv.courses.length > 0,
        body: cv.courses.map((c) => <Item key={c.id} title={c.name} date={date(c.date)} sub={c.provider} />),
      };
    case "publications":
      return {
        show: cv.publications.length > 0,
        body: cv.publications.map((p) => (
          <Item key={p.id} title={p.title} date={date(p.date)} sub={joinParts([p.publisher, p.url])} />
        )),
      };
    case "interests":
      return {
        show: cv.interests.length > 0,
        body: <span className="cv-text">{cv.interests.map((i) => i.name).join(" · ")}</span>,
      };
    default:
      return { show: false, body: null };
  }
}
