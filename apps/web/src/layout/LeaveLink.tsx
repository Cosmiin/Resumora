import type { MouseEvent } from "react";
import { Link, type LinkProps } from "react-router";
import { hasUnsavedChanges } from "../cv/unsaved.ts";
import { t } from "../i18n/t.ts";

/**
 * A link that leaves the editor. While an edit is still on its way to the server it asks first, like the top
 * navigation: the page it leads to reads the saved CV, so leaving early would lose the edit.
 */
export function LeaveLink({ onClick, ...rest }: LinkProps) {
  const guard = (event: MouseEvent<HTMLAnchorElement>) => {
    if (hasUnsavedChanges() && !window.confirm(t("shell.leaveUnsaved"))) return event.preventDefault();
    onClick?.(event);
  };
  return <Link {...rest} onClick={guard} />;
}
