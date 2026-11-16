import { useRef, type PointerEvent, type ReactNode } from "react";
import { t } from "../../i18n/t.ts";

export type SheetState = "peek" | "full";

type Props = { state: SheetState; onStateChange(s: SheetState): void; children: ReactNode };

/** A release this far from where the drag began switches the state. */
const DRAG_DISTANCE = 40;
/** Movement under this is a tap, not a drag. */
const TAP_SLOP = 8;
/** A release faster than this (px per ms) is a flick: its direction decides, however short. */
const FLICK_SPEED = 0.5;
/** How much of a short sheet shows, above the phone's own bottom inset. The same 176 as `--sheet-peek` in editor.css. */
const PEEK_HEIGHT = 176;
/** A click that belongs to a drag arrives at once; after this long (ms) the next click is its own. */
const CLICK_AFTER_DRAG = 350;

type Drag = { startY: number; base: number; travel: number; moved: boolean; prevY: number; prevT: number; lastY: number; lastT: number };

/**
 * On phones the helper panel sits at the foot of the screen: a short peek, or up to 80% when full.
 * It is always laid out at its full size and pushed down while short, so a drag can move it with the finger.
 */
export function BottomSheet({ state, onStateChange, children }: Props) {
  const sheet = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  /** The click that follows a drag belongs to the drag, not to the control under the finger. */
  const swallowClick = useRef(false);

  function start(e: PointerEvent<HTMLDivElement>) {
    swallowClick.current = false;
    const onGrip = (e.target as Element).closest(".sheet-grip") !== null;
    if (!onGrip && state !== "peek") return;
    const el = sheet.current;
    // The sheet's bottom padding is the phone's bottom inset, which the short size adds to its 176 px.
    const inset = el ? parseFloat(getComputedStyle(el).paddingBottom) || 0 : 0;
    const travel = Math.max(0, (el?.offsetHeight ?? 0) - PEEK_HEIGHT - inset);
    const now = performance.now();
    drag.current = { startY: e.clientY, base: state === "peek" ? travel : 0, travel, moved: false, prevY: e.clientY, prevT: now, lastY: e.clientY, lastT: now };
  }

  function move(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    const el = sheet.current;
    if (!d || !el) return;
    const dy = e.clientY - d.startY;
    if (!d.moved) {
      if (Math.abs(dy) < TAP_SLOP) return;
      d.moved = true;
      // Keep the drag when the pointer leaves the sheet (a mouse does; a finger is held by the browser).
      try { el.setPointerCapture?.(e.pointerId); } catch { /* the pointer is already gone */ }
    }
    d.prevY = d.lastY;
    d.prevT = d.lastT;
    d.lastY = e.clientY;
    d.lastT = performance.now();
    el.style.transition = "none";
    el.style.transform = `translateY(${Math.min(d.travel, Math.max(0, d.base + dy))}px)`;
  }

  function end(e: PointerEvent<HTMLDivElement>, cancelled = false) {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    const el = sheet.current;
    if (el) {
      el.style.transition = "";
      el.style.transform = "";
    }
    if (cancelled) return;
    const dy = e.clientY - d.startY;
    if (d.moved || Math.abs(dy) > DRAG_DISTANCE) {
      // A finger's drag sends no click at all: don't let the flag wait for a later keyboard press.
      swallowClick.current = true;
      setTimeout(() => (swallowClick.current = false), CLICK_AFTER_DRAG);
    }
    const speed = d.moved && d.lastT > d.prevT ? (d.lastY - d.prevY) / (d.lastT - d.prevT) : 0;
    const flick = Math.abs(speed) > FLICK_SPEED;
    if (Math.abs(dy) > DRAG_DISTANCE || flick) onStateChange((flick ? speed : dy) < 0 ? "full" : "peek");
  }

  return (
    <div
      ref={sheet}
      className={`sheet ${state === "peek" ? "peek" : "full"}`}
      onPointerDown={start}
      onPointerMove={move}
      onPointerUp={(e) => end(e)}
      onPointerCancel={(e) => end(e, true)}
      onClickCapture={(e) => {
        if (!swallowClick.current) return;
        swallowClick.current = false;
        e.preventDefault();
        e.stopPropagation();
      }}
      onFocus={(e) => {
        // The lower part of a short sheet is off screen: keyboard focus there opens it.
        if (state !== "peek" || (e.target as Element).closest(".sheet-grip")) return;
        let byKeyboard = false;
        try { byKeyboard = (e.target as Element).matches(":focus-visible"); } catch { /* no :focus-visible here */ }
        if (byKeyboard) onStateChange("full");
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onStateChange("peek");
      }}
    >
      <button
        type="button"
        className="sheet-grip"
        aria-label={t("panel.sheetGrip")}
        aria-expanded={state === "full"}
        onClick={() => onStateChange(state === "full" ? "peek" : "full")}
      />
      <div className="sheet-body">{children}</div>
    </div>
  );
}
