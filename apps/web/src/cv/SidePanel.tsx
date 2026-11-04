import { useEffect, useRef } from "react";
import type { CvContent } from "@resumora/shared";
import { t } from "../i18n/t.ts";
import { blockKey, findItem, type BlockRef } from "./page/blocks.ts";
import { PanelBody, isListSection, panelTitle, sectionLabel } from "./PanelBody.tsx";
import { PanelFooter } from "./PanelFooter.tsx";

type Props = {
  cv: CvContent;
  selected: BlockRef;
  onChange(next: CvContent): void;
  onSelect(ref: BlockRef | null): void;
};

/** The fields of the block selected on the page. Escape or the close button closes it. */
export function SidePanel({ cv, selected, onChange, onSelect }: Props) {
  const { section } = selected;
  const position = findItem(cv, selected) ?? { index: 0, count: 1 };
  const label = isListSection(section)
    ? t(section === "experience" ? "panel.rolePosition" : "panel.position", {
        section: t(sectionLabel[section]),
        n: position.index + 1,
        count: position.count,
      })
    : t(sectionLabel[section]);

  const title = panelTitle(cv, selected);
  const bodyRef = useRef<HTMLDivElement>(null);
  const keepFocus = useRef(false);
  const key = blockKey(selected);

  // A newly opened block moves focus to its first field. Stepping with Previous/Next keeps
  // focus on the footer button, unless that button just became disabled.
  useEffect(() => {
    const active = document.activeElement;
    const stay = keepFocus.current && !(active instanceof HTMLButtonElement && active.disabled);
    keepFocus.current = false;
    if (stay) return;
    bodyRef.current?.querySelector<HTMLElement>("input, textarea, select, button")?.focus();
  }, [key]);

  return (
    <aside
      className="side-panel"
      aria-label={`${label}: ${title}`}
      onKeyDown={(e) => {
        if (e.key !== "Escape") return;
        e.stopPropagation();
        onSelect(null);
      }}
    >
      <header className="side-panel-header">
        <div>
          <p className="side-panel-section">{label}</p>
          <h2 className="side-panel-title">{title}</h2>
        </div>
        <button type="button" className="side-panel-close" aria-label={t("panel.close")} onClick={() => onSelect(null)}>
          <span className="side-panel-close-icon" aria-hidden="true">×</span>
          <span className="side-panel-back" aria-hidden="true">← {t("panel.back")}</span>
        </button>
      </header>
      <div className="side-panel-body" ref={bodyRef}>
        <PanelBody cv={cv} selected={selected} onChange={onChange} />
      </div>
      {isListSection(section) && selected.itemId && (
        <PanelFooter
          cv={cv}
          section={section}
          itemId={selected.itemId}
          onChange={onChange}
          onNavigate={(ref) => {
            keepFocus.current = true;
            onSelect(ref);
          }}
          onAdd={onSelect}
        />
      )}
    </aside>
  );
}
