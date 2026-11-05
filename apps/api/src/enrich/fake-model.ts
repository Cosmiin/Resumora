import { newId, type Experience, type ModelScore } from "@resumora/shared";
import type { AiCallLog, ModelDeps } from "../ai/call-model.ts";

/** A role for tests, with the given bullet texts. */
export function roleWith(texts: string[], over: Partial<Experience> = {}): Experience {
  return {
    id: newId(),
    company: "Acme Payroll",
    title: "Payroll Specialist",
    location: "",
    startDate: "2020-01",
    endDate: "2022-01",
    current: false,
    description: "Payroll for 40 staff.",
    bullets: texts.map((text) => ({ id: newId(), text })),
    notes: [],
    ...over,
  };
}

/** The model's grades for every bullet of `role`; `change` can alter each bullet's answer. */
export function allSpecific(role: Experience, change: (b: ModelScore["bullets"][number], i: number) => void = () => {}): ModelScore {
  const bullets = role.bullets.map((b, i) => {
    const answer: ModelScore["bullets"][number] = {
      id: b.id,
      meaningful: true,
      contribution: "specific",
      clarity: "specific",
      specificity: "specific",
      impact: "specific",
      issue: "none",
      duplicateOf: null,
      tip: null,
      question: null,
      options: [],
    };
    change(answer, i);
    return answer;
  });
  return { bullets, nextStepId: null };
}

/** ModelDeps whose only provider answers with `answer()` (or fails with `status`), and records every request body. */
export function fakeModel(answer: () => unknown, status = 200) {
  const requests: Array<Record<string, unknown>> = [];
  const logged: AiCallLog[] = [];
  const deps: ModelDeps = {
    providers: [{ name: "openai", url: "https://example.test", apiKey: "k", model: "m" }],
    fetch: (async (_url: string, init: RequestInit) => {
      requests.push(JSON.parse(String(init.body)));
      if (status !== 200) return new Response("{}", { status });
      const content = JSON.stringify(answer());
      return new Response(
        JSON.stringify({ choices: [{ finish_reason: "stop", message: { content } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }),
        { status: 200 },
      );
    }) as typeof fetch,
    logCall: async (entry) => void logged.push(entry),
  };
  return { deps, requests, logged };
}
