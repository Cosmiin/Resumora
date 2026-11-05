import { CATEGORY, normalizeLayout, type CvContent } from "@resumora/shared";
import { t } from "../../i18n/t.ts";
import type { CvAction } from "../edit/cvReducer.ts";
import { roleName } from "../edit/sections/RoleItem.tsx";
import { aiButtonsFor, tipsFor } from "./sectionTips.ts";
import type { PanelFocus } from "./HelperPanel.tsx";

type Props = {
  cv: CvContent;
  dispatch(a: CvAction): void;
  focus: NonNullable<PanelFocus>;
  onBack(): void;
  /** Move the cursor to the page itself (used when what had it is gone). */
  onFocusPage(): void;
};

function Eye() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
      <path d="M2 10s3-5.5 8-5.5S18 10 18 10s-3 5.5-8 5.5S2 10 2 10z" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3 17L17 3" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

/** Role tools: "I work here now" and Remove role. */
function RoleBox({ cv, dispatch, list, itemId, onFocusPage }: Pick<Props, "cv" | "dispatch" | "onFocusPage"> & { list: "experience" | "volunteering"; itemId: string }) {
  const item = cv[list].find((r) => r.id === itemId);
  if (!item) return null;
  const title = item.title || item.company ? roleName(item, list) : t("panel.tools.thisRole");
  return (
    <div className="box">
      <p className="box-title">{title}</p>
      <label className="toggle">
        {t("panel.tools.workHere")}
        <input
          className="switch"
          type="checkbox"
          checked={item.current}
          onChange={(e) => dispatch({ type: "setCurrent", list, itemId, current: e.target.checked })}
        />
      </label>
      <div className="row-btns">
        <button
          type="button"
          className="btn danger"
          onClick={() => {
            // The panel stays on this section; the role and its tools are gone.
            dispatch({ type: "removeItem", list, itemId });
            onFocusPage();
          }}
        >
          {t("panel.tools.removeRole")}
        </button>
      </div>
    </div>
  );
}

/** Skills the importer could not place: send each one to a group. */
function ToSortBox({ cv, dispatch }: Pick<Props, "cv" | "dispatch">) {
  if (cv.unclearSkills.length === 0) return null;
  return (
    <div className="box">
      <p className="box-title">{t("panel.tools.toSort")}</p>
      {cv.unclearSkills.map((s) => (
        <div className="sort-row" key={s.id}>
          <span className="chip sort">{s.name}</span>
          <button type="button" className="btn" onClick={() => dispatch({ type: "moveSkill", skillId: s.id, to: "technicalSkills" })}>
            {t("panel.tools.toTechnical")}
          </button>
          <button type="button" className="btn" onClick={() => dispatch({ type: "moveSkill", skillId: s.id, to: "professionalSkills" })}>
            {t("panel.tools.toProfessional")}
          </button>
        </div>
      ))}
    </div>
  );
}

/** The tools for the part of the CV the cursor is in. */
export function SectionTools({ cv, dispatch, focus, onBack, onFocusPage }: Props) {
  const { key, itemId } = focus;
  const layout = normalizeLayout(cv.layout);
  const standard = CATEGORY[key].label[cv.locale];
  const sectionKey = key === "header" ? null : key;
  const own = sectionKey ? (layout.titles[sectionKey] ?? "") : "";
  const ai = aiButtonsFor(key);

  return (
    <div className="panel-tools">
      <button type="button" className="link" onClick={onBack}>
        {t("panel.tools.back")}
      </button>
      <div className="ctx-head">
        <h3 className="p-h">{key === "header" ? t("panel.tools.header") : own || standard}</h3>
        {sectionKey && (
          <button
            type="button"
            className="icon-btn"
            aria-label={t("panel.overview.hide", { name: standard })}
            title={t("panel.tools.hide")}
            onClick={() => {
              dispatch({ type: "toggleHidden", key: sectionKey });
              onBack();
              onFocusPage();
            }}
          >
            <Eye />
          </button>
        )}
      </div>
      {sectionKey && own && own !== standard && (
        <p className="fine">
          {t("panel.tools.renamed", { label: standard })}{" "}
          <button type="button" className="link" onClick={() => dispatch({ type: "setSectionTitle", key: sectionKey, value: "" })}>
            {t("panel.tools.useStandard")}
          </button>
        </p>
      )}
      {(key === "experience" || key === "volunteering") && itemId && (
        <RoleBox cv={cv} dispatch={dispatch} list={key} itemId={itemId} onFocusPage={onFocusPage} />
      )}
      {key === "skills" && <ToSortBox cv={cv} dispatch={dispatch} />}
      <div>
        <p className="p-sub">{t("panel.tools.tips")}</p>
        <ul className="tips">
          {tipsFor(key).map((k) => (
            <li key={k}>{t(k)}</li>
          ))}
        </ul>
      </div>
      {ai.length > 0 && (
        <div>
          <p className="p-sub">{t("panel.ai.title")}</p>
          <div className="ai">
            {ai.map((k) => (
              <button key={k} type="button" aria-disabled="true" title={t("panel.ai.soon")}>
                {t(k)}
                <span className="soon">{t("panel.ai.comingNext")}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
