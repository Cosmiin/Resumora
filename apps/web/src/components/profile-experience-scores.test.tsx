import { StrictMode, useState } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import {
  blankDraft,
  newRole,
  fact,
  clone,
  type BaseDraft,
} from "../base/model";
import {
  experiencePoints,
  experienceText,
  experienceScoreIdentity,
  experienceScoreFingerprint,
  experienceScoreOperationId,
  pointQualityScore,
  experienceQualityScore,
  type ExperienceResult,
} from "@resumora/contracts/intelligence/experience";
import { useProfileExperienceScores } from "./useProfileExperienceScores";
import { experiencePolicy } from "@resumora/contracts/intelligence/experience-policy";

vi.setConfig({ testTimeout: 15000 });
beforeEach(() => {
  Object.defineProperty(crypto, "subtle", {
    configurable: true,
    value: webcrypto.subtle,
  });
});
afterEach(() => vi.useRealTimers());
function fixture() {
  const draft = blankDraft();
  draft.language = "en";
  draft.documentLocale = "en";
  draft.roles = ["Analyst", "Coordinator"].map((title, i) => {
    const role = newRole();
    role.title = fact(title);
    role.context = fact(
      i ? "Coordinated weekly deliveries." : "Prepared weekly reports.",
    );
    return role;
  });
  return draft;
}
function result(draft: BaseDraft, c: any): ExperienceResult {
  const points = experiencePoints(experienceText(draft, c.targetId)).map(
    (point, index) => {
      const p = {
        point,
        meaningful: true,
        contribution: "specific" as const,
        clarity: "specific" as const,
        specificity: "partial" as const,
        issue: "specificity" as const,
      };
      return { ...p, id: `p${index}`, duplicateOf: null, strength: null, improvement: null, suggestedQuestion: null, score: pointQualityScore(p) };
    },
  );
  return {
    schemaVersion: "experience-assistant/1",
    targetId: c.targetId,
    fingerprint: c.experience.fingerprint,
    intent: "score",
    assessment: {
      rubric: "experience-quality/3",
          feedbackLocale: c.experience.feedbackLocale ?? "en", scope: "complete", experience: null,
      policyVersion: experiencePolicy.version,
      score: experienceQualityScore(points),
      points,
      dimensions: ["contribution", "methods", "scope", "outcome"].map(
        (dimension) => ({
          dimension: dimension as any,
          grade: "missing" as const,
          evidence: [],
        }),
      ),
    },
  };
}
function setup(
  initial = fixture(),
  callback?: (
    draft: BaseDraft,
    c: any,
    recover?: boolean,
  ) => Promise<ExperienceResult>,
) {
  let latest = initial;
  const request = vi.fn(async (c: any, recover?: boolean) =>
    callback ? callback(latest, c, recover) : result(latest, c),
  );
  const hook = renderHook(
    () => {
      const [draft, setDraft] = useState(initial),
        [ready, setReady] = useState(true),
        [enabled, setEnabled] = useState(true),
        [feedbackLocale,setFeedbackLocale] = useState<"ro"|"en">("en");
      latest = draft;
      const scores = useProfileExperienceScores({
        draft,
        ready,
        enabled,
        feedbackLocale,
        change: setDraft,
        request,
      });
      return { draft, setDraft, ready, setReady, setEnabled, setFeedbackLocale, scores };
    },
    { wrapper: StrictMode },
  );
  return { ...hook, request };
}
const settled = async () => {
  await act(async () => {
    await new Promise((resolve) =>
      setTimeout(resolve, experiencePolicy.settleMs + 30),
    );
  });
};
const edit = (h: ReturnType<typeof setup>, change: (d: BaseDraft) => void) =>
  act(() => {
    const next = clone(h.result.current.draft);
    change(next);
    h.result.current.setDraft(next);
  });
const complete = (h: ReturnType<typeof setup>) =>
  waitFor(() =>
    expect(
      h.result.current.draft.roles.every(
        (r) =>
          !!h.result.current.draft.experienceEnrichment?.[r.id]?.assessment,
      ),
    ).toBe(true),
  );

