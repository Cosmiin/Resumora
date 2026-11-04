import { useReducer } from "react";
import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { emptyCv } from "@resumora/shared";
import { BulletList } from "./BulletList.tsx";
import { cvReducer } from "./cvReducer.ts";

function Harness({ texts }: { texts: string[] }) {
  const [cv, dispatch] = useReducer(cvReducer, undefined, () => ({
    ...emptyCv(),
    achievements: texts.map((text, i) => ({ id: `b${i + 1}`, text })),
  }));
  return (
    <>
      <BulletList
        owner={{ list: "achievements" }}
        bullets={cv.achievements}
        dispatch={dispatch}
        ownerName="Achievements"
      />
      <output data-testid="count">{cv.achievements.length}</output>
    </>
  );
}

describe("BulletList", () => {
  it("Enter splits at the cursor and moves focus to the new bullet", async () => {
    render(<Harness texts={["Shipped the launch"]} />);
    const first = screen.getByRole("textbox", { name: "Bullet 1 of Achievements" });
    await userEvent.click(first);
    (first as HTMLTextAreaElement).setSelectionRange(8, 8);
    await userEvent.keyboard("{Enter}");
    expect(screen.getByRole("textbox", { name: "Bullet 1 of Achievements" })).toHaveValue("Shipped ");
    const second = await screen.findByRole("textbox", { name: "Bullet 2 of Achievements" });
    expect(second).toHaveValue("the launch");
    await waitFor(() => expect(second).toHaveFocus());
    expect((second as HTMLTextAreaElement).selectionStart).toBe(0);
  });

  it("Shift+Enter adds a line break, not a bullet", async () => {
    render(<Harness texts={["One"]} />);
    await userEvent.click(screen.getByRole("textbox", { name: "Bullet 1 of Achievements" }));
    await userEvent.keyboard("{Shift>}{Enter}{/Shift}");
    expect(screen.getByTestId("count")).toHaveTextContent("1");
    expect(screen.getByRole("textbox", { name: "Bullet 1 of Achievements" })).toHaveValue("One\n");
  });

  it("Backspace at the start joins with the bullet above", async () => {
    render(<Harness texts={["Alpha", "Beta"]} />);
    const second = screen.getByRole("textbox", { name: "Bullet 2 of Achievements" });
    await userEvent.click(second);
    (second as HTMLTextAreaElement).setSelectionRange(0, 0);
    await userEvent.keyboard("{Backspace}");
    const joined = screen.getByRole("textbox", { name: "Bullet 1 of Achievements" }) as HTMLTextAreaElement;
    expect(joined).toHaveValue("AlphaBeta");
    expect(screen.getByTestId("count")).toHaveTextContent("1");
    await waitFor(() => expect(joined).toHaveFocus());
    expect(joined.selectionStart).toBe(5);
  });

  it("Backspace in the only, empty bullet does nothing", async () => {
    render(<Harness texts={[""]} />);
    await userEvent.click(screen.getByRole("textbox", { name: "Bullet 1 of Achievements" }));
    await userEvent.keyboard("{Backspace}");
    expect(screen.getByTestId("count")).toHaveTextContent("1");
  });

  it("pasting two lines keeps one bullet", async () => {
    render(<Harness texts={[""]} />);
    await userEvent.click(screen.getByRole("textbox", { name: "Bullet 1 of Achievements" }));
    await userEvent.paste("first line\nsecond line");
    expect(screen.getByTestId("count")).toHaveTextContent("1");
    expect(screen.getByRole("textbox", { name: "Bullet 1 of Achievements" })).toHaveValue("first line\nsecond line");
  });
});
