import { useCallback, useEffect, useRef, type RefObject } from "react";
import { focusField } from "./focus.ts";

/**
 * Ask for a field to get the cursor once the next render has put it on the page.
 * The field is looked up by its key inside the root.
 */
export function useFocusAfterRender(root: RefObject<HTMLElement | null>): (fieldKey: string) => void {
  const pending = useRef<string | null>(null);
  useEffect(() => {
    const key = pending.current;
    if (key === null || !root.current) return;
    pending.current = null;
    focusField(root.current, key);
  });
  return useCallback((fieldKey: string) => {
    pending.current = fieldKey;
  }, []);
}
