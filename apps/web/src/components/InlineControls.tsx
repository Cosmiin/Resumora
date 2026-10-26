import { useRef, useState, type ReactNode } from "react";
import { GripVertical, Eye, EyeOff, X } from "lucide-react";
import { type Fact, editFact, fact } from "../base/model";
import { moveItem } from "../base/editing";
import { useCopy } from "./ui";

export function Visibility({
  label,
  visible,
  toggle,
  keyboardReachable = false,
}: {
  label: string;
  visible: boolean;
  toggle: () => void;
  keyboardReachable?: boolean;
}) {
  const t = useCopy();
  return (
    <button
      type="button"
      className="icon-button visibility"
      tabIndex={keyboardReachable ? 0 : -1}
      aria-label={`${visible ? t("Ascunde", "Hide") : t("Arată", "Show")}: ${label}`}
      aria-pressed={visible}
      title={t("Vizibilitate · Alt+V în câmp", "Visibility · Alt+V in field")}
      onClick={toggle}
    >
      {visible ? <Eye size={15} /> : <EyeOff size={15} />}
    </button>
  );
}
export function Sortable({
  group,
  index,
  label,
  move,
  children,
}: {
  group: string;
  index: number;
  label: string;
  move: (from: number, to: number) => void;
  children: ReactNode;
}) {
  const t = useCopy();
  function perform(from: number, to: number) {
    const focused = document.activeElement as HTMLElement | null;
    move(from, to);
    requestAnimationFrame(() => {
      if (focused?.isConnected) focused.focus();
    });
  }
  return (
    <div
      className="sortable"
      onKeyDown={(e) => {
        if (e.altKey && ["ArrowUp", "ArrowDown"].includes(e.key)) {
          e.preventDefault();
          e.stopPropagation();
          perform(index, index + (e.key === "ArrowUp" ? -1 : 1));
        }
      }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("application/x-resumora-order"))
          e.preventDefault();
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        try {
          const payload = JSON.parse(
            e.dataTransfer.getData("application/x-resumora-order"),
          );
          if (payload.group === group) perform(payload.index, index);
        } catch {
          /* Ignore external drops. */
        }
      }}
    >
      <button
        type="button"
        className="icon-button drag-handle"
        tabIndex={group === "sections" ? 0 : -1}
        draggable
        title={t("Trage sau Alt+↑/↓", "Drag or Alt+↑/↓")}
        aria-label={`${t("Reordonează", "Reorder")}: ${label}`}
        onDragStart={(e) => {
          e.dataTransfer.setData(
            "application/x-resumora-order",
            JSON.stringify({ group, index }),
          );
          e.dataTransfer.effectAllowed = "move";
          e.stopPropagation();
        }}
        onKeyDown={(e) => {
          if (e.altKey && ["ArrowUp", "ArrowDown"].includes(e.key)) {
            e.preventDefault();
            e.stopPropagation();
            perform(index, index + (e.key === "ArrowUp" ? -1 : 1));
          }
        }}
      >
        <GripVertical size={17} />
      </button>
      {children}
    </div>
  );
}
export function ChipInput({
  label,
  items,
  change,
}: {
  label: string;
  items: Fact<string>[];
  change: (items: Fact<string>[]) => void;
}) {
  const t = useCopy(),
    ref = useRef<HTMLInputElement>(null);
  const skipBlur = useRef(false);
  const pending = useRef<string | null>(null);
  const [editing, setEditing] = useState<Fact<string> | null>(null);
  const text = items.find((s) => s.fieldId === pending.current)?.value ?? "";
  function publish(raw: string) {
    if (!raw) {
      const id = pending.current;
      pending.current = null;
      change(items.filter((s) => s.fieldId !== id));
      return;
    }
    const current = items.find((s) => s.fieldId === pending.current);
    const next = current ? editFact(current, raw) : fact(raw);
    pending.current = next.fieldId;
    change(
      current
        ? items.map((s) => (s.fieldId === next.fieldId ? next : s))
        : [...items, next],
    );
  }
  function add(raw: string) {
    const words = raw
      .split(/[,\n\r]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const current = items.find((s) => s.fieldId === pending.current);
    if (!current && !words.length) return;
    const remaining = items.filter((s) => s.fieldId !== pending.current);
    change([
      ...remaining,
      ...words.map((s, i) =>
        i === 0 && current ? editFact(current, s) : fact(s),
      ),
    ]);
    pending.current = null;
  }
  function commit(item: Fact<string>) {
    if (item.value.trim())
      change(
        items.map((s) =>
          s.fieldId === item.fieldId ? editFact(s, item.value.trim()) : s,
        ),
      );
    else change(items.filter((s) => s.fieldId !== item.fieldId));
    setEditing(null);
    ref.current?.focus();
  }
  return (
    <div className="chip-field">
      <label htmlFor={`chip-${label}`}>{label}</label>
      <div className="chip-input">
        {items.map((item, i) =>
          item.fieldId === pending.current ? null : (
            <Sortable
              key={item.fieldId}
              group={label}
              index={i}
              label={item.value}
              move={(from, to) => change(moveItem(items, from, to))}
            >
              <span className="skill-chip">
                {editing?.fieldId === item.fieldId ? (
                  <input
                    aria-label={t("Editează competența", "Edit skill")}
                    autoFocus
                    value={item.value}
                    onChange={(e) =>
                      change(
                        items.map((s) =>
                          s.fieldId === item.fieldId
                            ? editFact(s, e.target.value)
                            : s,
                        ),
                      )
                    }
                    onBlur={() => {
                      if (skipBlur.current) {
                        skipBlur.current = false;
                        return;
                      }
                      commit(item);
                    }}
                    onKeyDown={(e) => {
                      if (e.nativeEvent.isComposing) return;
                      if (e.key === "Enter") {
                        e.preventDefault();
                        skipBlur.current = true;
                        commit(item);
                      }
                      if (e.key === "Escape") {
                        e.preventDefault();
                        skipBlur.current = true;
                        change(
                          items.map((s) =>
                            s.fieldId === item.fieldId ? editing : s,
                          ),
                        );
                        setEditing(null);
                        ref.current?.focus();
                      }
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    className="chip-text"
                    onClick={() => {
                      setEditing(item);
                    }}
                  >
                    {item.value}
                  </button>
                )}
                <button
                  type="button"
                  className="chip-remove icon-button"
                  aria-label={`${t("Elimină", "Remove")}: ${item.value}`}
                  onClick={() => {
                    change(items.filter((s) => s.fieldId !== item.fieldId));
                    ref.current?.focus();
                  }}
                >
                  <X size={14} />
                </button>
              </span>
            </Sortable>
          ),
        )}
        <input
          ref={ref}
          id={`chip-${label}`}
          aria-label={label}
          value={text}
          placeholder={t("Scrie și Enter…", "Type and Enter…")}
          onChange={(e) => {
            if (e.target.value.includes(",")) add(e.target.value);
            else publish(e.target.value);
          }}
          onPaste={(e) => {
            const raw = e.clipboardData.getData("text");
            if (/[,\n\r]/.test(raw)) {
              e.preventDefault();
              const field = e.currentTarget;
              const start = field.selectionStart ?? field.value.length;
              const end = field.selectionEnd ?? start;
              add(field.value.slice(0, start) + raw + field.value.slice(end));
            }
          }}
          onBlur={() => {
            if (pending.current) add(text);
          }}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              e.stopPropagation();
              add(text);
            }
            if (e.key === "Backspace" && !text && items.length) {
              e.preventDefault();
              change(items.slice(0, -1));
            }
            if (e.key === "Escape") {
              e.preventDefault();
              change(items.filter((s) => s.fieldId !== pending.current));
              pending.current = null;
            }
          }}
        />
      </div>
    </div>
  );
}
