import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { translate } from "../../i18n/t.ts";
import { PrepRing, ringLine, type PrepRow } from "./PrepRing.tsx";

const rows: PrepRow[] = [
  { id: "a", name: "Ecommerce Manager · Acme", answers: 3, state: "done" },
  { id: "b", name: "Store Specialist · Beta", answers: 1, state: "working" },
  { id: "c", name: "Researcher · Gamma", answers: 0, state: "working" },
];

afterEach(() => vi.useRealTimers());

describe("PrepRing", () => {
  it("counts the finished roles in its label and middle, with one piece per role", () => {
    const { container } = render(<PrepRing rows={rows} />);
    expect(screen.getByRole("img", { name: "1 of 3 roles ready" })).toBeInTheDocument();
    expect(screen.getByText("1/3")).toBeInTheDocument();
    expect(screen.getByText("roles ready")).toBeInTheDocument();
    expect([...container.querySelectorAll(".prep-ring-seg")].map((s) => s.getAttribute("data-state"))).toEqual(["done", "working", "working"]);
  });

  it("names a working role with its answers, then the next one after 1.6 seconds", () => {
    vi.useFakeTimers();
    render(<PrepRing rows={rows} />);
    expect(screen.getByText("Placing 1 answer in Store Specialist · Beta")).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(1600); });
    expect(screen.getByText("Working on Researcher · Gamma")).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(1600); });
    expect(screen.getByText("Placing 1 answer in Store Specialist · Beta")).toBeInTheDocument();
  });

  it("shows finished roles as chips, a failed one as not placed", () => {
    render(<PrepRing rows={[...rows.slice(0, 2), { ...rows[2]!, state: "failed" }]} />);
    expect(screen.getByText("✓ Ecommerce Manager · Acme")).toBeInTheDocument();
    expect(screen.getByText("Researcher · Gamma: not placed")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "2 of 3 roles ready" })).toBeInTheDocument();
  });

  it("words the line for 3, 1 and 0 answers, and Romanian 20 with de", () => {
    const en = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate("en", key, vars);
    const ro = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate("ro", key, vars);
    expect(ringLine(en, { ...rows[0]!, state: "working" })).toBe("Placing 3 answers in Ecommerce Manager · Acme");
    expect(ringLine(en, rows[1]!)).toBe("Placing 1 answer in Store Specialist · Beta");
    expect(ringLine(en, rows[2]!)).toBe("Working on Researcher · Gamma");
    expect(ringLine(ro, { ...rows[0]!, answers: 20 })).toBe("Pun 20 de răspunsuri în Ecommerce Manager · Acme");
    expect(ringLine(ro, { ...rows[0]!, answers: 3 })).toBe("Pun 3 răspunsuri în Ecommerce Manager · Acme");
  });
});
