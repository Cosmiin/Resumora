import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { SkillTagRows } from "./SkillTagRows";
import { LanguageContext } from "./ui";
it("hides overflow tags from keyboard access after three rows, supports Show all, and reflows after resize", () => {
  let perRow = 2;
  vi.spyOn(HTMLElement.prototype, "offsetTop", "get").mockImplementation(
    function (this: HTMLElement) {
      if (this.parentElement?.classList.contains("skill-tag-measure"))
        return (
          Math.floor(
            Array.from(this.parentElement.children).indexOf(this) / perRow,
          ) * 40
        );
      return 0;
    },
  );
  const items = Array.from({ length: 8 }, (_, i) => ({
    id: String(i),
    label: "Skill " + i,
  }));
  render(
    <LanguageContext value="en">
      <SkillTagRows
        items={items}
        render={(id) => <button type="button">Skill {id}</button>}
      />
    </LanguageContext>,
  );
  expect(screen.queryByRole("button", { name: "Skill 7" })).toBeNull();
  expect(
    screen
      .getByRole("button", { name: "Show all (8)" })
      .getAttribute("aria-expanded"),
  ).toBe("false");
  fireEvent.click(screen.getByRole("button", { name: "Show all (8)" }));
  expect(screen.getByRole("button", { name: "Skill 7" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Show less" }));
  expect(screen.queryByRole("button", { name: "Skill 7" })).toBeNull();
  perRow = 4;
  fireEvent(window, new Event("resize"));
  expect(screen.getByRole("button", { name: "Skill 7" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: /Show all/ })).toBeNull();
});
