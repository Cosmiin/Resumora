import { useCallback, useRef, useState } from "react";
import { missingCategories, newId, normalizeLayout, type CvContent, type SectionKey } from "@resumora/shared";
import { sectionsOnCv, type CvAction } from "./cvReducer.ts";
import { MissingBox } from "./MissingBox.tsx";
import { SectionHeading } from "./SectionHeading.tsx";
import { useFocusAfterRender } from "./useFocusAfterRender.ts";
import { HeaderEdit } from "./sections/HeaderEdit.tsx";
import { firstFieldKey, sectionRenderers } from "./sections/renderers.tsx";

type Props = { cv: CvContent; dispatch(a: CvAction): void };

/** The CV page where every piece of text is typed in place. */
export function EditablePage({ cv, dispatch }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const focusLater = useFocusAfterRender(root);
  // Sections added this visit stay on the page even while they are still empty (a blank summary).
  const [opened, setOpened] = useState<ReadonlySet<SectionKey>>(new Set());

  const addSection = useCallback(
    (key: SectionKey) => {
      const id = newId();
      dispatch({ type: "addSection", key, id });
      setOpened((prev) => new Set(prev).add(key));
      const field = firstFieldKey(key, id);
      if (field) focusLater(field);
    },
    [dispatch, focusLater],
  );

  const layout = normalizeLayout(cv.layout);
  const onPage = new Set(sectionsOnCv(cv));
  const flags = new Map(missingCategories(cv).filter((f) => f.key !== "header").map((f) => [f.key, f.level]));

  return (
    <div className="cv-page cv-page-edit" ref={root}>
      <HeaderEdit basics={cv.basics} dispatch={dispatch} />
      {layout.order.map((key) => {
        const Body = sectionRenderers[key];
        if (!Body || layout.hidden.includes(key)) return null;
        if (onPage.has(key) || opened.has(key)) {
          return (
            <section key={key} className="cv-section" data-section={key}>
              {key !== "other" && (
                <SectionHeading sectionKey={key} title={layout.titles[key] ?? ""} locale={cv.locale} dispatch={dispatch} />
              )}
              <Body cv={cv} dispatch={dispatch} />
            </section>
          );
        }
        const level = flags.get(key);
        return level ? (
          <MissingBox key={key} sectionKey={key} level={level} locale={cv.locale} onAdd={addSection} />
        ) : null;
      })}
    </div>
  );
}
