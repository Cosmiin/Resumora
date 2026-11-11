import { useState } from "react";
import { CATEGORY, SECTION_KEYS, missingCategories, newId, normalizeLayout, scoredItems, shownEmptyFlags, type CvContent, type SectionKey } from "@resumora/shared";
import { t } from "../../i18n/t.ts";
import { sectionsOnCv, type CvAction } from "../edit/cvReducer.ts";
import { DragList } from "../edit/DragList.tsx";
import { RoleScoreList } from "../enrich/RoleScoreList.tsx";
import type { RoleScoreState } from "../enrich/useRoleScores.ts";
import { firstFieldKey } from "../edit/sections/renderers.tsx";

type Props = {
  cv: CvContent;
  dispatch(a: CvAction): void;
  /** Ask the page to put the cursor in a field (once it has rendered). */
  onFocusField(fieldKey: string): void;
  /** Sections added this visit that count as present while still empty. */
  opened: ReadonlySet<SectionKey>;
  onOpen(key: SectionKey): void;
  scores?: ReadonlyMap<string, RoleScoreState>;
  /** Base CV only: opens the guided enrichment path (1A). */
  onEnrich?(): void;
  /** Tailored CV: Needs attention lists every shown section that is empty; auto-hidden empty ones don't count. */
  tailored?: boolean;
  /** Wide screens split the overview: "contents" (sections and roles, left of the page) and "coach" (what needs attention, right). */
  part?: "contents" | "coach";
  /** Contents only: scroll the page to a section. */
  onJump?(key: SectionKey): void;
  onRetry?(roleId: string): void;
};

const CUSTOM = "custom";

function Eye({ on }: { on: boolean }) {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
      <path d="M2 10s3-5.5 8-5.5S18 10 18 10s-3 5.5-8 5.5S2 10 2 10z" fill="none" stroke="currentColor" strokeWidth="1.5" />
      {on ? <circle cx="10" cy="10" r="2.4" fill="currentColor" /> : <path d="M3 17L17 3" stroke="currentColor" strokeWidth="1.5" />}
    </svg>
  );
}

/** The panel's home view: what is missing, the sections on the CV (order, hide) and a way to add more. */
export function Overview({ cv, dispatch, onFocusField, opened, onOpen, scores, onEnrich, tailored = false, part, onJump, onRetry }: Props) {
  const layout = normalizeLayout(cv.layout);
  const nameOf = (key: SectionKey) => layout.titles[key] || CATEGORY[key].label[cv.locale];
  const saved = sectionsOnCv(cv);
  const present = layout.order.filter((k) => saved.includes(k) || opened.has(k));
  const addable = SECTION_KEYS.filter((k) => k !== "other" && !present.includes(k));
  const flags = tailored ? shownEmptyFlags(cv, opened)
    : missingCategories(cv).filter((f) => f.key === "header" || !opened.has(f.key));
  const [choice, setChoice] = useState<string>(CUSTOM);
  const chosen = choice === CUSTOM || addable.some((k) => k === choice) ? choice : (addable[0] ?? CUSTOM);

  // The reducer orders saved sections only; a section opened but still empty stays where it is.
  const move = (from: number, to: number) => {
    const a = saved.indexOf(present[from] as SectionKey);
    const b = saved.indexOf(present[to] as SectionKey);
    if (a >= 0 && b >= 0) dispatch({ type: "moveSection", from: a, to: b });
  };

  const addSection = (key: SectionKey) => {
    const id = newId();
    dispatch({ type: "addSection", key, id });
    onOpen(key);
    const field = firstFieldKey(key, id);
    if (field) onFocusField(field);
  };
  const addChosen = () => {
    if (chosen !== CUSTOM) return addSection(chosen as SectionKey);
    const id = newId();
    dispatch({ type: "addCustomSection", id, title: "" });
    onFocusField(`custom-${id}-title`);
  };

  const roles = scores && (
    <RoleScoreList items={scoredItems(cv)} scores={scores} onOpen={(id, list) => onFocusField(`${list}-${id}-title`)}
      expandable={part === "contents"} onRetry={onRetry} />
  );

  return (
    <div className="panel-overview">
      {part !== "contents" && onEnrich && (
        <button type="button" className="btn primary enrich-open" onClick={onEnrich}>{t("enrich.path.open")}</button>
      )}
      {part !== "contents" && (
      <div>
        <h3 className="p-h">{t("panel.overview.title")}</h3>
        <p className="fine">{t("panel.overview.hint")}</p>
      </div>
      )}

      {part !== "contents" && (
      <div>
        <p className="p-sub">{t("panel.overview.needs")}</p>
        {flags.length === 0 ? (
          <div className="all-good">{t("panel.overview.allGood")}</div>
        ) : (
          <div className="health">
            {flags.map((f) => {
              const name = f.key !== "header" ? nameOf(f.key) : f.field === "email" ? t("cv.email") : t("cv.fullName");
              return (
                <div key={`${f.key}-${f.field ?? ""}`} className={f.level === "tip" ? "flag tip" : "flag"}>
                  <span className="pill">{t(f.level === "tip" ? "panel.overview.tip" : "panel.overview.missing")}</span>
                  <strong>{name}</strong>
                  {f.key === "header" ? (
                    <button type="button" className="btn" aria-label={t("panel.overview.fillInNamed", { name })} onClick={() => onFocusField(f.field ?? "fullName")}>
                      {t("panel.overview.fillIn")}
                    </button>
                  ) : (
                    <button type="button" className="btn" aria-label={t("panel.overview.addNamed", { name })} onClick={() => addSection(f.key as SectionKey)}>
                      {t("panel.overview.add")}
                    </button>
                  )}
                  <span className="why">{CATEGORY[f.key].why}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
      )}

      {!part && roles}

      {part !== "coach" && (
      <div>
        <p className="p-sub">{t(part ? "cv.contents.title" : "panel.overview.sections")}</p>
        <div className="sec-list">
          <DragList
            items={present.map((key) => ({ id: key }))}
            onMove={move}
            label={(item) => nameOf(item.id as SectionKey)}
            rowClassName="sec-row"
          >
            {(item) => {
              const key = item.id as SectionKey;
              const off = layout.hidden.includes(key);
              const name = nameOf(key);
              return (
                <>
                  {onJump && !off ? (
                    <button type="button" className="name sec-jump" aria-label={t("cv.contents.jump", { name })} onClick={() => onJump(key)}>{name}</button>
                  ) : (
                    <span className={off ? "name off" : "name"}>{name}</span>
                  )}
                  {off && <span className="badge">{t("panel.overview.hidden")}</span>}
                  <button
                    type="button"
                    className="icon-btn"
                    aria-pressed={!off}
                    aria-label={t(off ? "panel.overview.show" : "panel.overview.hide", { name })}
                    onClick={() => dispatch({ type: "toggleHidden", key })}
                  >
                    <Eye on={!off} />
                  </button>
                </>
              );
            }}
          </DragList>
        </div>
        <div className="add-sec">
          <select aria-label={t("panel.overview.addSectionLabel")} value={chosen} onChange={(e) => setChoice(e.target.value)}>
            {addable.map((k) => (
              <option key={k} value={k}>
                {CATEGORY[k].label[cv.locale]}
              </option>
            ))}
            <option value={CUSTOM}>{t("panel.overview.custom")}</option>
          </select>
          <button type="button" className="btn" onClick={addChosen}>
            {t("panel.overview.addSection")}
          </button>
        </div>
        <p className="fine">{t("panel.overview.fine")}</p>
      </div>
      )}

      {part === "contents" && roles}
    </div>
  );
}
