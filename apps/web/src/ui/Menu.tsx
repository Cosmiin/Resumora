import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { buttonClass, type ButtonVariant } from "./Button.tsx";

export type MenuItem = { id: string; label: string; onSelect: () => void; danger?: boolean };

/** A button that opens a short list of actions. Closes on choice, Escape, or a click anywhere else. */
export function Menu(props: { label: ReactNode; items: MenuItem[]; variant?: ButtonVariant; align?: "start" | "end" }) {
  const { label, items, variant = "secondary", align = "end" } = props;
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    root.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function close() {
    setOpen(false);
    trigger.current?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!open) return;
    if (event.key === "Escape") {
      event.stopPropagation();
      close();
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    const entries = [...(root.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const at = entries.indexOf(document.activeElement as HTMLElement);
    const next =
      event.key === "Home" ? 0 : event.key === "End" ? entries.length - 1 : (at + (event.key === "ArrowDown" ? 1 : -1) + entries.length) % entries.length;
    entries[next]?.focus();
  }

  return (
    <div className="ui-menu" ref={root} onKeyDown={onKeyDown}>
      <button
        ref={trigger}
        type="button"
        className={buttonClass(variant)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => setOpen((was) => !was)}
      >
        {label}
      </button>
      {open && (
        <ul className={align === "start" ? "ui-menu-list ui-menu-list--start" : "ui-menu-list"} role="menu" id={listId}>
          {items.map((item) => (
            <li role="none" key={item.id}>
              <button
                type="button"
                role="menuitem"
                className={item.danger ? "ui-menu-item ui-menu-item--danger" : "ui-menu-item"}
                onClick={() => {
                  close();
                  item.onSelect();
                }}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
