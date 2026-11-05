import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Question } from "@resumora/shared";

const api = vi.hoisted(() => ({ createVoiceSession: vi.fn() }));
vi.mock("./enrich-api.ts", () => api);

import { AnswerBox, type Via } from "./AnswerBox.tsx";

const question: Question = {
  bulletId: "b1",
  kind: "detail",
  text: "What papers did you handle?",
  options: ["Customs papers", "Carrier invoices", "Delivery notes"],
};

function Harness({ onChange, q = question }: { onChange?: (value: string, via: Via[]) => void; q?: Question }) {
  const [s, set] = useState<{ value: string; via: Via[] }>({ value: "", via: [] });
  return (
    <AnswerBox
      question={q}
      value={s.value}
      via={s.via}
      onChange={(value, via) => {
        onChange?.(value, via);
        set({ value, via });
      }}
    />
  );
}

const box = () => screen.getByRole("textbox", { name: "Your answer" });

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AnswerBox: picking and typing", () => {
  it("shows a chip per option, then a last 'Something else' chip that focuses the box", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const chips = screen.getAllByRole("button").filter((b) => b.classList.contains("answer-opt"));
    expect(chips.map((c) => c.textContent)).toEqual([...question.options, "Something else"]);
    await user.click(screen.getByRole("button", { name: "Something else" }));
    expect(box()).toHaveFocus();
  });

  it("joins picked chips with ', ' and removes one when picked again", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "Customs papers" }));
    await user.click(screen.getByRole("button", { name: "Carrier invoices" }));
    expect(box()).toHaveValue("Customs papers, Carrier invoices");
    expect(onChange).toHaveBeenLastCalledWith("Customs papers, Carrier invoices", ["pick"]);
    expect(screen.getByRole("button", { name: "Customs papers" })).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "Customs papers" }));
    expect(box()).toHaveValue("Carrier invoices");
    expect(screen.getByRole("button", { name: "Customs papers" })).toHaveAttribute("aria-pressed", "false");
  });

  it("keeps typed text when chips are added and removed", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(box(), "Checked every crate");
    await user.click(screen.getByRole("button", { name: "Delivery notes" }));
    expect(box()).toHaveValue("Checked every crate, Delivery notes");
    await user.click(screen.getByRole("button", { name: "Carrier invoices" }));
    await user.click(screen.getByRole("button", { name: "Delivery notes" }));
    expect(box()).toHaveValue("Checked every crate, Carrier invoices");
  });

  it("handles an option that itself contains ', '", async () => {
    const user = userEvent.setup();
    render(<Harness q={{ ...question, options: ["Phone, email", "Customs papers"] }} />);
    const chip = () => screen.getByRole("button", { name: "Phone, email" });
    await user.click(chip());
    expect(box()).toHaveValue("Phone, email");
    expect(chip()).toHaveAttribute("aria-pressed", "true");
    await user.click(chip());
    expect(box()).toHaveValue("");
    await user.type(box(), "Mostly by fax");
    await user.click(chip());
    await user.click(screen.getByRole("button", { name: "Customs papers" }));
    expect(box()).toHaveValue("Mostly by fax, Phone, email, Customs papers");
    expect(chip()).toHaveAttribute("aria-pressed", "true");
    await user.click(chip());
    expect(box()).toHaveValue("Mostly by fax, Customs papers");
    expect(chip()).toHaveAttribute("aria-pressed", "false");
  });

  it("a chip never saves or submits anything", async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const onSubmit = vi.fn((e: { preventDefault(): void }) => e.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <Harness />
      </form>,
    );
    await user.click(screen.getByRole("button", { name: "Customs papers" }));
    await user.click(screen.getByRole("button", { name: "Something else" }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(api.createVoiceSession).not.toHaveBeenCalled();
  });

  it("typing after picking gives via ['pick', 'type']", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "Customs papers" }));
    await user.type(box(), " daily");
    expect(onChange).toHaveBeenLastCalledWith("Customs papers daily", ["pick", "type"]);
  });
});

