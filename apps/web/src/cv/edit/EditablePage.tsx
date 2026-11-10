import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  CATEGORY,
  isSectionEmpty,
  isSectionShown,
  missingCategories,
  newId,
  normalizeLayout,
  type CvContent,
  type SectionKey,
} from "@resumora/shared";
import { t } from "../../i18n/t.ts";
import { getTemplate, type TemplateId } from "../page/templates.ts";
import "../page/templates.css";
import { sectionsOnCv, type CvAction } from "./cvReducer.ts";
import { HiddenSections, type HiddenSection } from "./HiddenSections.tsx";
import { MissingBox } from "./MissingBox.tsx";
import { SectionHeading } from "./SectionHeading.tsx";
import { SectionMenu } from "./SectionMenu.tsx";
import { useFocusAfterRender } from "./useFocusAfterRender.ts";
import { HeaderEdit } from "./sections/HeaderEdit.tsx";
import type { RoleScoreState } from "../enrich/useRoleScores.ts";
import { firstFieldKey, sectionRenderers } from "./sections/renderers.tsx";

type Props = {
  cv: CvContent;
  dispatch(a: CvAction): void;
  /** Sections added this visit that stay on the page while empty (see useOpenedSections). */
  opened: ReadonlySet<SectionKey>;
  onOpen(key: SectionKey): void;
  scores?: ReadonlyMap<string, RoleScoreState>;
  toolsRoleId?: string;
  /** Tailored CV: its chosen template's look, and a control next to each section heading (↻). */
  template?: TemplateId;
  sectionAction?(key: SectionKey): ReactNode;
  /** Tailored CV: a "···" menu on each heading, empty sections hidden automatically, and the hidden line under the page. */
  tailored?: boolean;
};

type Deleted = { key: SectionKey; name: string; from: CvContent };

/** The CV page where every piece of text is typed in place. */
export function EditablePage({ cv, dispatch, opened, onOpen, scores, toolsRoleId, template, sectionAction, tailored = false }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const focusLater = useFocusAfterRender(root);
  const [deleted, setDeleted] = useState<Deleted | null>(null);

  const addSection = useCallback(
    (key: SectionKey) => {
      const id = newId();
      dispatch({ type: "addSection", key, id });
      onOpen(key);
      const field = firstFieldKey(key, id);
      if (field) focusLater(field);
    },
    [dispatch, focusLater, onOpen],
  );

  const layout = normalizeLayout(cv.layout);
  const listed = sectionsOnCv(cv);
  // Tailored: a section counts as on the page only with real content, so blank entries don't keep it there.
  const onPage = new Set(tailored ? layout.order.filter((key) => !isSectionEmpty(cv, key)) : listed);
  // A section that was on the page stays while it is edited, even if its text is cleared.
  useEffect(() => {
    for (const key of onPage) onOpen(key);
  });
  const flags = new Map(missingCategories(cv).filter((f) => f.key !== "header").map((f) => [f.key, f.level]));
  const nameOf = (key: SectionKey) => layout.titles[key]?.trim() || CATEGORY[key].label[cv.locale];

  // Hidden on the tailored page: hidden by the user, or empty where the page would otherwise show it.
  const hidden: HiddenSection[] = !tailored ? [] : layout.order
    .filter((key) => sectionRenderers[key] && !isSectionShown(cv, key, opened) && (layout.hidden.includes(key)
      || CATEGORY[key].flag !== null || listed.includes(key)))
    .map((key) => ({ key, name: nameOf(key), empty: isSectionEmpty(cv, key) }));
  const show = (key: SectionKey) => {
    if (layout.hidden.includes(key)) dispatch({ type: "toggleHidden", key });
    onOpen(key);
  };
  const menu = (key: SectionKey) => (
    <SectionMenu
      name={nameOf(key)}
      onHide={() => dispatch({ type: "toggleHidden", key })}
      onRename={() => focusLater(`heading-${key}`)}
      onDelete={() => {
        setDeleted({ key, name: nameOf(key), from: cv });
        dispatch({ type: "deleteSection", key });
      }}
    />
  );

  const page = (
    <div className={template ? `cv-page cv-page-edit ${getTemplate(template).className}` : "cv-page cv-page-edit"} ref={root} tabIndex={-1}>
      <HeaderEdit basics={cv.basics} dispatch={dispatch} tailored={tailored} template={template} />
      {layout.order.map((key) => {
        const Body = sectionRenderers[key];
        if (!Body || layout.hidden.includes(key)) return null;
        if (tailored ? isSectionShown(cv, key, opened) : onPage.has(key) || opened.has(key)) {
          return (
            <section key={key} className="cv-section" data-section={key}>
              {key !== "other" && (
                <SectionHeading sectionKey={key} title={layout.titles[key] ?? ""} locale={cv.locale} dispatch={dispatch}
                  after={tailored ? <>{menu(key)}{sectionAction?.(key)}</> : undefined} />
              )}
              {!tailored && sectionAction?.(key)}
              <Body cv={cv} dispatch={dispatch} scores={scores} toolsRoleId={toolsRoleId} />
            </section>
          );
        }
        const level = !tailored && flags.get(key);
        return level ? (
          <MissingBox key={key} sectionKey={key} level={level} locale={cv.locale} onAdd={addSection} />
        ) : null;
      })}
    </div>
  );
  if (!tailored) return page;
  return (
    <>
      {page}
      <HiddenSections sections={hidden} onShow={show} />
      {deleted && (
        <div className="section-toast" role="status">
          <span>{t("edit.section.deleted", { name: deleted.name })}</span>
          {" · "}
          <button type="button" className="link" onClick={() => {
            dispatch({ type: "restoreSection", key: deleted.key, from: deleted.from });
            setDeleted(null);
          }}>{t("edit.section.undo")}</button>
        </div>
      )}
    </>
  );
}
