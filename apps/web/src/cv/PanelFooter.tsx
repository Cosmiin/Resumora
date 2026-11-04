import { useEffect, useRef } from "react";
import { MAX_ITEMS, newId, type CvContent } from "@resumora/shared";
import { t } from "../i18n/t.ts";
import type { BlockRef } from "./page/blocks.ts";
import { blankItem, type ListSection } from "./sections/blank.ts";
import { move } from "./fields.tsx";
import { listItems, withListItems, type ListItem } from "./PanelBody.tsx";

type Props = {
  cv: CvContent;
  section: ListSection;
  itemId: string;
  onChange(next: CvContent): void;
  /** Moves to another item of the same list (or closes with null); focus stays in the footer. */
  onNavigate(ref: BlockRef | null): void;
  /** Opens a newly added item; focus moves to its first field. */
  onAdd(ref: BlockRef): void;
};

/** Remove, reorder, step through and add items of a list section. */
export function PanelFooter({ cv, section, itemId, onChange, onNavigate, onAdd }: Props) {
  const items = listItems(cv, section);
  const index = items.findIndex((x) => x.id === itemId);
  const ref = (id: string): BlockRef => ({ section, itemId: id });
  const save = (next: ListItem[]) => onChange(withListItems(cv, section, next));
  const upRef = useRef<HTMLButtonElement>(null);
  const downRef = useRef<HTMLButtonElement>(null);
  const moved = useRef(false);

  // After Move up/down the pressed button can become disabled (first or last place), which drops
  // focus. Then focus the other move button, or the first field if that one is disabled too.
  useEffect(() => {
    if (!moved.current) return;
    moved.current = false;
    const active = document.activeElement;
    if (active !== document.body && !(active instanceof HTMLButtonElement && active.disabled)) return;
    const other = [upRef.current, downRef.current].find((b) => b && !b.disabled);
    const firstField = upRef.current
      ?.closest(".side-panel")
      ?.querySelector<HTMLElement>(".side-panel-body :is(input, textarea, select, button)");
    (other ?? firstField)?.focus();
  });

  function moveTo(to: number) {
    moved.current = true;
    save(move(items, index, to));
  }

  function remove() {
    const next = items.filter((x) => x.id !== itemId);
    save(next);
    const neighbour = next[index] ?? next[index - 1];
    onNavigate(neighbour ? ref(neighbour.id) : null);
  }

  function addAnother() {
    const id = newId();
    const next = [...items];
    next.splice(index + 1, 0, { ...blankItem[section](), id });
    save(next);
    onAdd(ref(id));
  }

  const last = items.length - 1;
  return (
    <footer className="side-panel-footer">
      <div className="side-panel-actions">
        <button type="button" className="secondary" onClick={remove}>
          {t("cv.item.remove")}
        </button>
        <button ref={upRef} type="button" className="secondary" disabled={index <= 0} onClick={() => moveTo(index - 1)}>
          {t("cv.item.moveUp")}
        </button>
        <button ref={downRef} type="button" className="secondary" disabled={index >= last} onClick={() => moveTo(index + 1)}>
          {t("cv.item.moveDown")}
        </button>
      </div>
      <div className="side-panel-actions">
        <button type="button" className="secondary" disabled={index <= 0} onClick={() => onNavigate(ref(items[index - 1]!.id))}>
          {t("panel.previous")}
        </button>
        <button type="button" className="secondary" disabled={index >= last} onClick={() => onNavigate(ref(items[index + 1]!.id))}>
          {t("panel.next")}
        </button>
        <button type="button" disabled={items.length >= MAX_ITEMS} onClick={addAnother}>
          {t("panel.addAnother")}
        </button>
      </div>
    </footer>
  );
}
