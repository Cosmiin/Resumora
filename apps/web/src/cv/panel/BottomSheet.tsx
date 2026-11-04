import { useRef, type ReactNode } from "react";
import { t } from "../../i18n/t.ts";

export type SheetState = "peek" | "full";

type Props = { state: SheetState; onStateChange(s: SheetState): void; children: ReactNode };

const DRAG_DISTANCE = 40;

/** On phones the helper panel sits at the foot of the screen: a short peek, or up to 80% when full. */
export function BottomSheet({ state, onStateChange, children }: Props) {
  const startY = useRef<number | null>(null);
  const dragged = useRef(false);

  function release(clientY: number) {
    if (startY.current === null) return;
    const moved = clientY - startY.current;
    startY.current = null;
    if (Math.abs(moved) > DRAG_DISTANCE) {
      dragged.current = true;
      onStateChange(moved < 0 ? "full" : "peek");
    }
  }

  return (
    <div
      className={`sheet ${state === "peek" ? "peek" : "full"}`}
      onKeyDown={(e) => {
        if (e.key === "Escape") onStateChange("peek");
      }}
    >
      <button
        type="button"
        className="sheet-grip"
        aria-label={t("panel.sheetGrip")}
        aria-expanded={state === "full"}
        onPointerDown={(e) => {
          startY.current = e.clientY;
          dragged.current = false;
        }}
        onPointerUp={(e) => release(e.clientY)}
        onPointerCancel={() => (startY.current = null)}
        onClick={() => {
          // A drag already changed the state; a plain tap toggles it.
          if (dragged.current) dragged.current = false;
          else onStateChange(state === "full" ? "peek" : "full");
        }}
      />
      <div className="sheet-body">{children}</div>
    </div>
  );
}
