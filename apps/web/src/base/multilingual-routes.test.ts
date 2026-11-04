import { expect, it } from "vitest";
import { workspaceLocation } from "./routes";
import { blankDraft } from "./model";
it.each(["fr-CA", "ar", "zh-Hant", "en-US"])(
  "preserves full %s representation route",
  (locale) => {
    expect(workspaceLocation(`#/profile/cv/${locale}`).locale).toBe(locale);
  },
);
it("keeps explicit script direction instead of assuming every locale shares its primary language direction", async () => {
  const { contentDirection } = await import("../languages/direction");
  expect(contentDirection("az-Arab")).toBe("rtl");
  expect(contentDirection("ar-Latn")).toBe("ltr");
});
