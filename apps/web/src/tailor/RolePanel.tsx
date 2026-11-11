import type { CvContent, Locale, ScoredKind } from "@resumora/shared";
import { kindKey } from "./role-done.ts";
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

/**
 * The role a question is about, on its sheet as in enrichment: its current wording, with the line the question
 * points at marked, or "About the whole role" when it points at none.
 */
export function RolePanel({ role, locale, bulletId, kind }: { role: Role; locale: Locale; bulletId?: string; kind?: ScoredKind }) {
  const pointed = role.bullets.some((bullet) => bullet.id === bulletId);
  return <aside className="fm-left" aria-label={t("tailor.role.label")}>
    <p className="ui-label">{t(`tailor.role.eyebrow${kindKey(kind)}`)}</p>
    <p className="fm-role" lang={locale}>{role.title.trim() || t("tailor.role.untitled")}</p>
    <p className="fm-role-meta" lang={locale}>{roleMeta(role, locale)}</p>
    {!pointed && <p className="fm-ptr">{t(`tailor.role.whole${kindKey(kind)}`)}</p>}
    {role.description.trim() && <p className="tailor-role-text" lang={locale}>{role.description}</p>}
    {role.bullets.length > 0 && <ul className={pointed ? "fm-bullets has-current" : "fm-bullets"} lang={locale}>
      {role.bullets.map((bullet) => <li key={bullet.id} className={bullet.id === bulletId ? "fm-bullet is-current" : "fm-bullet"}
        aria-current={bullet.id === bulletId ? "true" : undefined}>
        <span>{bullet.text}</span>
        {bullet.id === bulletId && <span className="fm-ptr" lang="">{t("tailor.role.pointer")}</span>}
      </li>)}
    </ul>}
  </aside>;
}
