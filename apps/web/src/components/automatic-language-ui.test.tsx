import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { StartChooser } from "./BaseScreens";
import { ImportDocument } from "./ImportDocument";
import { LanguageContext } from "./ui";
import { blankDraft } from "../base/model";
import { MemoryBaseCvAdapter } from "../base/adapter";
import { App } from "../test-editor-harness";
it("seeds a truly new manual profile from interface language", () => {
  const start = vi.fn();
  render(
    <LanguageContext value="en">
      <StartChooser start={start} />
    </LanguageContext>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Enter manually" }));
  expect(start.mock.calls[0][0].language).toBe("en");
});
it("blocks direct upload with an existing base before import hooks run", () => {
  const client = { listImports: vi.fn() } as any;
  render(
    <LanguageContext value="en">
      <ImportDocument
        client={client}
        revision={1}
        start={vi.fn()}
        profile={blankDraft()}
      />
    </LanguageContext>,
  );
  expect(
    screen.getByText(/Delete your current Base CV before uploading another/),
  ).toBeTruthy();
  expect(client.listImports).not.toHaveBeenCalled();
});
it("removes routine base language selectors and update entry", async () => {
  const adapter = new MemoryBaseCvAdapter(),
    draft = blankDraft();
  draft.name.value = "Language Owner";
  await adapter.save({
    draft,
    mode: "autosave",
    expectedRevision: 0,
    requestId: crypto.randomUUID(),
  });
  window.location.hash = "base";
  render(<App adapter={adapter} />);
  fireEvent.change(await screen.findByLabelText("Limba interfeței"), {
    target: { value: "en" },
  });
  await screen.findByRole("button", { name: "Remove Base CV" });
  expect(screen.queryByRole("combobox", { name: "CV language" })).toBeNull();
  expect(screen.queryByText("Profile CV language")).toBeNull();
  expect(screen.queryByRole("button", { name: "Update from a CV" })).toBeNull();
});
it("explains delete-first on an existing-base direct route even without AI configured", () => {
  render(
    <LanguageContext value="en">
      <StartChooser start={vi.fn()} profile={blankDraft()} />
    </LanguageContext>,
  );
  expect(
    screen.getByText(/Delete your current Base CV before uploading another/),
  ).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Enter manually" })).toBeNull();
});
