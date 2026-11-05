import type { CategoryKey, CvContent, SectionKey } from "@resumora/shared";
import { t } from "../../i18n/t.ts";
import type { CvAction } from "../edit/cvReducer.ts";
import { Overview } from "./Overview.tsx";
import { SectionTools } from "./SectionTools.tsx";

export type PanelFocus = { key: CategoryKey; itemId?: string } | null;

type Props = {
  cv: CvContent;
  dispatch(a: CvAction): void;
  focus: PanelFocus;
  onBack(): void;
  onFocusField(fieldKey: string): void;
  onFocusPage(): void;
  opened: ReadonlySet<SectionKey>;
  onOpen(key: SectionKey): void;
};

/** The right-hand panel: the overview, or the tools for the section being edited. */
export function HelperPanel({ cv, dispatch, focus, onBack, onFocusField, onFocusPage, opened, onOpen }: Props) {
  return (
    <aside className="panel" aria-label={t("panel.label")}>
      {focus ? (
        <SectionTools cv={cv} dispatch={dispatch} focus={focus} onBack={onBack} onFocusPage={onFocusPage} />
      ) : (
        <Overview cv={cv} dispatch={dispatch} onFocusField={onFocusField} opened={opened} onOpen={onOpen} />
      )}
    </aside>
  );
}
