import { memo, useCallback, useMemo, useRef, type KeyboardEvent } from "react";
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
}: ItemProps) {
  const owner = useMemo(
    () => (ownerList === "achievements" ? { list: ownerList } : { list: ownerList, itemId: ownerItemId ?? "" }) as BulletOwner,
    [ownerList, ownerItemId],
  );
  const id = bullet.id;

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
      <PageField
        multiline
        fieldKey={`bullet-${id}`}
        value={bullet.text}
        label={t("edit.bullet", { n: index + 1, of: ownerName })}
        placeholder={t("edit.bulletPlaceholder")}
        onChange={onChange}
        onKeyDown={onKeyDown}
      />
    </li>
  );
});

/** Bullets that behave like lines in a word processor: Enter splits, Backspace at the start joins. */
export function BulletList({ owner, bullets, dispatch, ownerName }: Props) {
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
        />
      ))}
    </ul>
  );
}
