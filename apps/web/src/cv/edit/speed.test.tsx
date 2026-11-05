import { createElement, useReducer, type ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { emptyCv, type CvContent, type Experience } from "@resumora/shared";
import { RoleItem } from "./sections/RoleItem.tsx";
import { cvReducer } from "./cvReducer.ts";

function role(n: number): Experience {
  return {
    id: `r${n}`,
    company: `Company ${n}`,
    title: `Title ${n}`,
    location: "",
    startDate: "2020-01",
    endDate: "2021-01",
    current: false,
    description: "",
    bullets: Array.from({ length: 8 }, (_, i) => ({ id: `r${n}-b${i}`, text: `Bullet ${i}` })),
    notes: [],
  };
}

// Test-only counter: RoleItem renders one title ItemField per render, so each call
// with field "title" is one render of that role.
const renders = new Map<string, number>();
const count = (id: string) => renders.get(id) ?? 0;

vi.mock("./ItemField.tsx", async (importOriginal) => {
  const real = await importOriginal<typeof import("./ItemField.tsx")>();
  return {
    ...real,
    ItemField(props: ComponentProps<typeof real.ItemField>) {
      if (props.field === "title") renders.set(props.itemId, (renders.get(props.itemId) ?? 0) + 1);
      return createElement(real.ItemField, props);
    },
  };
});

function Harness({ initial }: { initial: CvContent }) {
  const [cv, dispatch] = useReducer(cvReducer, initial);
  return (
    <>
      {cv.experience.map((r) => (
        <RoleItem key={r.id} role={r} list="experience" locale={cv.locale} dispatch={dispatch} />
      ))}
    </>
  );
}

describe("typing speed", () => {
  it("typing in one bullet re-renders only that role", async () => {
    const initial = { ...emptyCv(), experience: Array.from({ length: 10 }, (_, i) => role(i + 1)) };
    render(<Harness initial={initial} />);
    renders.clear();
    const bullet = screen.getAllByRole("textbox", { name: /^Bullet 1 of / })[2]!; // role 3
    await userEvent.type(bullet, "x");
    expect(count("r3")).toBeGreaterThan(0);
    for (let i = 1; i <= 10; i++) if (i !== 3) expect(count(`r${i}`)).toBe(0);
  });
});
