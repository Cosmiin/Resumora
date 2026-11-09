import { CATEGORY, normalizeLayout, type CvContent } from "@resumora/shared";
import { t } from "../../i18n/t.ts";
import type { CvAction, ListKey } from "../edit/cvReducer.ts";
import { getItems } from "../edit/lists.ts";
import { roleName } from "../edit/sections/RoleItem.tsx";
import { aiButtonsFor, tipsFor } from "./sectionTips.ts";
import { useOpenFocus } from "../enrich/focus-context.ts";
import { ScoreCard } from "../enrich/ScoreCard.tsx";
import { SkillsTools } from "../enrich/SkillsTools.tsx";
import { SummaryTools } from "../enrich/SummaryTools.tsx";
import type { RoleScoreState } from "../enrich/useRoleScores.ts";
import type { PanelFocus } from "./HelperPanel.tsx";

type Props = {
  cv: CvContent;
  dispatch(a: CvAction): void;
  focus: NonNullable<PanelFocus>;
  onBack(): void;
  /** Move the cursor to the page itself (used when what had it is gone). */
  onFocusPage(): void;
  scores?: ReadonlyMap<string, RoleScoreState>;
  onRetry?(roleId: string): void;
  /** Resolves once autosave has saved the latest edits (the rewrite reads the saved CV). */
  waitForSave?(): Promise<void>;
  /** Tailored CV only (see HelperPanel). */
  original?: CvContent;
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

const savedNow = () => Promise.resolve();

/** The role's score card; its button opens focus mode, which the editor renders over the page. */
function RoleEnrich({ cv, roleId, scores, onRetry }: Pick<Props, "cv" | "scores" | "onRetry"> & { roleId: string }) {
  const open = useOpenFocus();
  const role = cv.experience.find((r) => r.id === roleId);
  const score = scores?.get(roleId);
  if (!role || !score) return null;
  return (
    <ScoreCard
      role={role}
      score={score}
      onImprove={(mode) => open?.({ roleId, mode })}
      onRetry={() => onRetry?.(roleId)}
    />
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

const LISTS: readonly string[] = ["experience", "volunteering", "education", "languages", "certifications", "projects", "awards", "courses", "publications", "custom"];

/** The Base wording of the focused item (or the summary) where it differs, and the edits that bring it back. */
function originalWording(cv: CvContent, original: CvContent, { key, itemId }: NonNullable<PanelFocus>): { was: string[]; restore: CvAction[] } {
  if (key === "summary") {
    const before = original.basics.summary;
    return before !== cv.basics.summary ? { was: [before], restore: [{ type: "setSummary", value: before }] } : { was: [], restore: [] };
  }
  const was: string[] = [];
  const restore: CvAction[] = [];
  if (!itemId || !LISTS.includes(key)) return { was, restore };
  const list = key as ListKey;
  const now = getItems(cv, list).find((i) => i.id === itemId);
  const before = getItems(original, list).find((i) => i.id === itemId);
  if (!now || !before) return { was, restore };
  for (const [field, value] of Object.entries(before)) {
    if (typeof value === "string" && field !== "id" && value !== now[field]) {
      if (value) was.push(value);
      restore.push({ type: "setItemField", list, itemId, field, value });
    }
  }
  if ((list === "experience" || list === "volunteering") && Array.isArray(before.bullets) && Array.isArray(now.bullets)) {
    const current = new Map((now.bullets as { id: string; text: string }[]).map((b) => [b.id, b.text]));
    for (const bullet of before.bullets as { id: string; text: string }[]) {
      if (current.has(bullet.id) && current.get(bullet.id) !== bullet.text) {
        was.push(bullet.text);
        restore.push({ type: "setBullet", owner: { list, itemId }, bulletId: bullet.id, text: bullet.text });
      }
    }
  }
  return { was, restore };
}

/** Tailored CV: "Was: …" and Use original wording for the focused item. */
function OriginalBox({ cv, original, focus, dispatch }: Pick<Props, "cv" | "dispatch" | "focus"> & { original: CvContent }) {
  const { was, restore } = originalWording(cv, original, focus);
  if (restore.length === 0) return null;
  return (
    <div className="box tailored-original">
      <p className="box-title">{t("tailored.was")}</p>
      {was.map((text, i) => <p key={i} className="fine">{text}</p>)}
      <button type="button" className="btn" onClick={() => restore.forEach(dispatch)}>{t("tailored.useOriginal")}</button>
    </div>
  );
}

/** The tools for the part of the CV the cursor is in. */
export function SectionTools({ cv, dispatch, focus, onBack, onFocusPage, scores, onRetry, waitForSave = savedNow, original }: Props) {
  const { key, itemId } = focus;
  const tailored = original !== undefined;
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
      {original && <OriginalBox cv={cv} original={original} focus={focus} dispatch={dispatch} />}
      {!tailored && key === "experience" && itemId && (
        <RoleEnrich key={itemId} cv={cv} roleId={itemId} scores={scores} onRetry={onRetry} />
      )}
      {(key === "experience" || key === "volunteering") && itemId && (
        <RoleBox cv={cv} dispatch={dispatch} list={key} itemId={itemId} onFocusPage={onFocusPage} />
      )}
      {!tailored && key === "summary" && <SummaryTools cv={cv} dispatch={dispatch} waitForSave={waitForSave} />}
      {!tailored && key === "skills" && <SkillsTools cv={cv} dispatch={dispatch} waitForSave={waitForSave} />}
      {key === "skills" && <ToSortBox cv={cv} dispatch={dispatch} />}
      <div>
        <p className="p-sub">{t("panel.tools.tips")}</p>
        <ul className="tips">
          {tipsFor(key).map((k) => (
            <li key={k}>{t(k)}</li>
          ))}
        </ul>
      </div>
      {!tailored && ai.length > 0 && (
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
