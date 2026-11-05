/** Focus the page field with this key and put the caret there (at the end when omitted). */
export function focusField(root: HTMLElement, fieldKey: string, caret?: number): void {
  const el = root.querySelector<HTMLInputElement | HTMLTextAreaElement>(
    `[data-field="${CSS.escape(fieldKey)}"]`,
  );
  if (!el) return;
  el.focus();
  const at = caret ?? el.value.length;
  try {
    el.setSelectionRange(at, at);
  } catch {
    // some input types have no caret; focus is enough
  }
}
