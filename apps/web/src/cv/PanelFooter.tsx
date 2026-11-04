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
        <button type="button" className="secondary" disabled={index <= 0} onClick={() => save(move(items, index, index - 1))}>
          {t("cv.item.moveUp")}
        </button>
        <button type="button" className="secondary" disabled={index >= last} onClick={() => save(move(items, index, index + 1))}>
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
