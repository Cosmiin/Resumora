import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { AnswerHint } from "./AnswerHint";
import { LanguageContext } from "./ui";
it("keeps generated French guidance and English controls without inventing English examples", () => {
  render(
    <LanguageContext value="en">
      <AnswerHint
        id="hint"
        locale="fr"
        question={{
          id: "q",
          dimension: "impact",
          text: "Quel résultat ?",
          hint: "Décrivez les résultats de votre travail.",
        }}
      />
    </LanguageContext>,
  );
  expect(screen.getByLabelText("Answer guidance").textContent).toContain(
    "Décrivez les résultats",
  );
  expect(screen.queryByText("See an example")).toBeNull();
});
it("uses Romanian CV examples inside English interface controls", () => {
  render(
    <LanguageContext value="en">
      <AnswerHint
        id="hint"
        locale="ro"
        question={{ id: "q", dimension: "tools", text: "Ce instrumente ?" }}
      />
    </LanguageContext>,
  );
  expect(screen.getByText("See an example")).toBeTruthy();
  expect(screen.getByLabelText("Answer guidance").textContent).toContain(
    "Am folosit filtre în Excel",
  );
});
