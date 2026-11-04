import { useState } from "react";
import type { CvContent, CvResponse } from "@resumora/shared";
import { t } from "../i18n/t.ts";
import type { MessageKey } from "../i18n/en.ts";
import { getCv, restoreHistory, saveCv } from "./cv-api.ts";
import { isConflict, useAutosave, type SaveStatus } from "./useAutosave.ts";
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
};

export function Editor({ initial }: { initial: CvResponse }) {
  const autosave = useAutosave({ initial, save: saveCv, load: getCv });
  const { content, setContent, status, conflict, loadLatest, keepMine } = autosave;
  const [historyOpen, setHistoryOpen] = useState(false);
  const [restoreFailed, setRestoreFailed] = useState(false);

  async function restore(id: string) {
    setRestoreFailed(false);
    try {
      await restoreHistory(id, autosave.currentVersion());
      autosave.reset(await getCv());
    } catch (err) {
      if (isConflict(err)) autosave.reportConflict(err);
      else setRestoreFailed(true);
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
      {conflict && <ConflictBanner onLoadLatest={loadLatest} onKeepMine={keepMine} />}
      <BasicsSection value={content.basics} onChange={update("basics")} />
      <ExperienceSection items={content.experience} onChange={update("experience")} />
      <EducationSection items={content.education} onChange={update("education")} />
      <SkillsSection items={content.skills} onChange={update("skills")} />
      <LanguagesSection items={content.languages} onChange={update("languages")} />
      <CertificationsSection items={content.certifications} onChange={update("certifications")} />
      <ProjectsSection items={content.projects} onChange={update("projects")} />
      {historyOpen && (
        <HistoryDrawer onClose={() => setHistoryOpen(false)} canRestore={status === "saved"} onRestore={restore} />
      )}
    </div>
  );
}
