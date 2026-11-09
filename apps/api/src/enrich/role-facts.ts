import { notesHash, hasUnknownNumber, type RoleFactsAnswer } from "@resumora/shared";
import { z } from "zod";
import { callModel } from "../ai/call-model.ts";
import { ApiError } from "../errors.ts";
import { roleFactsSystemPrompt, roleFactsUserMessage } from "./focus-prompts.ts";
import { aiError, type ScoreDeps } from "./score.ts";

const RoleFactsSchema = z.object({ facts: z.array(z.string()).max(8) });

export async function roleFacts(deps: ScoreDeps, input: { roleId: string }): Promise<RoleFactsAnswer> {
  const { content } = await deps.cv.get();
  const role = content.experience.find((r) => r.id === input.roleId);
  if (!role) throw new ApiError(404, "role_not_found", "This role is no longer in your CV.");
  const fromNotes = notesHash(role.notes);
  if (!role.notes.length) return { facts: [], fromNotes };

  try {
    const answer = await callModel(deps.model, {
      userId: deps.userId,
      task: "enrich_role_facts",
      schema: RoleFactsSchema,
      system: roleFactsSystemPrompt(content.locale),
      user: roleFactsUserMessage(role),
      maxOutputTokens: 1200,
    });
    const sources = [...role.notes.map((n) => n.answer), ...(role.facts?.items ?? [])];
    const facts = answer.facts.filter((fact) => fact.length <= 160 && !hasUnknownNumber(fact, sources));
    return { facts, fromNotes };
  } catch (err) {
    aiError(err);
  }
}
