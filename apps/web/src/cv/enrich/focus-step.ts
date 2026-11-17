const TITLE = "#fm-step-title";
const BUTTON = ".fm-btn:not(:disabled)";
const TEXT_BOX = "textarea:not(:disabled)";

/** A screen you touch: focus in a text box there opens the on-screen keyboard over half the step. */
const touchScreen = () => typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;

/**
 * Where focus goes when a step of a focus screen appears.
 * With a mouse and keyboard: the first of `order` that the step has (by default the text box, then the title, then the main button).
 * On a touch screen: the step's title, so the whole question is on screen and the keyboard waits for a tap.
 */
export function focusStep(pane: HTMLElement, order: string[] = [TEXT_BOX, TITLE, BUTTON]) {
  const first = (selectors: string[]) => {
    for (const selector of selectors) {
      const el = pane.querySelector<HTMLElement>(selector);
      if (el) return el;
    }
    return null;
  };
  const el = touchScreen() ? first([TITLE, BUTTON]) : first(order);
  if (!el) return;
  // A heading takes focus only when it is told it can.
  if (el.matches(TITLE) && !el.hasAttribute("tabindex")) el.tabIndex = -1;
  el.focus();
}

/** The older focus screens: the text box or the main button, whichever comes first, then the title. */
export const BOX_OR_BUTTON_FIRST = [`${TEXT_BOX}, ${BUTTON}`, TITLE];
/** Screens with no text box to start in: the title, then the main button. */
export const TITLE_FIRST = [TITLE, BUTTON];