it("assesses every existing role sequentially and reuses results across rerenders and remounts", async () => {
  const h = setup();
  await settled();
  await complete(h);
  expect(h.request.mock.calls.map(([c]) => c.targetId)).toEqual(
    h.result.current.draft.roles.map((r) => r.id),
  );
  const saved = clone(h.result.current.draft);
  h.rerender();
  await settled();
  expect(h.request).toHaveBeenCalledTimes(2);
  h.unmount();
  const resumed = setup(saved);
  await settled();
  expect(resumed.request).not.toHaveBeenCalled();
});
it("ignores metadata, unrelated fields and confirmed coaching answers; only changed wording, title or document language is assessed", async () => {
  const h = setup();
  await settled();
  await complete(h);
  const [first, second] = h.result.current.draft.roles;
  edit(h, (d) => {
    d.name = fact("New name");
    d.roles[0].company = fact("Renamed company");
    d.answers.push({
      id: "answer",
      targetId: first.id,
      question: "tools",
      questionText: "Tools?",
      text: "Excel",
      status: "confirmed",
      sourceId: "manual",
    });
  });
  await settled();
  expect(h.request).toHaveBeenCalledTimes(2);
  edit(h, (d) => {
    d.roles[1].context = fact("Coordinated deliveries for three teams.");
  });
  await settled();
  await waitFor(() => expect(h.request).toHaveBeenCalledTimes(3));
  expect(h.request.mock.calls[2][0].targetId).toBe(second.id);
  edit(h, (d) => {
    d.roles[0].title = fact("Senior analyst");
  });
  await settled();
  await waitFor(() => expect(h.request).toHaveBeenCalledTimes(4));
  edit(h, (d) => {
    d.documentLocale = "ro";
  });
  await settled();
  await waitFor(() => expect(h.request).toHaveBeenCalledTimes(6));
});
it("waits for a successful save and coalesces rapid edits into the latest version", async () => {
  const h = setup();
  act(() => h.result.current.setReady(false));
  await settled();
  expect(h.request).not.toHaveBeenCalled();
  edit(h, (d) => {
    d.roles[0].context = fact("First draft.");
  });
  edit(h, (d) => {
    d.roles[0].context = fact("Final saved wording.");
  });
  await settled();
  expect(h.request).not.toHaveBeenCalled();
  act(() => h.result.current.setReady(true));
  await complete(h);
  expect(h.request).toHaveBeenCalledTimes(2);
  expect(
    h.result.current.draft.experienceEnrichment?.[
      h.result.current.draft.roles[0].id
    ].assessment?.body,
  ).toBe("Final saved wording.");
});
it("keeps one request in flight and rejects late scores while preserving other edits", async () => {
  let finish!: (r: ExperienceResult) => void,
    firstContext: any,
    firstDraft!: BaseDraft;
  const h = setup(fixture(), async (d, c) => {
    if (!firstContext) {
      firstContext = c;
      firstDraft = clone(d);
      return new Promise((resolve) => {
        finish = resolve;
      });
    }
    return result(d, c);
  });
  await settled();
  await waitFor(() => expect(h.request).toHaveBeenCalledTimes(1));
  edit(h, (d) => {
    d.roles[0].context = fact("Newer wording.");
    d.name = fact("Preserved edit");
  });
  await settled();
  expect(h.request).toHaveBeenCalledTimes(1);
  await act(async () => finish(result(firstDraft, firstContext)));
  await complete(h);
  expect(h.request).toHaveBeenCalledTimes(3);
  expect(h.result.current.draft.name.value).toBe("Preserved edit");
  expect(
    h.result.current.draft.experienceEnrichment?.[firstDraft.roles[0].id]
      .assessment?.body,
  ).toBe("Newer wording.");
});
it("a terminal failure does not block other jobs, repeat on visits, or lock manual editing; explicit retry uses a new attempt", async () => {
  const initial = fixture(),
    bad = initial.roles[0].id;
  const h = setup(initial, async (d, c) => {
    if (c.targetId === bad && !c.experience.scoreAttempt)
      throw Error("AI_OUTPUT_INVALID");
    return result(d, c);
  });
  await settled();
  await waitFor(() => expect(h.request).toHaveBeenCalledTimes(2));
  expect(
    h.result.current.draft.experienceEnrichment?.[initial.roles[1].id]
      .assessment,
  ).toBeTruthy();
  const saved = clone(h.result.current.draft);
  h.unmount();
  const resumed = setup(saved, async (d, c) => {
    if (!c.experience.scoreAttempt) throw Error("AI_OUTPUT_INVALID");
    return result(d, c);
  });
  await settled();
  expect(resumed.request).not.toHaveBeenCalled();
  await act(async () => {
    await resumed.result.current.scores.forRole(bad).check();
  });
  await waitFor(() => expect(resumed.request).toHaveBeenCalledTimes(2));
  expect(resumed.request.mock.calls[1][0].experience.scoreAttempt).toBe(1);
});
it("refresh recovers an interrupted score by reading its original receipt", async () => {
  const initial = fixture(),
    id = initial.roles[0].id;
  initial.experienceEnrichment = {
    [id]: {
      version: 1,
      scoreError: "unknown",
      scorePending: {
        id: await experienceScoreOperationId(initial, id),
        body: experienceText(initial, id),
        scoreIdentity: experienceScoreIdentity(initial, id),
        request: {
          intent: "score",
          fingerprint: await experienceScoreFingerprint(initial, id),
        },
      },
    },
  };
  const h = setup(initial);
  await waitFor(() =>
    expect(h.request.mock.calls.length).toBeGreaterThanOrEqual(1),
  );
  expect(h.request.mock.calls[0][1]).toBe(true);
  await settled();
  await complete(h);
  expect(
    h.request.mock.calls
      .filter(([c]) => c.targetId === id)
      .every(([, recover]) => recover),
  ).toBe(true);
});
it("a saved but never-dispatched score resumes the same ID after a missing receipt", async () => {
  const initial = fixture(),
    id = initial.roles[0].id,
    operationId = await experienceScoreOperationId(initial, id);
  initial.experienceEnrichment = {
    [id]: {
      version: 1,
      scorePending: {
        id: operationId,
        body: experienceText(initial, id),
        scoreIdentity: experienceScoreIdentity(initial, id),
        request: {
          intent: "score",
          fingerprint: await experienceScoreFingerprint(initial, id),
        },
      },
    },
  };
  const h = setup(initial, async (d, c, recover) => {
    if (recover) throw Error("MISSING");
    return result(d, c);
  });
  await settled();
  await complete(h);
  const calls = h.request.mock.calls.filter(([c]) => c.targetId === id);
  expect(calls.every(([c]) => c.operationId === operationId)).toBe(true);
  expect(calls.filter(([, recover]) => !recover)).toHaveLength(1);
  expect(calls[0][1]).toBe(true);
});
it.each(["delete", "replace", "disable"])(
  "ignores a late result after %s",
  async (kind) => {
    let finish!: (r: ExperienceResult) => void,
      context: any,
      original!: BaseDraft;
    const h = setup(fixture(), async (d, c) => {
      original = clone(d);
      context = c;
      return new Promise((resolve) => {
        finish = resolve;
      });
    });
    await settled();
    await waitFor(() => expect(h.request).toHaveBeenCalledTimes(1));
    if (kind === "delete")
      edit(h, (d) => {
        d.roles = [];
      });
    if (kind === "replace") act(() => h.result.current.setDraft(blankDraft()));
    if (kind === "disable") act(() => h.result.current.setEnabled(false));
    await act(async () => finish(result(original, context)));
    expect(
      h.result.current.draft.experienceEnrichment?.[original.roles[0].id]
        ?.assessment,
    ).toBeUndefined();
  },
);
it("reuses current-policy scores without inference and records their identity for future edits", async () => {
  const initial = fixture();
  initial.experienceEnrichment = {};
  for (const role of initial.roles) {
    const r = result(initial, {
      targetId: role.id,
      experience: { fingerprint: "a".repeat(64) },
    });
    if (r.intent === "score")
      initial.experienceEnrichment[role.id] = {
        version: 1,
        assessment: {
          fingerprint: r.fingerprint,
          body: experienceText(initial, role.id),
          value: r.assessment,
        },
      };
  }
  const h = setup(initial);
  await settled();
  await waitFor(() =>
    expect(
      h.result.current.draft.roles.every(
        (r) =>
          h.result.current.draft.experienceEnrichment?.[r.id].assessment
            ?.scoreIdentity,
      ),
    ).toBe(true),
  );
  expect(h.request).not.toHaveBeenCalled();
  edit(h, (d) => {
    d.roles[0].title = fact("Changed title");
  });
  await settled();
  await waitFor(() => expect(h.request).toHaveBeenCalledTimes(1));
});

