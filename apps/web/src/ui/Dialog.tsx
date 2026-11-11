import { useEffect, useId, useLayoutEffect, useRef, type ReactNode } from "react";

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

  // A dialog taken off the page while open never ran close(), so focus would not return to the opener.
  // A layout effect cleans up while the element is still on the page.
  useLayoutEffect(() => {
    const dialog = ref.current;
    return () => {
      if (dialog?.open && typeof dialog.close === "function") dialog.close();
    };
  }, []);

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
        // The backdrop belongs to the dialog element, so a backdrop click also targets it;
        // only a click outside the dialog's own box is one.
        if (event.target !== ref.current) return;
        const box = ref.current.getBoundingClientRect();
        const inside = event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom;
        if (!inside) onClose();
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
