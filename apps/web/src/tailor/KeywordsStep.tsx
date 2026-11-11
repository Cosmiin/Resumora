import type { Locale, MatchScore } from "@resumora/shared";
import { useT } from "../i18n/t.ts";
import { Progress } from "../ui/index.ts";
import { roleMeta, type Role } from "./RolePanel.tsx";

/** The ad's keywords from a score: the ones the CV shows, and the ones it does not (partly there counts as missing). */
export function keywordsOf(score: MatchScore | null): { has: string[]; missing: string[] } {
  const has: string[] = [];
  const missing: string[] = [];
  for (const label of score?.labels ?? []) {
    if (label.kind !== "keyword" || !label.ref.startsWith("k:")) continue;
    const word = label.ref.slice(2).trim();
    if (word) (label.status === "met" ? has : missing).push(word);
  }
  return { has, missing };
}

type Props = {
  /** The base CV's match with the job; null while loading or when there is none. */
  score: MatchScore | null;
  roles: Role[];
  locale: Locale;
  busy: boolean;
  onBack(): void;
  onStart(): void;
  /** Opens the optional tone and extra questions. */
  onSteer(): void;
};

/** Step 2: where the CV stands on the ad's keywords before tailoring, and the roles tailoring will go through. */
export function KeywordsStep({ score, roles, locale, busy, onBack, onStart, onSteer }: Props) {
  const t = useT();
  const { has, missing } = keywordsOf(score);
  const total = has.length + missing.length;
  return <section>
    <h1 className="ui-title">{t("tailor.kw.title")}</h1>
    <p className="ui-lead tailor-lead">{t("tailor.kw.lead")}</p>
    <div className="tailor-cols">
      <div className="ui-sheet ui-stack">
        {total === 0 ? <p>{t("tailor.kw.none")}</p> : <>
          <Progress tone="good" label={t("tailor.kw.bar")} valueText={t("tailor.kw.count", { n: has.length, total })} value={has.length} max={total} />
          {has.length > 0 && <>
            <h2 className="ui-heading" id="tailor-kw-has">{t("tailor.kw.has")}</h2>
            <ul className="tailor-kw" aria-labelledby="tailor-kw-has">{has.map((word) => <li key={word} className="is-has">{word}</li>)}</ul>
          </>}
          {missing.length > 0 && <>
            <h2 className="ui-heading" id="tailor-kw-missing">{t("tailor.kw.missing")}</h2>
            <ul className="tailor-kw" aria-labelledby="tailor-kw-missing">{missing.map((word) => <li key={word} className="is-miss">{word}</li>)}</ul>
          </>}
        </>}
        <p className="ui-coach ui-coach--sm">{t("tailor.kw.coach")}</p>
      </div>
      <div className="ui-sheet ui-stack">
        <h2 className="ui-heading" id="tailor-kw-roles">{t("tailor.kw.roles")}</h2>
        <p className="ui-small ui-muted">{t("tailor.kw.rolesHint")}</p>
        {roles.length === 0 ? <p>{t("tailor.kw.noRoles")}</p>
          : <ul className="tailor-roles" aria-labelledby="tailor-kw-roles">
            {roles.map((role) => <li key={role.id}><b>{role.title.trim() || t("tailor.role.untitled")}</b>
              {roleMeta(role, locale) && <span className="ui-muted">{roleMeta(role, locale)}</span>}</li>)}
          </ul>}
      </div>
    </div>
    <div className="tailor-foot">
      <button type="button" className="ui-btn ui-btn--quiet" disabled={busy} onClick={onBack}>{t("tailor.question.back")}</button>
      <div className="ui-row">
        <button type="button" className="ui-btn ui-btn--quiet" disabled={busy} onClick={onSteer}>{t("tailor.kw.steer")}</button>
        <button type="button" className="ui-btn ui-btn--primary" disabled={busy} onClick={onStart}>{t(busy ? "tailor.kw.starting" : "tailor.kw.start")}</button>
      </div>
    </div>
  </section>;
}
