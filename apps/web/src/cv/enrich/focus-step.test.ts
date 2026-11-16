import { afterEach, describe, expect, it } from "vitest";
import { BOX_OR_BUTTON_FIRST, focusStep } from "./focus-step.ts";

const realMatchMedia = window.matchMedia;

function screenIs(coarse: boolean) {
  window.matchMedia = ((query: string) => ({ matches: coarse && query === "(pointer: coarse)", media: query, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia;
}

function pane(html: string) {
  const el = document.createElement("div");
  el.innerHTML = html;
  document.body.append(el);
  return el;
}

const STEP = `<h2 id="fm-step-title">How many people?</h2><textarea></textarea><button class="fm-btn">Continue</button>`;

afterEach(() => {
  window.matchMedia = realMatchMedia;
  document.body.innerHTML = "";
});

describe("where focus goes when a step appears", () => {
  it("with no matchMedia, the text box", () => {
    window.matchMedia = undefined as unknown as typeof window.matchMedia;
    const el = pane(STEP);
    focusStep(el);
    expect(document.activeElement).toBe(el.querySelector("textarea"));
  });

  it("with a mouse, the text box", () => {
    screenIs(false);
    const el = pane(STEP);
    focusStep(el);
    expect(document.activeElement).toBe(el.querySelector("textarea"));
  });

  it("with a mouse and the older order, the button when it comes before the text box", () => {
    screenIs(false);
    const el = pane(`<h2 id="fm-step-title">Pick</h2><button class="fm-btn">Use it</button><textarea></textarea>`);
    focusStep(el, BOX_OR_BUTTON_FIRST);
    expect(document.activeElement).toBe(el.querySelector("button"));
  });

  it("on a touch screen, the title, which is made focusable", () => {
    screenIs(true);
    const el = pane(STEP);
    focusStep(el);
    const title = el.querySelector("#fm-step-title");
    expect(document.activeElement).toBe(title);
    expect(title).toHaveAttribute("tabindex", "-1");
  });

  it("on a touch screen with no title, the first enabled main button", () => {
    screenIs(true);
    const el = pane(`<textarea></textarea><button class="fm-btn" disabled>Back</button><button class="fm-btn">Continue</button>`);
    focusStep(el);
    expect(document.activeElement).toHaveTextContent("Continue");
  });
});
