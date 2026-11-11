import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { MAX_FOCUS, type Experience, type Locale, type ScoredKind } from "@resumora/shared";
import { t } from "../../i18n/t.ts";
import { Checkbox } from "../../ui/fields.tsx";
import { Stepper } from "../../ui/Progress.tsx";
import { SCORED_LIST, type LineList } from "../edit/lists.ts";
import { roleName } from "../edit/sections/RoleItem.tsx";
import { formatRange } from "../page/blocks.ts";
import { AnswerBox, type Via } from "./AnswerBox.tsx";
import { FocusBar } from "./FocusBar.tsx";

export type PathItem = { item: Experience; kind: ScoredKind };

type Props = {
  /** The scored items the path can visit, in path order: roles first, then projects and volunteering. */
  items: readonly PathItem[];
  /** The lighter sections with items to visit, and how many (items with no lines yet). */
  quick: readonly { section: LineList; count: number }[];
  /** The CV's language, for the dates. */
  locale: Locale;
  /** The language the person reads and speaks to the app in. */
  speech: Locale;
  /** The ids chosen, in path order, and what the person wants their CV to bring out (may be empty). */
  onStart(chosen: string[], focus: string): void;
  onNotNow(): void;
};

/** How many roles start ticked: the most recent ones, which sit first on a CV. */
const TICKED_ROLES = 2;

/** The four steps of the base CV flow, shown on its screens that are not a role. */
export function PathSteps({ current }: { current: number }) {
  return <Stepper label={t("enrich.steps.label")} current={current}
    steps={[t("enrich.steps.upload"), t("enrich.steps.focus"), t("enrich.steps.roles"), t("enrich.steps.result")]} />;
}

const nameOf = ({ item, kind }: PathItem) => roleName(item, SCORED_LIST[kind]);

/** The focus step: which roles get the questions, and anything the person wants their CV to bring out. */
export function PathStart({ items, quick, locale, speech, onStart, onNotNow }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onNotNow();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onNotNow]);
  const roles = items.filter((p) => p.kind === "role");
  const others = items.filter((p) => p.kind !== "role");
  // Ticks are kept by id, so an item whose score arrives late (and joins the list) starts unticked.
  const [picked, setPicked] = useState<ReadonlySet<string> | null>(null);
  // With no role on the list, the first projects or volunteering roles are ticked instead.
  const chosen = picked ?? new Set((roles.length ? roles : others).slice(0, TICKED_ROLES).map((p) => p.item.id));
  const toggle = (id: string) => {
    const next = new Set(chosen);
    if (!next.delete(id)) next.add(id);
    setPicked(next);
  };
  const [focus, setFocus] = useState<{ value: string; via: Via[] }>({ value: "", via: [] });
  const [voiceBusy, setVoiceBusy] = useState(false);
  const focusId = useId();
  const picks = items.filter((p) => chosen.has(p.item.id));
  const first = picks[0];

  const row = (p: PathItem) => (
    <Checkbox key={p.item.id} checked={chosen.has(p.item.id)} onChange={() => toggle(p.item.id)}
      label={<>
        <span><b>{p.item.title.trim() || nameOf(p)}</b>{p.item.company.trim() ? `, ${p.item.company.trim()}` : ""}</span>
        <small>{formatRange(p.item.startDate, p.item.endDate, p.item.current, locale)}</small>
      </>} />
  );

  return createPortal(
    <div className="ui-page focus-mode fm-path" role="dialog" aria-modal="true" aria-label={t("enrich.path.dialog")}>
      <FocusBar onClose={onNotNow} />
      <section className="fm-path-start">
        <PathSteps current={1} />
        <h2 className="fm-q is-big" id="fm-step-title">{t("enrich.path.title")}</h2>
        <p className="fm-lead">{t(items.length ? "enrich.path.line" : "enrich.path.noRoles")}</p>
        {items.length > 0 && (
          <>
            <fieldset className="fm-pickset">
              <legend>{t("enrich.path.which")}</legend>
              <div className="fm-rolepick">
                {roles.map(row)}
                {others.length > 0 && <p className="fm-group-label">{t("enrich.path.group.other")}</p>}
                {others.map(row)}
              </div>
            </fieldset>
            <p className="fm-fine" role="status">
              {t("enrich.path.count", { n: picks.length, total: items.length })} {t("enrich.path.others")}
            </p>
          </>
        )}
        {quick.length > 0 && (
          <p className="fm-fine">
            {t("enrich.path.quick", { sections: quick.map((q) => `${t(`enrich.path.section.${q.section}`)} (${q.count})`).join(", ") })}
          </p>
        )}
        <div className="fm-focus-text">
          <p className="ui-coach" id={focusId}>{t("enrich.path.focusQuestion")}</p>
          <AnswerBox
            question={{ bulletId: "focus", text: t("enrich.path.focusQuestion"), options: [], kind: "detail" }}
            value={focus.value}
            via={focus.via}
            onChange={(value, via) => setFocus({ value: value.slice(0, MAX_FOCUS), via })}
            locale={speech}
            plain
            label={t("enrich.path.focusQuestion")}
            placeholder={t("enrich.path.focusPlaceholder")}
            onBusyChange={setVoiceBusy}
          />
          <p className="fm-fine">{t("enrich.path.focusOptional")}</p>
        </div>
        <div className="fm-foot">
          <button type="button" className="fm-ghost" onClick={onNotNow}>{t("enrich.path.notNow")}</button>
          <button type="button" className="fm-btn" disabled={voiceBusy} onClick={() => onStart(picks.map((p) => p.item.id), focus.value.trim())}>
            {first ? t("enrich.path.start", { title: nameOf(first) }) : t("enrich.focus.continue")}
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}
