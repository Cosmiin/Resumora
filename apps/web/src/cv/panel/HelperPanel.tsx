import type { ReactNode } from "react";
import type { CategoryKey, CvContent, SectionKey } from "@resumora/shared";
import { t } from "../../i18n/t.ts";
import type { CvAction } from "../edit/cvReducer.ts";
import { Overview } from "./Overview.tsx";
import type { RoleScoreState } from "../enrich/useRoleScores.ts";
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
  /** Role scores for the score card and the "Your roles" list. */
  scores?: ReadonlyMap<string, RoleScoreState>;
  onRetry?(roleId: string): void;
  waitForSave?(): Promise<void>;
  /** Tailored CV only: the Base wording. Hides the enrichment tools and offers "Use original wording". */
  original?: CvContent;
  /** Base CV only: opens the guided enrichment path. */
  onEnrich?(): void;
  /** Tailored CV: Needs attention counts only the sections shown on the page. */
  tailored?: boolean;
  /** Shown above the overview (the base CV's strength, template and language). */
  top?: ReactNode;
  /** Wide screens: the sections and roles sit left of the page, so the panel keeps only what needs attention. */
  coachOnly?: boolean;
};

/** The right-hand panel: the overview, or the tools for the section being edited. */
export function HelperPanel({ cv, dispatch, focus, onBack, onFocusField, onFocusPage, opened, onOpen, scores, onRetry, waitForSave, original, onEnrich, tailored = false, top, coachOnly = false }: Props) {
  return (
    <aside className="panel" aria-label={t("panel.label")}>
      {focus ? (
        <SectionTools cv={cv} dispatch={dispatch} focus={focus} onBack={onBack} onFocusPage={onFocusPage} scores={scores} onRetry={onRetry} waitForSave={waitForSave} original={original} />
      ) : (
        <>
        {top}
        <Overview cv={cv} dispatch={dispatch} onFocusField={onFocusField} opened={opened} onOpen={onOpen} scores={scores} onEnrich={onEnrich} tailored={tailored} part={coachOnly ? "coach" : undefined} />
        </>
      )}
    </aside>
  );
}
