import { useState } from "react";
import type { CvContent, CvResponse, SaveResponse } from "@resumora/shared";
import { t } from "../i18n/t.ts";
import type { MessageKey } from "../i18n/en.ts";
import { getCv, restoreHistory, saveCv } from "./cv-api.ts";
import { conflictFrom, isConflict, useAutosave, type SaveStatus } from "./useAutosave.ts";
import { ConflictBanner } from "./ConflictBanner.tsx";
import { HistoryDrawer } from "./HistoryDrawer.tsx";
import { BasicsSection } from "./sections/Basics.tsx";
import { ExperienceSection } from "./sections/Experience.tsx";
import {
  CertificationsSection,
  EducationSection,
  LanguagesSection,
  ProjectsSection,
  SkillsSection,
} from "./sections/Lists.tsx";

const statusLabel: Record<SaveStatus, MessageKey> = {
  saved: "cv.status.saved",
  dirty: "cv.status.dirty",
  saving: "cv.status.saving",
  error: "cv.status.error",
  conflict: "cv.status.conflict",
  invalid: "cv.status.invalid",
};

export function Editor({ initial }: { initial: CvResponse }) {
  const autosave = useAutosave({ initial, save: saveCv, load: getCv });
  const { content, setContent, status, conflict, loadLatest, keepMine } = autosave;
  const [historyOpen, setHistoryOpen] = useState(false);
  const [restoreFailed, setRestoreFailed] = useState(false);

  async function restore(id: string) {
    setRestoreFailed(false);
    let restored: SaveResponse;
    try {
      restored = await restoreHistory(id, autosave.currentVersion());
    } catch (err) {
      if (isConflict(err)) autosave.reportConflict(conflictFrom(err));
      else setRestoreFailed(true);
      setHistoryOpen(false);
      return;
    }
    try {
      autosave.reset(await getCv());
    } catch {
      // The restore is saved, but our copy is now out of date: let the user load it.
      autosave.reportConflict(restored);
    }
    setHistoryOpen(false);
  }
  const update = <K extends keyof CvContent>(key: K) => (value: CvContent[K]) => setContent({ ...content, [key]: value });

  return (
    <div className="editor">
      <div className="editor-toolbar">
        <span className={`save-status save-status-${status}`} aria-live="polite">
          {t(statusLabel[status])}
        </span>
        <button type="button" className="secondary" onClick={() => setHistoryOpen(true)}>
          {t("history.open")}
        </button>
      </div>
      {restoreFailed && <p role="alert" className="form-error">{t("history.restoreError")}</p>}
      {autosave.problem && (
        <p role="alert" className="form-error">
          {t("cv.invalid", { problem: autosave.problem })}
        </p>
      )}
      {conflict && <ConflictBanner onLoadLatest={loadLatest} onKeepMine={keepMine} />}
      {/* While history is open the form can't be edited, so a restore can't race the user's typing. */}
      <div className="editor-sections" inert={historyOpen}>
        <BasicsSection value={content.basics} onChange={update("basics")} />
        <ExperienceSection items={content.experience} onChange={update("experience")} />
        <EducationSection items={content.education} onChange={update("education")} />
        <SkillsSection items={content.skills} onChange={update("skills")} />
        <LanguagesSection items={content.languages} onChange={update("languages")} />
        <CertificationsSection items={content.certifications} onChange={update("certifications")} />
        <ProjectsSection items={content.projects} onChange={update("projects")} />
      </div>
      {historyOpen && (
        <>
          <div className="drawer-backdrop" onClick={() => setHistoryOpen(false)} />
          <HistoryDrawer onClose={() => setHistoryOpen(false)} canRestore={status === "saved"} onRestore={restore} />
        </>
      )}
    </div>
  );
}
