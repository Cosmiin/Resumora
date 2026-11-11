import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setLanguage } from "../i18n/language.ts";
import { Button, ChipGroup, Dialog, Input, LanguageSwitch, Menu, Progress, Stepper, Tabs, ToastProvider, useToast } from "./index.ts";

afterEach(() => setLanguage("en"));

describe("Button", () => {
  it("runs its action when clicked", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Save this role</Button>);
    await userEvent.click(screen.getByRole("button", { name: "Save this role" }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("can't be clicked while loading, and says it is working", async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Save
      </Button>,
    );
    const button = screen.getByRole("button", { name: /Save/ });
    expect(button).toBeDisabled();
    expect(within(button).getByRole("img", { name: "Working…" })).toBeInTheDocument();
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe("Input", () => {
  it("ties the label, hint and error to the field", () => {
    render(<Input label="New password" hint="At least 8 characters." error="Use at least 8 characters." />);
    const field = screen.getByLabelText("New password");
    expect(field).toBeInvalid();
    expect(field).toHaveAccessibleDescription("At least 8 characters. Use at least 8 characters.");
    expect(screen.getByRole("alert")).toHaveTextContent("Use at least 8 characters.");
  });
});

describe("ChipGroup", () => {
  function Question() {
    const [value, setValue] = useState<string | null>(null);
    return (
      <ChipGroup
        legend="About how many automations do you keep running today?"
        options={[
          { value: "few", label: "Fewer than 10" },
          { value: "mid", label: "10 to 30" },
        ]}
        value={value}
        onChange={setValue}
      />
    );
  }

  it("is a radio group named by the question, with one answer at a time", async () => {
    render(<Question />);
    const group = screen.getByRole("group", { name: "About how many automations do you keep running today?" });
    await userEvent.click(within(group).getByRole("radio", { name: "10 to 30" }));
    expect(within(group).getByRole("radio", { name: "10 to 30" })).toBeChecked();
    await userEvent.click(within(group).getByRole("radio", { name: "Fewer than 10" }));
    expect(within(group).getByRole("radio", { name: "10 to 30" })).not.toBeChecked();
  });

  it("moves between answers with the arrow keys", async () => {
    render(<Question />);
    await userEvent.tab();
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("radio", { name: "10 to 30" })).toBeChecked();
  });
});

describe("Menu", () => {
  function ExportMenu({ onPdf = () => undefined }: { onPdf?: () => void }) {
    return (
      <>
        <Menu
          label="Export"
          items={[
            { id: "pdf", label: "CV as PDF", onSelect: onPdf },
            { id: "docx", label: "CV as Word", onSelect: () => undefined },
          ]}
        />
        <button type="button">Re-tailor</button>
      </>
    );
  }

  it("opens, runs the chosen action and closes", async () => {
    const onPdf = vi.fn();
    render(<ExportMenu onPdf={onPdf} />);
    await userEvent.click(screen.getByRole("button", { name: "Export" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "CV as PDF" }));
    expect(onPdf).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("closes when you click anywhere else", async () => {
    render(<ExportMenu />);
    await userEvent.click(screen.getByRole("button", { name: "Export" }));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Re-tailor" }));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("closes when Tab moves focus out of it", async () => {
    render(<ExportMenu />);
    await userEvent.click(screen.getByRole("button", { name: "Export" }));
    await userEvent.tab();
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Re-tailor" })).toHaveFocus();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("closes on Escape and gives focus back to its button", async () => {
    render(<ExportMenu />);
    const trigger = screen.getByRole("button", { name: "Export" });
    await userEvent.click(trigger);
    expect(screen.getByRole("menuitem", { name: "CV as PDF" })).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "CV as Word" })).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});

describe("Tabs", () => {
  function Document() {
    const [tab, setTab] = useState("cv");
    return (
      <Tabs
        label="Document"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "cv", label: "CV", content: <p>The tailored CV.</p> },
          { id: "letter", label: "Cover letter", content: <p>The cover letter.</p> },
        ]}
      />
    );
  }

  it("shows the chosen tab's content, by click or arrow key", async () => {
    render(<Document />);
    expect(screen.getByRole("tabpanel", { name: "CV" })).toHaveTextContent("The tailored CV.");
    await userEvent.click(screen.getByRole("tab", { name: "Cover letter" }));
    expect(screen.getByRole("tabpanel", { name: "Cover letter" })).toHaveTextContent("The cover letter.");
    await userEvent.keyboard("{ArrowLeft}");
    expect(screen.getByRole("tab", { name: "CV" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "CV" })).toHaveFocus();
  });
});

describe("Dialog", () => {
  it("shows its title and content only while open", () => {
    const { rerender } = render(
      <Dialog open={false} onClose={() => undefined} title="Delete your account?">
        <p>This can’t be undone.</p>
      </Dialog>,
    );
    expect(screen.queryByText("This can’t be undone.")).not.toBeInTheDocument();
    rerender(
      <Dialog open onClose={() => undefined} title="Delete your account?">
        <p>This can’t be undone.</p>
      </Dialog>,
    );
    expect(screen.getByRole("dialog", { name: "Delete your account?" })).toHaveTextContent("This can’t be undone.");
  });

  it("closes itself when it is taken off the page while open, so focus returns to the opener", () => {
    const proto = HTMLDialogElement.prototype as { showModal?: unknown; close?: unknown };
    const before = { showModal: proto.showModal, close: proto.close };
    const close = vi.fn();
    proto.showModal = function (this: HTMLDialogElement) { this.setAttribute("open", ""); };
    proto.close = close;
    try {
      const { unmount } = render(<Dialog open onClose={() => undefined} title="Before you tailor"><p>Body</p></Dialog>);
      expect(close).not.toHaveBeenCalled();
      unmount();
      expect(close).toHaveBeenCalledTimes(1);
    } finally {
      proto.showModal = before.showModal;
      proto.close = before.close;
    }
  });

  it("closes on a click outside its box, not on a click on its own padding", () => {
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose} title="Pick a language">
        <p>Body</p>
      </Dialog>,
    );
    const dialog = screen.getByRole("dialog");
    dialog.getBoundingClientRect = () => ({ left: 100, right: 500, top: 100, bottom: 400, width: 400, height: 300, x: 100, y: 100, toJSON: () => ({}) });
    fireEvent.click(dialog, { clientX: 110, clientY: 110 });
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(dialog, { clientX: 20, clientY: 20 });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("asks to close when the browser cancels it (Escape)", () => {
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose} title="Pick a language">
        <p>Body</p>
      </Dialog>,
    );
    screen.getByRole("dialog").dispatchEvent(new Event("cancel", { cancelable: true }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe("Toast", () => {
  function Saver() {
    const toast = useToast();
    return <Button onClick={() => toast.show("Saved. Next role: IT Support.")}>Save</Button>;
  }

  it("announces a message and can be closed", async () => {
    render(
      <ToastProvider>
        <Saver />
      </ToastProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("status")).toHaveTextContent("Saved. Next role: IT Support.");
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });
});

describe("Progress and Stepper", () => {
  it("reports the count in words", () => {
    render(<Progress label="Role 1 of 3" valueText="2 of 4 answered" value={2} max={4} />);
    const bar = screen.getByRole("progressbar", { name: "Role 1 of 3" });
    expect(bar).toHaveAttribute("aria-valuenow", "2");
    expect(bar).toHaveAttribute("aria-valuetext", "2 of 4 answered");
  });

  it("marks the current step", () => {
    render(<Stepper label="Tailoring steps" steps={["Language", "Keywords", "Roles"]} current={1} />);
    const steps = within(screen.getByRole("list", { name: "Tailoring steps" })).getAllByRole("listitem");
    expect(steps[1]).toHaveAttribute("aria-current", "step");
    expect(steps[0]).not.toHaveAttribute("aria-current");
  });
});

describe("LanguageSwitch", () => {
  it("switches kit copy to Romanian and back", async () => {
    render(
      <>
        <LanguageSwitch />
        <Button loading>Save</Button>
      </>,
    );
    expect(screen.getByRole("img", { name: "Working…" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Română" }));
    expect(screen.getByRole("img", { name: "Se lucrează…" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Limba interfeței" })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("ro");
  });
});
