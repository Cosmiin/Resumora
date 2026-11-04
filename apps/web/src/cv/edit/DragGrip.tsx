import { forwardRef, type HTMLAttributes } from "react";
import { t } from "../../i18n/t.ts";

type Props = {
  name: string;
  hintId: string;
  gripId: string;
  pressed: boolean;
  onKeyDown(e: React.KeyboardEvent<HTMLButtonElement>): void;
  onBlur?(): void;
  /** Pointer and touch listeners from dnd-kit. */
  pointer?: HTMLAttributes<HTMLButtonElement>;
};

/** The handle for reordering: drag it, or use the keyboard (Space, arrows, Space, Escape). */
export const DragGrip = forwardRef<HTMLButtonElement, Props>(function DragGrip(
  { name, hintId, gripId, pressed, onKeyDown, onBlur, pointer },
  ref,
) {
  return (
    <button
      {...pointer}
      ref={ref}
      type="button"
      className="drag-grip"
      data-grip={gripId}
      aria-label={t("edit.drag", { name })}
      aria-describedby={hintId}
      aria-pressed={pressed}
      onKeyDown={onKeyDown}
      onBlur={onBlur}
    >
      ⠿
    </button>
  );
});
