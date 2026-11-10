import { useEffect, useId, useRef, type ReactNode } from "react";

/**
 * A modal dialog for a task that needs the person's full attention (confirm a delete, pick a language).
 * Built on the browser's own dialog element: focus stays inside, Escape closes, focus returns to the opener.
 */
export function Dialog(props: { open: boolean; onClose: () => void; title: string; children: ReactNode; actions?: ReactNode }) {
  const { open, onClose, title, children, actions } = props;
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      // jsdom has no showModal; the attribute is enough for tests.
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    } else if (!open && dialog.open) {
      if (typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="ui-dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === ref.current) onClose(); // a click on the backdrop
      }}
    >
      {open && (
        <>
          <h2 className="ui-dialog-title" id={titleId}>
            {title}
          </h2>
          {children}
          {actions && <div className="ui-dialog-actions">{actions}</div>}
        </>
      )}
    </dialog>
  );
}
