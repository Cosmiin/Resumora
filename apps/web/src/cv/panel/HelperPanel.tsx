import type { CategoryKey, CvContent, SectionKey } from "@resumora/shared";
import { t } from "../../i18n/t.ts";
import type { CvAction } from "../edit/cvReducer.ts";
import { Overview } from "./Overview.tsx";

export type PanelFocus = { key: CategoryKey; itemId?: string } | null;

type Props = {
  cv: CvContent;
  dispatch(a: CvAction): void;
  focus: PanelFocus;
  onBack(): void;
  onFocusField(fieldKey: string): void;
  opened: ReadonlySet<SectionKey>;
  onOpen(key: SectionKey): void;
};

/** The right-hand panel: the overview, or (Task 8) the tools for the section being edited. */
export function HelperPanel({ cv, dispatch, onFocusField, opened, onOpen }: Props) {
  // Task 8: when `focus` is set, render the section tools here (with `onBack`) instead of the overview.
  return (
    <aside className="panel" aria-label={t("panel.label")}>
      <Overview cv={cv} dispatch={dispatch} onFocusField={onFocusField} opened={opened} onOpen={onOpen} />
    </aside>
  );
}
