/** The add button is always on the page so Tab reaches it; the style shows it on hover and focus. */
export function AddButton({ label, onClick }: { label: string; onClick(): void }) {
  return (
    <button type="button" className="adder" onClick={onClick}>
      {label}
    </button>
  );
}