it("refreshes scores from the previous prompt while retaining their saved text", async () => {
  const initial = fixture();
  initial.experienceEnrichment = {};
  for (const [index, role] of initial.roles.entries()) {
    const r = result(initial, {
      targetId: role.id,
      experience: { fingerprint: "a".repeat(64) },
    });
    if (r.intent !== "score" || r.assessment.rubric !== "experience-quality/3")
      throw Error("fixture");
    const legacy = {rubric:"experience-quality/2" as const, dimensions:r.assessment.dimensions, score:r.assessment.score,
      points:r.assessment.points.map(({point,meaningful,contribution,clarity,specificity,issue,score})=>({point,meaningful,contribution,clarity,specificity,issue,score})),
      ...(index === 0 ? {policyVersion:"experience-score/4"} : {})};
    initial.experienceEnrichment[role.id] = {
      version: 1,
      assessment: {
        fingerprint: r.fingerprint,
        body: experienceText(initial, role.id),
        value: legacy,
      },
    };
  }
  const originalRoles = clone(initial).roles;
  const h = setup(initial);
  await settled();
  await waitFor(() => expect(h.request).toHaveBeenCalledTimes(2));
  await waitFor(() => {
    for (const role of initial.roles) {
      const value =
        h.result.current.draft.experienceEnrichment?.[role.id].assessment?.value;
      expect(
        value?.rubric === "experience-quality/3" && value.policyVersion,
      ).toBe(experiencePolicy.version);
    }
  });
  expect(h.result.current.draft.roles).toEqual(originalRoles);
});

