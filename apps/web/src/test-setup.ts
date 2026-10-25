import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";
afterEach(() => {
  cleanup();
  window.location.hash = "";
  vi.restoreAllMocks();
});
// jsdom has no native modal behavior. This enables confirmation interaction only;
// focus trapping, Escape, backdrop and visual behavior still require a real browser.
HTMLDialogElement.prototype.showModal = function () {
  this.open = true;
};
HTMLDialogElement.prototype.close = function () {
  this.open = false;
};
