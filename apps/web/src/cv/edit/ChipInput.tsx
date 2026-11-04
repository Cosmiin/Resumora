import { useState, type KeyboardEvent } from "react";
import { t } from "../../i18n/t.ts";
import { PageField } from "./PageField.tsx";

type Props = {
  items: { id: string; name: string }[];
  onAdd(name: string): void;
  onRemove(id: string): void;
  label: string;
  tone?: "sort";
  fieldKey?: string;
};

/** Chips: Enter or comma adds one; Backspace in an empty box pulls the last one back to edit. */
export function ChipInput({ items, onAdd, onRemove, label, tone, fieldKey }: Props) {
  const [text, setText] = useState("");

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      const name = text.trim();
      if (name) {
        onAdd(name);
        setText("");
      }
    } else if (e.key === "Backspace" && text === "") {
      const last = items[items.length - 1];
      if (!last) return;
      e.preventDefault();
      onRemove(last.id);
      setText(last.name);
    }
  };

  return (
    <span className="cv-chips">
      {items.map((item) => (
        <span key={item.id} className={tone === "sort" ? "cv-chip cv-chip-sort" : "cv-chip"}>
          {item.name}
          <button type="button" aria-label={t("edit.removeChip", { name: item.name })} onClick={() => onRemove(item.id)}>
            ×
          </button>
        </span>
      ))}
      <PageField
        className="cv-chip-input"
        fieldKey={fieldKey ?? `chips-${label}`}
        label={label}
        placeholder={t("edit.addChip")}
        value={text}
        onChange={setText}
        onKeyDown={onKey}
      />
    </span>
  );
}
