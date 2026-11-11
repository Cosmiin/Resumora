import { afterEach, describe, expect, it } from "vitest";
import { uiEn } from "./en-ui.ts";
import { getLanguage, setLanguage } from "./language.ts";
import { uiRo } from "./ro-ui.ts";
import { t, translate } from "./t.ts";

afterEach(() => setLanguage("en"));

describe("interface language", () => {
  it("starts in English", () => {
    expect(getLanguage()).toBe("en");
    expect(t("ui.diff.keep")).toBe("Keep mine");
  });

  it("switches to Romanian and remembers the choice", () => {
    setLanguage("ro");
    expect(t("ui.diff.keep")).toBe("Păstrez varianta mea");
    expect(localStorage.getItem("resumora.language")).toBe("ro");
    expect(document.documentElement.lang).toBe("ro");
  });

  it("falls back to English for copy Romanian doesn't have yet", () => {
    expect(translate("ro", "app.loading")).toBe("Loading…");
  });

  it("fills placeholders in either language", () => {
    expect(translate("en", "signup.sent.text", { email: "a@example.com" })).toBe("We sent a confirmation link to a@example.com. Open it, then log in.");
    expect(translate("ro", "signup.sent.text", { email: "a@example.com" })).toBe("Am trimis un link de confirmare la a@example.com. Deschide-l, apoi intră în cont.");
  });

  it("has the same keys in both kit dictionaries, none empty", () => {
    expect(Object.keys(uiRo).sort()).toEqual(Object.keys(uiEn).sort());
    expect(Object.values(uiRo).every((text) => text.trim().length > 0)).toBe(true);
  });
});
