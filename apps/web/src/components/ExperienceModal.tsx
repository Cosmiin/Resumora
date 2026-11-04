import { useId, useLayoutEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, X } from "lucide-react";
import { Button, useCopy } from "./ui";

/** Native modal isolation keeps the CV inert and contains keyboard focus. */
export function ExperienceModal({
  context,
  title,
  footer,
  showSteps = true,
  wide = false,
  reviewing,
  canReview,
  busy,
  focusKey,
  close,
  notice,
  children,
}: {
  context: string;
  title?: string;
  footer?: ReactNode;
  showSteps?: boolean;
  wide?: boolean;
  reviewing: boolean;
  canReview: boolean;
  busy: boolean;
  focusKey: string;
  close: () => void;
  children: ReactNode;
  notice?: ReactNode;
}) {
  const t = useCopy(),
    titleId = useId(),
    ref = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const dialog = ref.current!;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (!dialog.open) dialog.showModal();
    return () => {
      dialog.close();
      document.body.style.overflow = overflow;
    };
  }, []);
  useLayoutEffect(() => {
    const frame = requestAnimationFrame(() => {
      const stages = Array.from(
        ref.current?.querySelectorAll<HTMLElement>(
          "[data-modal-stage-focus]",
        ) ?? [],
      );
      const stage =
        stages.find((element) => element.getClientRects().length) ?? stages[0];
      stage?.focus({ preventScroll: true });
      ref.current
        ?.querySelectorAll(
          ".experience-modal-scroll,.experience-workspace-layout",
        )
        .forEach((element) => element.scrollTo?.({ top: 0 }));
      if (
        stage?.closest(".guided-inline-questions") ||
        !stage?.closest(".experience-modal-scroll,.experience-workspace-layout")
      )
        stage?.scrollIntoView?.({ block: "nearest" });
      // Programmatic focus must not scroll the dialog's fixed header out of view.
      if (ref.current) ref.current.scrollTop = 0;
    });
    return () => cancelAnimationFrame(frame);
  }, [focusKey]);
  return createPortal(
    <dialog
      ref={ref}
      className={`experience-modal${wide ? " experience-modal-wide" : ""}${footer ? " experience-modal-with-footer" : ""}`}
      aria-labelledby={titleId}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const dialog = ref.current!;
        const controls = Array.from(
          dialog.querySelectorAll<HTMLElement>(
            "button,a[href],input,select,textarea,summary,[tabindex]",
          ),
        ).filter(
          (element) =>
            element.tabIndex >= 0 &&
            !element.matches(":disabled") &&
            element.getClientRects().length,
        );
        const first = controls[0],
          last = controls.at(-1);
        if (!first) {
          event.preventDefault();
          return;
        }
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) close();
      }}
    >
      <header className="experience-modal-header">
        <div className="experience-modal-heading">
          <h2 id={titleId}>
            {title ?? t("Îmbunătățește experiența", "Improve this experience")}
          </h2>
          <Button
            variant="ghost"
            disabled={busy}
            onClick={close}
            aria-label={t("Închide îmbunătățirea", "Close improvement")}
          >
            <X size={20} />
          </Button>
        </div>
        <p className="experience-modal-context">{context}</p>
        {showSteps && (
          <ol
            className="experience-modal-steps"
            aria-label={t("Pașii îmbunătățirii", "Improvement steps")}
          >
            <li
              aria-current={!reviewing ? "step" : undefined}
              className={reviewing ? "is-complete" : "is-current"}
            >
              <span className="experience-step-marker">
                {reviewing ? <Check size={17} aria-hidden="true" /> : "1"}
              </span>
              {t("Adaugă detalii", "Add details")}
            </li>
            {canReview && (
              <li
                aria-current={reviewing ? "step" : undefined}
                className={reviewing ? "is-current" : ""}
              >
                <span className="experience-step-marker">2</span>
                {t("Verifică descrierea", "Review description")}
              </li>
            )}
          </ol>
        )}
        {notice}
      </header>
      <div className="experience-modal-stage">{children}</div>
      {footer && <footer className="guided-footer">{footer}</footer>}
    </dialog>,
    document.body,
  );
}
