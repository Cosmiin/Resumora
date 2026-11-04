import { memo, useCallback } from "react";
import type { Skill, SkillGroup } from "@resumora/shared";
import { t } from "../../../i18n/t.ts";
import type { MessageKey } from "../../../i18n/en.ts";
import { ChipInput } from "../ChipInput.tsx";
import type { CvAction } from "../cvReducer.ts";
import type { SectionProps } from "./types.ts";

type Dispatch = (a: CvAction) => void;

const SkillRow = memo(function SkillRow({
  group,
  items,
  label,
  addLabel,
  sort,
  dispatch,
}: {
  group: SkillGroup;
  items: Skill[];
  label: MessageKey;
  addLabel: MessageKey;
  sort?: boolean;
  dispatch: Dispatch;
}) {
  const onAdd = useCallback((name: string) => dispatch({ type: "addSkill", group, name }), [dispatch, group]);
  const onRemove = useCallback(
    (skillId: string) => dispatch({ type: "removeSkill", group, skillId }),
    [dispatch, group],
  );
  return (
    <div className="cv-skill-row">
      <span className="cv-skill-label">{t(label)}</span>
      <ChipInput
        items={items}
        onAdd={onAdd}
        onRemove={onRemove}
        label={t(addLabel)}
        tone={sort ? "sort" : undefined}
        fieldKey={`skills-${group}`}
      />
    </div>
  );
});

/** Technical, Professional, and To sort (only while it has skills). Never merged. */
export function SkillsEdit({ cv, dispatch }: SectionProps) {
  return (
    <>
      <SkillRow
        group="technicalSkills"
        items={cv.technicalSkills}
        label="cv.page.technical"
        addLabel="edit.skills.technical"
        dispatch={dispatch}
      />
      <SkillRow
        group="professionalSkills"
        items={cv.professionalSkills}
        label="cv.page.professional"
        addLabel="edit.skills.professional"
        dispatch={dispatch}
      />
      {cv.unclearSkills.length > 0 && (
        <SkillRow
          group="unclearSkills"
          items={cv.unclearSkills}
          label="cv.page.toSort"
          addLabel="edit.skills.sort"
          sort
          dispatch={dispatch}
        />
      )}
    </>
  );
}