it("changing feedback language avoids bulk inference; an explicit check refreshes only the chosen role", async () => {
  const h=setup();await settled();await complete(h);expect(h.request).toHaveBeenCalledTimes(2);
  act(()=>h.result.current.setFeedbackLocale("ro"));await settled();expect(h.request).toHaveBeenCalledTimes(2);
  const id=h.result.current.draft.roles[0].id;
  await act(async()=>h.result.current.scores.forRole(id).check());
  await waitFor(()=>expect(h.request).toHaveBeenCalledTimes(3));
  expect(h.request.mock.calls[2][0].experience.feedbackLocale).toBe("ro");
  await waitFor(()=>{
    const value=h.result.current.draft.experienceEnrichment?.[id].assessment?.value;
    expect(value?.rubric === "experience-quality/3" && value.feedbackLocale).toBe("ro");
  });
  expect(h.result.current.scores.forRole(id).lastCheck?.before).toBeUndefined();
});

it("a locale change keeps an uncertain receipt fenced during explicit progress checks", async () => {
  const initial=fixture(),id=initial.roles[0].id;
  const h=setup(initial,async(d,c)=>{if(c.targetId===id)throw Error("AI_REQUEST_UNKNOWN");return result(d,c);});
  await settled();await waitFor(()=>expect(h.result.current.draft.experienceEnrichment?.[id].scoreError).toBe("unknown"));
  const operation=h.result.current.draft.experienceEnrichment![id].scorePending!.id;
  act(()=>h.result.current.setFeedbackLocale("ro"));
  await act(async()=>h.result.current.scores.forRole(id).check());
  expect(h.result.current.draft.experienceEnrichment![id].scorePending!.id).toBe(operation);
  const related=h.request.mock.calls.filter(([c])=>c.targetId===id);
  expect(related.filter(([,recover])=>!recover)).toHaveLength(1);
  expect(related.at(-1)?.[1]).toBe(true);
});

