import { memo, useCallback, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { newId, type Bullet } from "@resumora/shared";
import { t } from "../../i18n/t.ts";
import { ImproveButton } from "../enrich/ImproveButton.tsx";
import type { BulletOwner, CvAction } from "./cvReducer.ts";
import { focusField } from "./focus.ts";
import { PageField } from "./PageField.tsx";

/** A weak bullet's tip; `mid` means a score of 40 or more (a softer colour). */
export type WeakMark = { tip: string; mid: boolean };

type Props = {
  owner: BulletOwner;
  bullets: Bullet[];
  dispatch(a: CvAction): void;
  ownerName: string;
  /** Tips for weak bullets by bullet id; only passed while the role's score card is open. */
  marks?: ReadonlyMap<string, WeakMark>;
};

type ItemProps = {
  ownerList: BulletOwner["list"];
  ownerItemId: string | undefined;
  bullet: Bullet;
  index: number;
  prevId: string | undefined;
  dispatch(a: CvAction): void;
  ownerName: string;
  focusLater(id: string, caret: number): void;
  readText(id: string): number;
  /** Why this bullet is weak; shown as a faint marker. */
  mark?: WeakMark;
};

const BulletItem = memo(function BulletItem({
  ownerList,
  ownerItemId,
  bullet,
  index,
  prevId,
  dispatch,
  ownerName,
  focusLater,
  readText,
  mark,
}: ItemProps) {
  const owner = useMemo(
    () => (ownerList === "achievements" ? { list: ownerList } : { list: ownerList, itemId: ownerItemId ?? "" }) as BulletOwner,
    [ownerList, ownerItemId],
  );
  const id = bullet.id;
  const [tipOpen, setTipOpen] = useState(false);

  const onChange = useCallback(
    (text: string) => dispatch({ type: "setBullet", owner, bulletId: id, text }),
    [dispatch, owner, id],
  );

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => {
      if (e.nativeEvent.isComposing) return;
      const el = e.currentTarget;
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const start = el.selectionStart ?? el.value.length;
        const end = el.selectionEnd ?? start;
        if (end > start) {
          dispatch({ type: "setBullet", owner, bulletId: id, text: el.value.slice(0, start) + el.value.slice(end) });
        }
        const next = newId();
        dispatch({ type: "splitBullet", owner, bulletId: id, at: start, newId: next });
        focusLater(next, 0);
      } else if (e.key === "Backspace" && prevId && el.selectionStart === 0 && el.selectionEnd === 0) {
        e.preventDefault();
        const caret = readText(prevId);
        dispatch({ type: "joinBullet", owner, bulletId: id });
        focusLater(prevId, caret);
      }
    },
    [dispatch, owner, id, prevId, focusLater, readText],
  );

  return (
    <li>
      {mark && (
        <>
          <button
            type="button"
            className={mark.mid ? "weak-mark mid" : "weak-mark"}
            title={mark.tip}
            aria-expanded={tipOpen}
            onClick={() => setTipOpen((o) => !o)}
            aria-label={t("enrich.card.weakBullet")}
            aria-describedby={`weak-tip-${id}`}
          />
          <span className={tipOpen ? "weak-tip is-open" : "weak-tip"} id={`weak-tip-${id}`}>
            {mark.tip}
          </span>
        </>
      )}
      <PageField
        multiline
        fieldKey={`bullet-${id}`}
        value={bullet.text}
        label={t("edit.bullet", { n: index + 1, of: ownerName })}
        placeholder={t("edit.bulletPlaceholder")}
        onChange={onChange}
        onKeyDown={onKeyDown}
      />
      {ownerList === "experience" && ownerItemId && bullet.text.trim() !== "" && <ImproveButton roleId={ownerItemId} bulletId={id} />}
    </li>
  );
});

/** Bullets that behave like lines in a word processor: Enter splits, Backspace at the start joins. */
export function BulletList({ owner, bullets, dispatch, ownerName, marks }: Props) {
  const root = useRef<HTMLUListElement>(null);
  const ownerItemId = owner.list === "achievements" ? undefined : owner.itemId;

  const focusLater = useCallback((id: string, caret: number) => {
    requestAnimationFrame(() => {
      if (root.current) focusField(root.current, `bullet-${id}`, caret);
    });
  }, []);

  // The text length of a bullet as it stands on the page, read when a key is pressed.
  const readText = useCallback((id: string) => {
    const el = root.current?.querySelector<HTMLTextAreaElement>(`[data-field="${CSS.escape(`bullet-${id}`)}"]`);
    return el?.value.length ?? 0;
  }, []);

  return (
    <ul className="cv-bullets" ref={root}>
      {bullets.map((bullet, index) => (
        <BulletItem
          key={bullet.id}
          ownerList={owner.list}
          ownerItemId={ownerItemId}
          bullet={bullet}
          index={index}
          prevId={bullets[index - 1]?.id}
          dispatch={dispatch}
          ownerName={ownerName}
          focusLater={focusLater}
          readText={readText}
          mark={marks?.get(bullet.id)}
        />
      ))}
    </ul>
  );
}
