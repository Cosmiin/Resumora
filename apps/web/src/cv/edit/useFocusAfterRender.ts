import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { focusField } from "./focus.ts";

/**
 * Ask for a field to get the cursor once the next render has put it on the page.
 * The field is looked up by its key inside the root. Asking schedules that render itself,
 * so it works even when nothing else changed (a field that is already on the page).
 */
export function useFocusAfterRender(root: RefObject<HTMLElement | null>): (fieldKey: string) => void {
  const pending = useRef<string | null>(null);
  const [, render] = useState(0);
  useEffect(() => {
    const key = pending.current;
    if (key === null || !root.current) return;
    pending.current = null;
    focusField(root.current, key);
  });
  return useCallback((fieldKey: string) => {
    pending.current = fieldKey;
    render((n) => n + 1);
  }, []);
}
