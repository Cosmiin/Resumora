import { createContext, useContext } from "react";
import type { FocusMode } from "./useFocusSession.ts";

export type FocusTarget = { roleId: string; bulletId?: string; mode: FocusMode };

/**
 * Opens focus mode. Only the editor provides it, so anything that reads it (the ✨ button, the
 * score card) renders nothing in `CvDocument`, the PDF or exports.
 */
const FocusOpenContext = createContext<((target: FocusTarget) => void) | null>(null);

export const FocusOpenProvider = FocusOpenContext.Provider;
export const useOpenFocus = () => useContext(FocusOpenContext);
