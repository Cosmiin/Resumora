import { render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ConnectedApp } from "./ConnectedApp";
import { blankDraft } from "../base/model";

it("uses durable HTTP loading, keeps the adapter stable, and resets the real editor when the account changes", async () => {
  window.location.hash = "#base";
  let name = "Ana Alpha";
  const transport = vi.fn(async (path: string) => {
    expect(path).toBe("/v1/base-cv");
    const draft = blankDraft();
    draft.name.value = name;
    const [first, last] = name.split(" ");
    draft.nameParts = { first, last };
    return Response.json({
      id: crypto.randomUUID(),
      revision: 1,
      parentId: null,
      createdAt: new Date().toISOString(),
      reason: "save",
      draft,
    });
  });
  const a = { id: "account-a", email: "a@example.invalid" };
  const view = render(<ConnectedApp account={a} transport={transport} />);
  await waitFor(() =>
    expect(
      (screen.getByRole("textbox", { name: /Prenume/ }) as HTMLInputElement)
        .value,
    ).toBe("Ana"),
  );
  view.rerender(<ConnectedApp account={{ ...a }} transport={transport} />);
  expect(transport).toHaveBeenCalledTimes(1);
  name = "Bela Beta";
  view.rerender(
    <ConnectedApp
      account={{ id: "account-b", email: "b@example.invalid" }}
      transport={transport}
    />,
  );
  await waitFor(() =>
    expect(
      (screen.getByRole("textbox", { name: /Prenume/ }) as HTMLInputElement)
        .value,
    ).toBe("Bela"),
  );
  expect(screen.queryByDisplayValue("Ana")).toBeNull();
  expect(transport).toHaveBeenCalledTimes(2);
  window.location.hash = "";
});
