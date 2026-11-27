import { describe, expect, it } from "vitest";
import { isSelfEmployed } from "./self-employed.ts";

describe("isSelfEmployed", () => {
  it("knows a name that plainly says the person worked for themselves, in English and Romanian", () => {
    for (const name of [
      "Self-Employed", "self employed", "Selfemployed", "Self-employed (various clients)", "Freelance", "Freelancer",
      "Freelancing", "Freelance Designer", "Freelancer, Upwork", "  Independent  ", "Independent Contractor", "Sole trader",
      "Own business", "PFA", "Pe cont propriu", "Liber profesionist", "Liber-profesionist", "Persoană fizică autorizată",
      "(Freelance)", "Self-Employed.",
    ]) expect(isSelfEmployed(name), name).toBe(true);
  });

  it("leaves a company alone, also one with such a word in its name", () => {
    for (const name of [
      "", "  ", "Carbon Global", "Freelancer.com", "Independent Media Group", "Independent Shopify Projects",
      "The Freelance Collective", "Selfridges", "PFA Insurance", "Independentă Film SRL",
    ]) expect(isSelfEmployed(name), name).toBe(false);
  });
});
