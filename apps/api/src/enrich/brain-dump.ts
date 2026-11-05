import { BRAIN_DUMP_QUESTION, MAX_BULLETS, SCORE_POLICY, fingerprint, mergeGrades, repeatKey, type BrainDumpAnswer } from "@resumora/shared";
import { z } from "zod";
import { callModel } from "../ai/call-model.ts";
import { ApiError } from "../errors.ts";
import { brainDumpSystemPrompt, brainDumpUserMessage } from "./focus-prompts.ts";
import { checkProposal, squash } from "./rewrite.ts";
import { aiError, gradeBullets, scoreRole, type ScoreDeps } from "./score.ts";

const BrainDumpSchema = z.object({ bullets: z.array(z.string()).max(4) });

export async function brainDump(
  deps: ScoreDeps,
  input: { roleId: string; fingerprint: string },
): Promise<BrainDumpAnswer> {
  const { content } = await deps.cv.get();
  const role = content.experience.find((r) => r.id === input.roleId);
  if (!role || fingerprint(role, content.locale) !== input.fingerprint) {
    throw new ApiError(409, "not_saved", "Your latest changes aren't saved yet. Try again in a moment.");
  }
  const ramble = role.notes.filter((n) => n.question === BRAIN_DUMP_QUESTION)
    .sort((a, b) => Date.parse(b.askedAt) - Date.parse(a.askedAt))[0];
  if (!ramble) throw new ApiError(400, "no_brain_dump", "Save a brain dump for this role first.");

  await deps.cv.snapshot("ai");

  const slots = Math.min(4, MAX_BULLETS - role.bullets.length);
  if (slots === 0) {
    const cached = await deps.insights.get(role.id);
    const roleBefore = cached?.fingerprint === input.fingerprint && cached.policy === SCORE_POLICY ? cached.score : null;
    return { proposals: [], roleBefore, roleAfterAll: roleBefore };
  }

  try {
    const before = role.bullets.length ? await scoreRole(deps, input) : null;
    const answer = await callModel(deps.model, {
      userId: deps.userId,
      task: "enrich_brain_dump",
      schema: BrainDumpSchema,
      system: brainDumpSystemPrompt(content.locale),
      user: brainDumpUserMessage(role, ramble.answer),
      maxOutputTokens: 1200,
    });
    const seen = new Set(role.bullets.map((b) => repeatKey(b.text)));
    const usedIds = new Set(role.bullets.map((b) => b.id));
    const survivors: { id: string; text: string }[] = [];
    let nextId = 1;
    for (const raw of answer.bullets) {
      const text = squash(raw);
      const key = repeatKey(text);
      if (checkProposal(role, "new", text) !== "ok" || seen.has(key)) continue;
      seen.add(key);
      while (usedIds.has(`new${nextId}`)) nextId++;
      const id = `new${nextId++}`;
      usedIds.add(id);
      survivors.push({ id, text });
      if (survivors.length === slots) break;
    }
    const roleBefore = before?.score ?? null;
    if (!survivors.length) return { proposals: [], roleBefore, roleAfterAll: roleBefore };

    const appended = { ...role, bullets: [...role.bullets, ...survivors] };
    const graded = await gradeBullets(deps, appended, content.locale, survivors.map((b) => b.id));
    const merged = mergeGrades(appended, before, graded, fingerprint(appended, content.locale));
    const proposals = survivors.map((b) => ({ ...b, score: merged.bullets.find((g) => g.id === b.id)!.score }))
      .filter((b) => b.score >= 40);
    const kept = { ...role, bullets: [...role.bullets, ...proposals.map(({ id, text }) => ({ id, text }))] };
    const roleAfterAll = mergeGrades(kept, before, graded, fingerprint(kept, content.locale)).score;
    return { proposals, roleBefore, roleAfterAll };
  } catch (err) {
    aiError(err);
  }
}
