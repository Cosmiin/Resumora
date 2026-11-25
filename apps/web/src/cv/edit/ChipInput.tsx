import { useCallback, useRef, useState, type KeyboardEvent } from "react";
import { t } from "../../i18n/t.ts";
import { PageField } from "./PageField.tsx";

type Props = {
  items: { id: string; name: string }[];
  onAdd(name: string): void;
  onRemove(id: string): void;
  /** Given, a click on a chip's name turns it into a box to fix the name in place. */
  onRename?(id: string, name: string): void;
  label: string;
  tone?: "sort";
  fieldKey: string;
};

const focusAndSelect = (el: HTMLTextAreaElement | HTMLInputElement | null) => {
  if (el && document.activeElement !== el) {
    el.focus();
    el.select();
  }
};

/**
 * Chips: Enter or comma adds one; Backspace in an empty box pulls the last one back to edit.
 * With onRename, clicking a chip edits it in place: Enter or clicking away saves, Esc cancels, an empty name removes it.
 */
export function ChipInput({ items, onAdd, onRemove, onRename, label, tone, fieldKey }: Props) {
  const [text, setText] = useState("");
  const [editing, setEditing] = useState<{ id: string; draft: string } | null>(null);
  // Enter saves and closes the box; the blur that can follow must not save a second time.
  const open = useRef<string | null>(null);

  const commit = useCallback(() => {
    const name = text.trim();
    if (name) onAdd(name);
    setText("");
  }, [text, onAdd]);

  const onKey = useCallback((e: KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commit();
    } else if (e.key === "Backspace" && text === "") {
      const last = items[items.length - 1];
      if (!last) return;
      e.preventDefault();
      onRemove(last.id);
      setText(last.name);
    }
  }, [text, items, commit, onRemove]);

  const startEdit = (item: { id: string; name: string }) => {
    open.current = item.id;
    setEditing({ id: item.id, draft: item.name });
  };

  const finishEdit = (save: boolean) => {
    if (!editing || open.current !== editing.id) return;
    open.current = null;
    const item = items.find((i) => i.id === editing.id);
    const name = editing.draft.trim();
    if (save && item) {
      if (name === "") onRemove(item.id);
      else if (name !== item.name) onRename?.(item.id, name);
    }
    setEditing(null);
  };

  const onEditKey = (e: KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Enter") {
      e.preventDefault();
      finishEdit(true);
    } else if (e.key === "Escape") {
      e.preventDefault();
      finishEdit(false);
    }
  };

  const chipClass = tone === "sort" ? "cv-chip cv-chip-sort" : "cv-chip";
  return (
    <span className="cv-chips">
      {items.map((item) =>
        editing?.id === item.id ? (
          <span key={item.id} className={`${chipClass} is-editing`}>
            <PageField
              ref={focusAndSelect}
              className="cv-chip-edit"
              fieldKey={`${fieldKey}-edit`}
              label={t("edit.editChip", { name: item.name })}
              value={editing.draft}
              onChange={(draft) => setEditing({ id: item.id, draft })}
              onKeyDown={onEditKey}
              onBlur={() => finishEdit(true)}
            />
          </span>
        ) : (
          <span key={item.id} className={chipClass}>
            {onRename ? (
              <button type="button" className="cv-chip-name" aria-label={t("edit.editChip", { name: item.name })} onClick={() => startEdit(item)}>
                {item.name}
              </button>
            ) : (
              item.name
            )}
            <button type="button" className="cv-chip-remove" aria-label={t("edit.removeChip", { name: item.name })} onClick={() => onRemove(item.id)}>
              ×
            </button>
          </span>
        ),
      )}
      <PageField
        className="cv-chip-input"
        fieldKey={fieldKey}
        label={label}
        placeholder={t("edit.addChip")}
        value={text}
        onChange={setText}
        onKeyDown={onKey}
        onBlur={commit}
      />
    </span>
  );
}
