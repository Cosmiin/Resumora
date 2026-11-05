import { useCallback, useState } from "react";
import type { SectionKey } from "@resumora/shared";

/**
 * Sections added this visit stay on the page (and in the panel list) even while still empty,
 * e.g. a blank summary. Never saved: the CV data itself holds no empty sections.
 */
export function useOpenedSections(): [ReadonlySet<SectionKey>, (key: SectionKey) => void] {
  const [opened, setOpened] = useState<ReadonlySet<SectionKey>>(new Set());
  const open = useCallback((key: SectionKey) => setOpened((prev) => (prev.has(key) ? prev : new Set(prev).add(key))), []);
  return [opened, open];
}
