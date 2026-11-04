import type { ReactNode } from "react";
import { newId } from "@resumora/shared";
import { t } from "../i18n/t.ts";
import type { MessageKey } from "../i18n/en.ts";

export function TextField(props: {
  label: string;
  value: string;
  onChange(value: string): void;
  multiline?: boolean;
  type?: "text" | "email" | "tel" | "url" | "month";
}) {
  const { label, value, onChange, multiline, type = "text" } = props;
  return (
    <label>
      {label}
      {multiline ? (
        <textarea rows={4} value={value} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input type={type} value={value} onChange={(e) => onChange(e.target.value)} />
      )}
    </label>
  );
}

/** Returns a copy of `obj` with `key` set — used to update one field of a list item. */
export function set<T, K extends keyof T>(obj: T, key: K, value: T[K]): T {
  return { ...obj, [key]: value };
}

function move<T>(items: T[], from: number, to: number): T[] {
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}

/** A titled section holding a reorderable list of items with stable ids. */
export function ItemList<T extends { id: string }>(props: {
  title: MessageKey;
  addLabel: MessageKey;
  items: T[];
  onChange(items: T[]): void;
  create(): Omit<T, "id">;
  renderItem(item: T, update: (next: T) => void): ReactNode;
}) {
  const { title, addLabel, items, onChange, create, renderItem } = props;
  return (
    <section className="cv-section">
      <h2>{t(title)}</h2>
      {items.map((item, i) => (
        <fieldset key={item.id} className="cv-item">
          {renderItem(item, (next) => onChange(items.map((x) => (x.id === item.id ? next : x))))}
          <div className="cv-item-actions">
            <button type="button" className="secondary" disabled={i === 0} onClick={() => onChange(move(items, i, i - 1))}>
              {t("cv.item.moveUp")}
            </button>
            <button type="button" className="secondary" disabled={i === items.length - 1} onClick={() => onChange(move(items, i, i + 1))}>
              {t("cv.item.moveDown")}
            </button>
            <button type="button" className="secondary" onClick={() => onChange(items.filter((x) => x.id !== item.id))}>
              {t("cv.item.remove")}
            </button>
          </div>
        </fieldset>
      ))}
      <button type="button" onClick={() => onChange([...items, { ...create(), id: newId() } as T])}>
        {t(addLabel)}
      </button>
    </section>
  );
}
