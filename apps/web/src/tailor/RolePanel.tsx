import type { CvContent, Locale } from "@resumora/shared";
import { formatRange } from "../cv/page/blocks.ts";
import { t } from "../i18n/t.ts";
import "../styles/focus.css";

export type Role = CvContent["experience"][number];

/** The role a proposal changes: its own fields (by role id) or one of its bullets. */
export const roleOf = (cv: CvContent, itemId: string): Role | undefined =>
  cv.experience.find((role) => role.id === itemId || role.bullets.some((bullet) => bullet.id === itemId));

/** "Emedi · Mar 2021 – Present": company and dates, whichever the CV has. */
export const roleMeta = (role: Role, locale: Locale) =>
  [role.company.trim(), formatRange(role.startDate, role.endDate, role.current, locale)].filter(Boolean).join(" · ");

export function RoleHeading({ role, locale }: { role: Role; locale: Locale }) {
  return <div className="tailor-role-head">
    <h3>{role.title.trim() || t("tailor.role.untitled")}</h3>
    <p>{roleMeta(role, locale)}</p>
  </div>;
}

/**
 * The role a question is about, as in enrichment: its current wording, with the bullet the question points at
 * glowing (marigold edge), or "About the whole role" when it points at none.
 */
export function RolePanel({ role, locale, bulletId }: { role: Role; locale: Locale; bulletId?: string }) {
  const pointed = role.bullets.some((bullet) => bullet.id === bulletId);
  return <aside className="tailor-role" aria-label={t("tailor.role.label")}>
    <p className="tailor-eyebrow">{t("tailor.role.eyebrow")}</p>
    <RoleHeading role={role} locale={locale} />
    {!pointed && <p><span className="fm-tag">{t("tailor.role.whole")}</span></p>}
    {role.description.trim() && <p className="tailor-role-text">{role.description}</p>}
    {role.bullets.length > 0 && <ul className="fm-bullets">
      {role.bullets.map((bullet) => <li key={bullet.id} className={bullet.id === bulletId ? "fm-bullet is-current" : "fm-bullet"}
        aria-current={bullet.id === bulletId ? "true" : undefined}><span>{bullet.text}</span></li>)}
    </ul>}
  </aside>;
}
