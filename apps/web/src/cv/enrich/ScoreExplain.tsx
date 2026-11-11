import { CONDITIONAL_PARAMETERS, CORE_PARAMETERS, type Experience, type Grade, type RoleResult } from "@resumora/shared";
import { t } from "../../i18n/t.ts";
import { Dialog } from "../../ui/Dialog.tsx";
import { Progress } from "../../ui/Progress.tsx";

type Props = { open: boolean; onClose(): void; name: string; role: Experience; result: RoleResult };

/** A score can be explained once the role has one. */
export function canExplain(result: RoleResult | undefined): result is RoleResult {
  return result !== undefined && result.score !== null;
}

const CHECKS = ["contribution", "clarity", "specificity", "impact", "concise"] as const;
const SHAPE = ["amount", "repeats", "order"] as const;
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
 * "Understand the score": the role's number, its two parts as bars, one tick for each thing a recruiter looks for,
 * the three checks on the role's shape, and the role's strongest bullet with its five checks. Opens only when asked.
 */
export function ScoreExplain({ open, onClose, name, role, result }: Props) {
  const texts = new Map(role.bullets.map((b) => [b.id, b.text.trim()]));
  // The strongest bullet still on the page; the first one wins a tie.
  const best = result.bullets.filter((b) => texts.get(b.id)).reduce<RoleResult["bullets"][number] | undefined>((top, b) => (!top || b.score > top.score ? b : top), undefined);
  const coverage = result.coverage;
  const lines = result.lines ?? null;
  const grade = (g: Grade | undefined): TickState => ((g ?? "specific") === "specific" ? "yes" : "no");
  return (
    <Dialog open={open} onClose={onClose} title={t("enrich.explain.title", { name })}
      actions={<button type="button" className="ui-btn" onClick={onClose}>{t("enrich.explain.close")}</button>}>
      <div className="se">
        <p className="se-num"><b>{result.score}</b> <small>{t("enrich.end.of100")}</small></p>
        {coverage && lines !== null && (
          <>
            <Progress label={t("enrich.explain.lines")} valueText={String(lines)} value={lines} max={100} />
            <Progress label={t("enrich.explain.coverage")} valueText={String(coverage.score)} value={coverage.score} max={100} />
            <ul className="se-ticks" aria-label={t("enrich.explain.coverageList")}>
              {[...CORE_PARAMETERS, ...CONDITIONAL_PARAMETERS].map((p) => {
                const mark = coverage.marks[p];
                const label = t(`enrich.explain.param.${p}`);
                return <Tick key={p} state={mark === "shown" ? "yes" : mark === "na" ? "na" : "no"}>{mark === "na" ? t("enrich.explain.na", { label }) : label}</Tick>;
              })}
              {SHAPE.map((s) => <Tick key={s} state={coverage.shape[s] ? "yes" : "no"}>{t(`enrich.explain.shape.${s}`)}</Tick>)}
            </ul>
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
