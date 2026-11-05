/**
 * Whether the open editor has changes the server doesn't have yet.
 * Set by useAutosave; read by actions that would leave the editor (e.g. Sign out).
 */
let unsaved = false;

export function setUnsavedChanges(value: boolean): void {
  unsaved = value;
}

export function hasUnsavedChanges(): boolean {
  return unsaved;
}
