import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { t } from "../../i18n/t.ts";

type Props = {
  /** The section's name as shown (its own heading, or the standard name). */
  name: string;
  onHide(): void;
  onRename(): void;
  onDelete(): void;
};

/** Tailored CV: the "···" next to a section heading, with Hide, Rename and Delete for this CV only. */
export function SectionMenu({ name, onHide, onRename, onDelete }: Props) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const root = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const items = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (!open) return;
    items.current[0]?.focus();
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  const choose = (action: () => void) => {
    setOpen(false);
    action();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      button.current?.focus();
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const list = items.current.filter((item): item is HTMLButtonElement => item !== null);
    const at = list.indexOf(document.activeElement as HTMLButtonElement);
    list[(at + (event.key === "ArrowDown" ? 1 : -1) + list.length) % list.length]?.focus();
  };

  const entries = [
    { label: t("edit.section.hide"), action: onHide, danger: false },
    { label: t("edit.section.rename"), action: onRename, danger: false },
    { label: t("edit.section.delete"), action: onDelete, danger: true },
  ];
  return (
    <span className="section-menu" ref={root}>
      <button ref={button} type="button" className="section-menu-button" aria-label={t("edit.section.options", { name })}
        aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined} onClick={() => setOpen(!open)}>
        ···
      </button>
      {open && (
        <div id={menuId} role="menu" className="section-menu-list" aria-label={t("edit.section.options", { name })} onKeyDown={onKeyDown}>
          {entries.map((entry, index) => (
            <button key={entry.label} ref={(element) => { items.current[index] = element; }} type="button" role="menuitem"
              tabIndex={-1} className={entry.danger ? "danger" : undefined} onClick={() => choose(entry.action)}>
              {entry.label}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}
