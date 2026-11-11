import type { Locale, ScoredKind } from "@resumora/shared";
import { t } from "../i18n/t.ts";
import { RolePanel, type Role } from "./RolePanel.tsx";

/**
 * The wait while a step is compared with the ad: the coach's line (two more lines take turns with it, for the
 * eye only), and, for a role, its sheet with the marker running down its lines.
 */
export function Working({ text, role, locale, kind }: { text: string; role?: Role; locale: Locale; kind?: ScoredKind }) {
  return <section className="tailor-wait">
    <div className="tailor-wait-say ui-coach">
      <p aria-hidden="true">{t("tailor.working.reading")}</p>
      <p role="status">{text}</p>
      <p aria-hidden="true">{t("tailor.working.writing")}</p>
    </div>
    {role && <RolePanel role={role} locale={locale} kind={kind} />}
  </section>;
}
