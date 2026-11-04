import { useRef, type KeyboardEvent } from "react";
import { newId, type Bullet } from "@resumora/shared";
import { t } from "../../i18n/t.ts";
import type { BulletOwner, CvAction } from "./cvReducer.ts";
import { focusField } from "./focus.ts";
import { PageField } from "./PageField.tsx";

type Props = {
  owner: BulletOwner;
  bullets: Bullet[];
  dispatch(a: CvAction): void;
  ownerName: string;
};

/** Bullets that behave like lines in a word processor: Enter splits, Backspace at the start joins. */
export function BulletList({ owner, bullets, dispatch, ownerName }: Props) {
  const root = useRef<HTMLUListElement>(null);

  const focusLater = (id: string, caret: number) => {
    requestAnimationFrame(() => {
      if (root.current) focusField(root.current, `bullet-${id}`, caret);
    });
  };

  const onKey = (index: number, e: KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    const bullet = bullets[index];
    if (!bullet) return;
    const el = e.currentTarget;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const id = newId();
      dispatch({ type: "splitBullet", owner, bulletId: bullet.id, at: el.selectionStart ?? el.value.length, newId: id });
      focusLater(id, 0);
    } else if (e.key === "Backspace" && index > 0 && el.selectionStart === 0 && el.selectionEnd === 0) {
      e.preventDefault();
      const previous = bullets[index - 1];
      if (!previous) return;
      dispatch({ type: "joinBullet", owner, bulletId: bullet.id });
      focusLater(previous.id, previous.text.length);
    }
  };

  return (
    <ul className="cv-bullets" ref={root}>
      {bullets.map((bullet, index) => (
        <li key={bullet.id}>
          <PageField
            multiline
            fieldKey={`bullet-${bullet.id}`}
            value={bullet.text}
            label={t("edit.bullet", { n: index + 1, of: ownerName })}
            placeholder={t("edit.bulletPlaceholder")}
            onChange={(text) => dispatch({ type: "setBullet", owner, bulletId: bullet.id, text })}
            onKeyDown={(e) => onKey(index, e)}
          />
        </li>
      ))}
    </ul>
  );
}
