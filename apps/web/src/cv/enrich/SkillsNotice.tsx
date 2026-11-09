import { t } from "../../i18n/t.ts";

type Props = {
  /** The names of the skills the path added. No names, no bar. */
  names: string[];
  /** True once Undo removed them. */
  undone: boolean;
  onUndo(): void;
};

/** 5A: the dark bar at the top of the end screen: "Added N skills from your roles: … · Undo". */
export function SkillsNotice({ names, undone, onUndo }: Props) {
  if (names.length === 0) return null;
  return (
    <div className="fm-skills-notice" role="status">
      {undone ? (
        <span>{t("enrich.skills.noticeRemoved")}</span>
      ) : (
        <>
          <span>{t(names.length === 1 ? "enrich.skills.noticeOne" : "enrich.skills.notice", { n: names.length, names: names.join(", ") })}</span>
          <button type="button" className="fm-skills-undo" onClick={onUndo}>{t("enrich.skills.noticeUndo")}</button>
        </>
      )}
    </div>
  );
}