it("an explicitly retried failed assessment can use the newly selected feedback language", async () => {
  const initial=fixture(),id=initial.roles[0].id;
  const h=setup(initial,async(d,c)=>{if(c.targetId===id && c.experience.feedbackLocale === "en")throw Error("AI_OUTPUT_INVALID");return result(d,c);});
  await settled();await waitFor(()=>expect(h.result.current.draft.experienceEnrichment?.[id].scoreError).toBe("failed"));
  act(()=>h.result.current.setFeedbackLocale("ro"));
  await act(async()=>h.result.current.scores.forRole(id).check());
  await waitFor(()=>{
    const value=h.result.current.draft.experienceEnrichment?.[id].assessment?.value;
    expect(value?.rubric === "experience-quality/3" && value.feedbackLocale).toBe("ro");
  });
  expect(h.request.mock.calls.filter(([c,recover])=>c.targetId===id && !recover)).toHaveLength(2);
});

it("uncertain recovery is bounded, read-only, and never blocks the next job", async () => {
  const initial = fixture(),
    id = initial.roles[0].id;
  initial.experienceEnrichment = {
    [id]: {
      version: 1,
      scorePending: {
        id: await experienceScoreOperationId(initial, id),
        body: experienceText(initial, id),
        scoreIdentity: experienceScoreIdentity(initial, id),
        request: {
          intent: "score",
          fingerprint: await experienceScoreFingerprint(initial, id),
        },
      },
    },
  };
  vi.useFakeTimers();
  const h = setup(initial, async (d, c) => {
    if (c.targetId === id) throw Error("AI_REQUEST_UNKNOWN");
    return result(d, c);
  });
  await act(async () => {});
  for (let i = 0; i < 12; i++)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(12000);
    });
  const reads = h.request.mock.calls.filter(([c]) => c.targetId === id);
  expect(reads.length).toBeLessThanOrEqual(8); // StrictMode may read once before its effect cleanup.
  expect(reads.every(([, recover]) => recover)).toBe(true);
  expect(
    h.result.current.draft.experienceEnrichment?.[initial.roles[1].id]
      .assessment,
  ).toBeTruthy();
  const count = h.request.mock.calls.length;
  await act(async () => {
    await vi.advanceTimersByTimeAsync(120000);
  });
  expect(h.request).toHaveBeenCalledTimes(count);
});
it("recovers a lost response by reading the receipt rather than repeating generation", async () => {
  const initial = fixture(),
    id = initial.roles[0].id;
  const h = setup(initial, async (d, c, recover) => {
    if (c.targetId === id && !recover) throw Error("AI_REQUEST_UNKNOWN");
    return result(d, c);
  });
  await settled();
  await waitFor(
    () =>
      expect(
        h.result.current.draft.experienceEnrichment?.[id].assessment,
      ).toBeTruthy(),
    { timeout: 4000 },
  );
  const calls = h.request.mock.calls.filter(([c]) => c.targetId === id);
  expect(calls.filter(([, recover]) => !recover)).toHaveLength(1);
  expect(calls.filter(([, recover]) => recover)).toHaveLength(1);
});
it("pauses new background work while an explicit writing action is pending", async () => {
  const initial = fixture(),
    id = initial.roles[0].id;
  initial.experienceEnrichment = {
    [id]: {
      version: 1,
      pending: {
        id: crypto.randomUUID(),
        request: { intent: "point", fingerprint: "a".repeat(64) },
      },
    },
  };
  const h = setup(initial);
  await settled();
  expect(h.request).not.toHaveBeenCalled();
  edit(h, (d) => {
    delete d.experienceEnrichment![id].pending;
  });
  await complete(h);
  expect(h.request).toHaveBeenCalledTimes(2);
});

