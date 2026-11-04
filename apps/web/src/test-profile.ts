import { fireEvent, screen } from "@testing-library/react";

/** Reveal the small identity and presentation controls, without a second editor. */
export async function openProfileDetails() {
  const summary = await screen.findByText(
    /^(Detalii despre nume|Name details)$/,
  );
  if (!(summary.parentElement as HTMLDetailsElement).open)
    fireEvent.click(summary);
  await openProfilePresentation();
}
export async function openProfilePresentation() {
  const summary = await screen.findByText(
    /^(Aspect, limbă și export|Appearance, language & export)$/,
  );
  if (!(summary.parentElement as HTMLDetailsElement).open)
    fireEvent.click(summary);
}
