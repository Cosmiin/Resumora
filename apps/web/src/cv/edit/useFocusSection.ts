import { useEffect, useState, type RefObject } from "react";
import type { CategoryKey } from "@resumora/shared";

export type SectionFocus = { key: CategoryKey; itemId?: string } | null;

/**
 * Follows the cursor on the page: the closest data-section / data-item around whatever has focus.
 * Esc, or a click on empty page space, clears it (and leaves the field). `clear` does the same from outside.
 */
export function useFocusSection(root: RefObject<HTMLElement | null>): [SectionFocus, () => void] {
  const [focus, setFocus] = useState<SectionFocus>(null);

  useEffect(() => {
    const page = root.current;
    if (!page) return;
    const leave = () => {
      setFocus(null);
      if (document.activeElement instanceof HTMLElement && page.contains(document.activeElement)) document.activeElement.blur();
    };
    const onFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      const section = target.closest<HTMLElement>("[data-section]")?.dataset.section;
      if (!section) return;
      const itemId = target.closest<HTMLElement>("[data-item]")?.dataset.item;
      setFocus((prev) => (prev?.key === section && prev.itemId === itemId ? prev : { key: section as CategoryKey, itemId }));
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") leave();
    };
    const onMouseDown = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest("input, textarea, button, select, a")) {
        e.preventDefault();
        leave();
      }
    };
    page.addEventListener("focusin", onFocusIn);
    page.addEventListener("keydown", onKeyDown);
    page.addEventListener("mousedown", onMouseDown);
    return () => {
      page.removeEventListener("focusin", onFocusIn);
      page.removeEventListener("keydown", onKeyDown);
      page.removeEventListener("mousedown", onMouseDown);
    };
  }, [root]);

  return [focus, () => setFocus(null)];
}
