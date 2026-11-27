/**
 * A role's "company" that plainly says the person worked for themselves: "Self-Employed", "Freelance", "Freelancing",
 * "Freelance Designer", "PFA", "Pe cont propriu". There is no company to describe, so nothing asks what it does
 * (owner, 27 Nov 2026). Only names that say so outright: a name that merely sounds like it ("Independent Shopify
 * Projects") is for the companies request to judge, and a company with such a word in its name ("Independent Media
 * Group", "Freelancer.com") is still a company.
 */
const FIRST_WORDS = /^(self[\s-]?employed|freelanc(?:e|er|ing)|liber[\s-]profesionist|pe cont propriu|persoan[ăa] fizic[ăa] autorizat[ăa])(?![\w.])/i;
const WHOLE_NAMES = new Set([
  "independent", "independent contractor", "independent consultant", "independent professional", "sole trader",
  "sole proprietor", "own business", "pfa", "activitate independentă", "activitate independenta",
]);

export function isSelfEmployed(company: string): boolean {
  const name = company.trim().replace(/^[\s([{"'–—-]+|[\s)\]}"'.,;:–—-]+$/g, "").replace(/\s+/g, " ").toLowerCase();
  if (name === "") return false;
  return WHOLE_NAMES.has(name) || FIRST_WORDS.test(name);
}
