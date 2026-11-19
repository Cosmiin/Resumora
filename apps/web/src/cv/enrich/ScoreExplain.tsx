import { CORE_PARAMETERS, type Experience, type Grade, type RoleResult } from "@resumora/shared";
import { t } from "../../i18n/t.ts";
import { RoleChecklist } from "./Checklist.tsx";
import { Dialog } from "../../ui/Dialog.tsx";
import { Progress } from "../../ui/Progress.tsx";

type Props = { open: boolean; onClose(): void; name: string; role: Experience; result: RoleResult };

/** A score can be explained once the role has one. */
export function canExplain(result: RoleResult | undefined): result is RoleResult {
  return result !== undefined && result.score !== null;
}

const CHECKS = ["contribution", "clarity", "specificity", "impact", "concise"] as const;
type TickState = "yes" | "no" | "na";

function Tick({ state, children }: { state: TickState; children: string }) {
  return (
    <li className={`se-tick is-${state}`}>
      <span className="visually-hidden">{t(`enrich.explain.state.${state}`)} </span>
      {children}
    </li>
  );
}

/**
 * "Understand the score": the role's number; what makes it (the lines, 60%, and the four items every role needs, 40%);
 * what doesn't change it (the shape and worth-adding checklist); and the role's strongest bullet with its five checks.
 * Opens only when asked.
 */
export function ScoreExplain({ open, onClose, name, role, result }: Props) {
  const texts = new Map(role.bullets.map((b) => [b.id, b.text.trim()]));
  // The strongest bullet still on the page; the first one wins a tie.
  const best = result.bullets.filter((b) => texts.get(b.id)).reduce<RoleResult["bullets"][number] | undefined>((top, b) => (!top || b.score > top.score ? b : top), undefined);
  const coverage = result.coverage;
  const lines = result.lines ?? null;
  const shown = coverage ? CORE_PARAMETERS.filter((p) => coverage.marks[p] === "shown").length : 0;
  const grade = (g: Grade | undefined): TickState => ((g ?? "specific") === "specific" ? "yes" : "no");
  return (
    <Dialog open={open} onClose={onClose} title={t("enrich.explain.title", { name })}
      actions={<button type="button" className="ui-btn" onClick={onClose}>{t("enrich.explain.close")}</button>}>
      <div className="se">
        <p className="se-num"><b>{result.score}</b> <small>{t("enrich.end.of100")}</small></p>
        {coverage && lines !== null && (
          <>
            <h3 className="se-sub">{t("enrich.explain.makes")}</h3>
            <Progress label={t("enrich.explain.linesPart")} valueText={String(lines)} value={lines} max={100} />
            <Progress label={t("enrich.explain.corePart")} valueText={t("enrich.explain.coreOf", { n: shown, total: CORE_PARAMETERS.length })}
              value={shown} max={CORE_PARAMETERS.length} />
            <ul className="se-ticks" aria-label={t("enrich.explain.coreList")}>
              {CORE_PARAMETERS.map((p) => (
                <Tick key={p} state={coverage.marks[p] === "shown" ? "yes" : "no"}>{t(`enrich.explain.param.${p}`)}</Tick>
              ))}
            </ul>
            <h3 className="se-sub">{t("enrich.explain.notCounted")}</h3>
            <RoleChecklist result={result} />
            <p className="se-line">{t("enrich.explain.notCountedLead")}</p>
          </>
        )}
        {best && (
          <>
            <h3 className="se-sub">{t("enrich.explain.bullet.title")}</h3>
            <p className="se-line">{t("enrich.explain.bullet.line")}</p>
            <p className="se-bullet">“{texts.get(best.id)}”</p>
            <ul className="se-ticks" aria-label={t("enrich.explain.bullet.checks")}>
              {CHECKS.map((c) => {
                const label = t(`enrich.explain.check.${c}`);
                return <Tick key={c} state={grade(best[c])}>{best[c] === "partial" ? t("enrich.explain.partly", { label }) : label}</Tick>;
              })}
            </ul>
          </>
        )}
      </div>
    </Dialog>
  );
}
