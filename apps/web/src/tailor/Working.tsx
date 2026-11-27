import { useT } from "../i18n/t.ts";
import { Progress } from "../ui/index.ts";

/**
 * The one wait of a tailoring: how many of the CV's parts are written, as a count and a bar, then the match being
 * worked out. The coach's three lines take turns above it, for the eye only.
 */
export function Working({ done, total }: { done: number; total: number }) {
  const t = useT();
  return <section className="tailor-wait">
    <div className="tailor-wait-say ui-coach" aria-hidden="true">
      <p>{t("tailor.working.reading")}</p>
      <p>{t("tailor.working.comparing")}</p>
      <p>{t("tailor.working.writing")}</p>
    </div>
    <p role="status" className="tailor-wait-count">
      {total === 0 ? t("tailor.wait.starting") : done < total ? t("tailor.wait.parts", { done, total }) : t("tailor.wait.scoring")}</p>
    {total > 0 && <Progress tone="good" label={t("tailor.wait.bar")} valueText={t("tailor.kw.count", { n: done, total })} value={done} max={total} />}
  </section>;
}