it("merges advisory results into the latest draft without overwriting user edits or coaching state", async () => {
  const { mergeExperienceScoreState } = await import("../base/experience");
  const scored = fixture(),
    id = scored.roles[0].id;
  const r = result(scored, {
    targetId: id,
    experience: { fingerprint: "a".repeat(64) },
  });
  if (r.intent !== "score") throw Error("fixture");
  scored.experienceEnrichment = {
    [id]: {
      version: 1,
      assessment: {
        fingerprint: r.fingerprint,
        body: experienceText(scored, id),
        value: r.assessment,
        scoreIdentity: experienceScoreIdentity(scored, id),
      },
    },
  };
  const latest = clone(scored);
  delete latest.experienceEnrichment![id].assessment;
  latest.name = fact("Newer name");
  latest.roles[1].context = fact("Newer unrelated experience.");
  latest.experienceEnrichment![id].editor = {
    baseText: experienceText(latest, id),
    text: "Unfinished local edit",
    mode: "add",
  };
  const merged = mergeExperienceScoreState(latest, scored, id);
  expect(merged.name).toEqual(latest.name);
  expect(merged.roles).toEqual(latest.roles);
  expect(merged.experienceEnrichment?.[id].editor).toEqual(
    latest.experienceEnrichment?.[id].editor,
  );
  expect(merged.experienceEnrichment?.[id].assessment).toEqual(
    scored.experienceEnrichment[id].assessment,
  );
  latest.roles[0].context = fact("Newer text for this job.");
  expect(mergeExperienceScoreState(latest, scored, id)).toBe(latest);
});

it("an explicit retry after a pre-dispatch configuration failure reuses the missing operation ID", async () => {
  const initial = fixture(),
    id = initial.roles[0].id;
  let enabled = false;
  const h = setup(initial, async (d, c, recover) => {
    if (c.targetId === id && recover) throw Error("MISSING");
    if (c.targetId === id && !enabled) throw Error("AI_DISABLED");
    return result(d, c);
  });
  await settled();
  await waitFor(() =>
    expect(h.result.current.draft.experienceEnrichment?.[id].scoreError).toBe(
      "failed",
    ),
  );
  const original =
    h.result.current.draft.experienceEnrichment![id].scorePending!.id;
  enabled = true;
  await act(async () => {
    await h.result.current.scores.forRole(id).check();
  });
  await waitFor(() =>
    expect(
      h.result.current.draft.experienceEnrichment?.[id].assessment,
    ).toBeTruthy(),
  );
  const calls = h.request.mock.calls.filter(([c]) => c.targetId === id);
  expect(calls.map(([c]) => c.operationId)).toEqual([
    original,
    original,
    original,
  ]);
  expect(calls.map(([, recover]) => recover)).toEqual([false, true, false]);
});

it("explicit recalculation creates successive attempts and retains the prior score on failure", async () => {
  const initial = fixture(); initial.roles = initial.roles.slice(0, 1);
  let fail = false;
  const failed = new Set<string>();
  const h = setup(initial, async (d, c) => { if (fail) failed.add(c.operationId); if (failed.has(c.operationId)) throw Error('AI_OUTPUT_INVALID'); return result(d, c); });
  await settled(); await complete(h);
  const id = initial.roles[0].id;
  const previous = h.result.current.draft.experienceEnrichment![id].assessment;
  fail = true;
  await act(async () => h.result.current.scores.forRole(id).check());
  await waitFor(() => expect(h.request).toHaveBeenCalledTimes(2));
  expect(h.request.mock.calls[1][0].experience.scoreAttempt).toBe(1);
  expect(h.result.current.draft.experienceEnrichment![id].assessment).toEqual(previous);
  fail = false;
  await act(async () => h.result.current.scores.forRole(id).check());
  await waitFor(() => expect(h.result.current.draft.experienceEnrichment![id].scorePending).toBeUndefined());
  await act(async () => h.result.current.scores.forRole(id).check());
  await waitFor(() => expect(h.request.mock.calls.at(-1)![0].experience.scoreAttempt).toBe(3));
  expect(new Set(h.request.mock.calls.filter(([, recover]) => !recover).map(([c]) => c.operationId)).size).toBe(4);
});
it('offers a fresh explicit attempt when the durable receipt has no recoverable result', async () => {
 const initial=fixture(); initial.roles=initial.roles.slice(0,1);
 const h=setup(initial, async (d,c) => { if (!c.experience.scoreAttempt) throw Error('AI_RESULT_UNAVAILABLE'); return result(d,c); });
 await settled(); const id=initial.roles[0].id;
 await waitFor(()=>expect(h.result.current.scores.forRole(id).error).toBe('failed'));
 await act(async()=>h.result.current.scores.forRole(id).check());
 await complete(h);
 expect(h.request.mock.calls.at(-1)![0].experience.scoreAttempt).toBe(1);
 expect(h.result.current.draft.roles).toEqual(initial.roles);
});
