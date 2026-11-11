import { useEffect } from "react";
import { t } from "../../i18n/t.ts";

/** How many focus screens are open, and what the page's scrolling was before the first one. */
const lock = { open: 0, before: "" };

/** The top bar of every focus screen: where you are, and the ways out. No app navigation. */
export function FocusBar({ context, name, onClose, skip, closeLabel }: {
  context?: string; name?: string; onClose(): void; skip?: { label: string; onSkip(): void };
  /** The way out, when it is not "Save and exit" (the import says "Cancel"). */
  closeLabel?: string;
}) {
  // A focus screen covers the page: only the screen scrolls while it is open.
  useEffect(() => {
    if (lock.open++ === 0) {
      lock.before = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    return () => {
      if (--lock.open === 0) document.body.style.overflow = lock.before;
    };
  }, []);
  return (
    <header className="fm-bar">
      <span className="fm-brand">{t("app.name")}</span>
      <p className="fm-ctx">
        {context && <span>{context}</span>}{context && name ? ": " : ""}{name && <b>{name}</b>}
      </p>
      <div className="fm-bar-actions">
        {skip && <button type="button" className="ui-btn ui-btn--quiet ui-btn--sm" onClick={skip.onSkip}>{skip.label}</button>}
        <button type="button" className="ui-btn ui-btn--quiet ui-btn--sm fm-close" onClick={onClose}>{closeLabel ?? t("enrich.focus.close")}</button>
      </div>
    </header>
  );
}
