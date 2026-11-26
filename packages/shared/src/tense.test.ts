import { describe, expect, it } from "vitest";
import { startsInPastTense, startsInPresentTense } from "./tense.ts";

describe("startsInPresentTense", () => {
  it.each(["Validate compliance with legal teams", "Coordinate partner onboarding", "  VALIDATE compliance", "Co-ordinate onboarding"])(
    "recognises an English present-tense opening: %s", (text) => {
      expect(startsInPresentTense(text, "en")).toBe(true);
    },
  );

  it.each([
    "Ensured compliance with legal teams", "Led a team", "Oversaw partner onboarding", "  LED a team",
    "Split the regional team into two squads", "Forecast quarterly demand", "Shut down the legacy service",
    ..."split spread shut quit let hit bid upset forecast broadcast outran overran rerun".split(" "),
    ..."led built ran made won grew drove set wrote took began brought bought sold taught kept held met oversaw spent sent cut put found gave saw chose became went got left lost paid read rebuilt rewrote undertook withdrew understood thought told sought spoke stood fought flew hired shaped".split(" "),
  ])("accepts an English past-tense opening: %s", (text) => {
    expect(startsInPresentTense(text, "en")).toBe(false);
  });

  it.each([
    "Coordonez fluxul de lucru pentru ordinele de achiziție.", "Efectuez raportarea financiară de final de lună.",
    "Colaborez cu departamentul de contabilitate.", "Gestionez bugetul echipei.", "Pregătesc rapoartele lunare.",
    "Coordonează fluxul de lucru.", "Gestionează bugetul.", "Pregătește rapoartele.", "  COORDONEZ fluxul",
    "Verific documentația financiară.", "Conduc echipa de vânzări.", "Asigur conformitatea documentelor.",
    "Susţin echipa de vânzări.", "Pregăteşte rapoartele.",
  ])("recognises a Romanian present-tense opening: %s", (text) => {
    expect(startsInPresentTense(text, "ro")).toBe(true);
  });

  it.each([
    "Am coordonat fluxul de lucru.", "am efectuat raportarea.", "Coordonarea fluxului de lucru.",
    "Philip Morris International este o companie din industria tutunului.", "Responsabil de bugetul echipei.",
    "Rapoarte lunare pentru 15 departamente.", "Lucrul cu SAP și Excel.", "",
  ])("accepts a Romanian opening that is not in the present: %s", (text) => {
    expect(startsInPresentTense(text, "ro")).toBe(false);
  });

  it.each([
    "Designed and update process maps", "Designed, built and ship dashboards", "Led or run the weekly review",
  ])("recognises a present verb joined to a past one in English: %s", (text) => {
    expect(startsInPresentTense(text, "en")).toBe(true);
  });

  it.each(["Designed and updated process maps and dashboards", "Designed, built and shipped dashboards", "Designed maps and update logs"])(
    "accepts an English opening whose joined verbs are all past: %s", (text) => {
      expect(startsInPresentTense(text, "en")).toBe(false);
    },
  );

  it.each(["Am coordonat și verific facturile", "Am coordonat, verificat și pregătesc rapoartele"])(
    "recognises a present verb joined to \"Am\" + participle in Romanian: %s", (text) => {
      expect(startsInPresentTense(text, "ro")).toBe(true);
    },
  );

  it("accepts Romanian participles joined after \"Am\"", () => {
    expect(startsInPresentTense("Am coordonat și verificat facturile", "ro")).toBe(false);
    expect(startsInPresentTense("Am coordonat echipa și am pregătit rapoartele", "ro")).toBe(false);
  });

  it.each([["Designed process maps", true], ["Design process maps", false], ["Am coordonat echipa", true], ["Responsible for payroll", false]] as const)(
    "startsInPastTense(%s) is %s", (text, past) => {
      expect(startsInPastTense(text, /^(Am|Coord)/.test(text) ? "ro" : "en")).toBe(past);
    },
  );

  it.each(["fr", "de", "es", "it"] as const)("skips tense checks for %s", (locale) => {
    expect(startsInPresentTense("Validate compliance with legal teams", locale)).toBe(false);
    expect(startsInPresentTense("Ensured compliance", locale)).toBe(false);
  });
});
