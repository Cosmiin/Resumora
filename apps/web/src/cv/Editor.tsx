import type { CvContent, CvResponse } from "@resumora/shared";
import { t } from "../i18n/t.ts";
import type { MessageKey } from "../i18n/en.ts";
import { getCv, saveCv } from "./cv-api.ts";
import { useAutosave, type SaveStatus } from "./useAutosave.ts";
import { ConflictBanner } from "./ConflictBanner.tsx";
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
  const { content, setContent, status, conflict, loadLatest, keepMine } = useAutosave({
    initial,
    save: saveCv,
    load: getCv,
  });
  const update = <K extends keyof CvContent>(key: K) => (value: CvContent[K]) => setContent({ ...content, [key]: value });

  return (
    <div className="editor">
      <div className="editor-toolbar">
        <span className={`save-status save-status-${status}`} aria-live="polite">
          {t(statusLabel[status])}
        </span>
      </div>
      {conflict && <ConflictBanner onLoadLatest={loadLatest} onKeepMine={keepMine} />}
      <BasicsSection value={content.basics} onChange={update("basics")} />
      <ExperienceSection items={content.experience} onChange={update("experience")} />
      <EducationSection items={content.education} onChange={update("education")} />
      <SkillsSection items={content.skills} onChange={update("skills")} />
      <LanguagesSection items={content.languages} onChange={update("languages")} />
      <CertificationsSection items={content.certifications} onChange={update("certifications")} />
      <ProjectsSection items={content.projects} onChange={update("projects")} />
    </div>
  );
}
