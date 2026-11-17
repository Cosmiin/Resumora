import type { CompaniesAnswer, ToolsAnswer } from "@resumora/shared";
import { suggestCompanies, suggestTools } from "./enrich-api.ts";

/** The AI's answers for the path's first two steps, asked for before the path opens. Either may fail: the step then asks itself. */
export type Prepared = { companies: Promise<CompaniesAnswer>; tools: Promise<ToolsAnswer> };

/**
 * Asks for the companies and then the tools of an import that is read but not used yet, while the person still
 * looks at what was found. One after the other: the roles are being scored at the same time.
 */
export function prepareSteps(importId: string): Prepared {
  const companies = suggestCompanies(importId);
  const tools = companies.catch(() => undefined).then(() => suggestTools(importId));
  // Nobody may be listening yet: a failure is handled by the step that uses the answer.
  companies.catch(() => undefined);
  tools.catch(() => undefined);
  return { companies, tools };
}
