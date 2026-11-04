import { StrictMode, useState } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import { clone, fact, newRole, type BaseDraft } from "../base/model";
import {
  experienceText,
  experiencePoints,
  experienceFingerprint,
  isExperienceSessions,
  type ExperienceResult,
} from "@resumora/contracts/intelligence/experience";
import { usePreparedExperienceQuestions } from "./usePreparedExperienceQuestions";
import { questionFixture } from "./guided-question-cache.test-fixture";

beforeEach(() =>
  Object.defineProperty(crypto, "subtle", {
    configurable: true,
    value: webcrypto.subtle,
  }),
);
function setup(initial = questionFixture(null), fail = false) {
  let latest = initial;
  const request = vi.fn(
    async (c: any, recover?: boolean): Promise<ExperienceResult> => {
      const persisted = latest.experienceEnrichment?.[
        c.targetId
      ].questionPreparations?.find((p) => p.id === c.operationId);
      expect(persisted?.request).toEqual(c.experience);
      if (fail) throw Error("AI_TIMEOUT_UNKNOWN");
      return {
        schemaVersion: "experience-assistant/1",
        targetId: c.targetId,
        fingerprint: c.experience.fingerprint,
        intent: "questions",
        point: c.experience.point,
        questions: [
          { id: "q", dimension: "scale", text: "Who used these reports?" },
        ],
      };
    },
  );
  const hook = renderHook(
    () => {
      const [draft, setDraft] = useState(initial),
        [ready, setReady] = useState(true),
        [enabled, setEnabled] = useState(true);
      latest = draft;
      usePreparedExperienceQuestions({
        draft,
        ready,
        enabled,
        feedbackLocale: "en",
        request,
        change: (d) => {
          setDraft(d);
          setReady(false);
        },
      });
      return { draft, setDraft, ready, setReady, setEnabled };
    },
    { wrapper: StrictMode },
  );
  return { ...hook, request };
}
it("saves a bounded background question receipt before dispatch, leaves foreground free, and caches the result", async () => {
  const h = setup();
  const id = h.result.current.draft.roles[0].id;
  await waitFor(() =>
    expect(
      h.result.current.draft.experienceEnrichment?.[id].questionPreparations,
    ).toHaveLength(1),
  );
  expect(h.request).not.toHaveBeenCalled();
  expect(
    h.result.current.draft.experienceEnrichment?.[id].pending,
  ).toBeUndefined();
  act(() => h.result.current.setReady(true));
  await waitFor(() =>
    expect(
      h.result.current.draft.experienceEnrichment?.[id]
        .questionPreparations?.[0].status,
    ).toBe("ready"),
  );
  expect(
    isExperienceSessions(h.result.current.draft.experienceEnrichment),
  ).toBe(true);
  expect(h.request).toHaveBeenCalledTimes(1);
  h.unmount();
});
it("does not generate questions already supplied by the current assessment", async () => {
  const h = setup(questionFixture());
  await act(async () => {
    await new Promise((r) => setTimeout(r, 550));
  });
  expect(h.request).not.toHaveBeenCalled();
  expect(
    h.result.current.draft.experienceEnrichment?.[
      h.result.current.draft.roles[0].id
    ].questionPreparations,
  ).toBeUndefined();
});
it("retains unknown receipts without automatic paid retries", async () => {
  const h = setup(undefined, true);
  const id = h.result.current.draft.roles[0].id;
  await waitFor(() => expect(h.result.current.ready).toBe(false));
  act(() => h.result.current.setReady(true));
  await waitFor(() =>
    expect(
      h.result.current.draft.experienceEnrichment?.[id]
        .questionPreparations?.[0].status,
    ).toBe("unknown"),
  );
  act(() => h.result.current.setReady(true));
  await act(async () => {
    await new Promise((r) => setTimeout(r, 550));
  });
  expect(h.request).toHaveBeenCalledTimes(1);
});
it("only prepares points below 80 and stops after three missing questions", async () => {
  const draft = questionFixture(null),
    id = draft.roles[0].id;
  const assessment = draft.experienceEnrichment![id].assessment!.value;
  if (assessment.rubric !== "experience-quality/3") throw Error("fixture");
  const original = assessment.points[0];
  draft.roles[0].context.value =
    "- Prepared reports.\n- Reviewed records.\n- Checked deliveries.\n- Audited invoices.\n- Built queries.";
  const body = experienceText(draft, id);
  draft.experienceEnrichment![id].assessment!.body = body;
  assessment.points = experiencePoints(body).map((point, i) => ({
    ...original,
    id: `p${i}`,
    point,
    score: i === 0 ? 80 : 79,
  }));
  const h = setup(draft);
  for (let i = 0; i < 3; i++) {
    await waitFor(() =>
      expect(
        h.result.current.draft.experienceEnrichment![id].questionPreparations,
      ).toHaveLength(i + 1),
    );
    act(() => h.result.current.setReady(true));
    await waitFor(() =>
      expect(
        h.result.current.draft.experienceEnrichment![id].questionPreparations![
          i
        ].status,
      ).toBe("ready"),
    );
    act(() => h.result.current.setReady(true));
  }
  await act(async () => {
    await new Promise((r) => setTimeout(r, 550));
  });
  expect(h.request).toHaveBeenCalledTimes(3);
  expect(
    h.request.mock.calls.every(
      ([c]) => c.experience.point.text !== "Prepared reports.",
    ),
  ).toBe(true);
  expect(
    h.result.current.draft.experienceEnrichment![id].pending,
  ).toBeUndefined();
});
it("blank and failed unscored roles do not prevent preparing an assessed role", async () => {
  const draft = questionFixture(null),
    blank = newRole(),
    failed = newRole();
  failed.context = fact("Reviewed invoices.");
  draft.roles.push(blank, failed);
  draft.experienceEnrichment![failed.id] = { version: 1, scoreError: "failed" };
  const h = setup(draft),
    id = draft.roles[0].id;
  await waitFor(() =>
    expect(
      h.result.current.draft.experienceEnrichment![id].questionPreparations,
    ).toHaveLength(1),
  );
  expect(h.request).not.toHaveBeenCalled();
});
it("pauses dispatch while a foreground request owns the role", async () => {
  const h = setup(),
    id = h.result.current.draft.roles[0].id;
  await waitFor(() =>
    expect(
      h.result.current.draft.experienceEnrichment![id].questionPreparations,
    ).toHaveLength(1),
  );
  act(() => {
    const next = clone(h.result.current.draft);
    next.experienceEnrichment![id].pending = {
      id: "foreground",
      request: { intent: "role", fingerprint: "a".repeat(64) },
    };
    h.result.current.setDraft(next);
    h.result.current.setReady(true);
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 550));
  });
  expect(h.request).not.toHaveBeenCalled();
});
it("recovers a saved pending preparation without redispatching generation", async () => {
  const draft = questionFixture(null),
    id = draft.roles[0].id;
  draft.experienceEnrichment![id].questionPreparations = [
    {
      id: "saved",
      status: "pending",
      request: {
        intent: "questions",
        fingerprint: await experienceFingerprint(draft, id),
        feedbackLocale: "en",
        point: experiencePoints(experienceText(draft, id))[0],
      },
    },
  ];
  const h = setup(draft);
  await waitFor(() =>
    expect(
      h.result.current.draft.experienceEnrichment![id].questionPreparations![0]
        .status,
    ).toBe("ready"),
  );
  expect(h.request).toHaveBeenCalledTimes(1);
  expect(h.request.mock.calls[0][1]).toBe(true);
});
it("a saved pending question still dispatches if its assessment is invalidated", async () => {
  const h = setup(),
    id = h.result.current.draft.roles[0].id;
  await waitFor(() =>
    expect(
      h.result.current.draft.experienceEnrichment![id].questionPreparations,
    ).toHaveLength(1),
  );
  act(() => {
    const next = clone(h.result.current.draft);
    delete next.experienceEnrichment![id].assessment;
    h.result.current.setDraft(next);
    h.result.current.setReady(true);
  });
  await waitFor(() =>
    expect(
      h.result.current.draft.experienceEnrichment![id].questionPreparations![0]
        .status,
    ).toBe("ready"),
  );
  expect(h.request.mock.calls[0][1]).toBe(false);
});
it("fences a late result across disable/re-enable and recovers its saved receipt", async () => {
  const draft = questionFixture(null),
    id = draft.roles[0].id;
  draft.experienceEnrichment![id].questionPreparations = [
    {
      id: "saved",
      status: "pending",
      request: {
        intent: "questions",
        fingerprint: await experienceFingerprint(draft, id),
        feedbackLocale: "en",
        point: experiencePoints(experienceText(draft, id))[0],
      },
    },
  ];
  let finish!: (result: ExperienceResult) => void;
  const response = (text: string): ExperienceResult => ({
    schemaVersion: "experience-assistant/1",
    targetId: id,
    fingerprint:
      draft.experienceEnrichment![id].questionPreparations![0].request
        .fingerprint,
    intent: "questions",
    point:
      draft.experienceEnrichment![id].questionPreparations![0].request.point,
    questions: [{ id: "q", dimension: "scale", text }],
  });
  const request = vi.fn(async () => response("Recovered question?"));
  request.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const h = renderHook(() => {
    const [current, setDraft] = useState(draft),
      [enabled, setEnabled] = useState(true);
    usePreparedExperienceQuestions({
      draft: current,
      enabled,
      ready: true,
      feedbackLocale: "en",
      change: setDraft,
      request,
    });
    return { draft: current, setEnabled };
  });
  await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  act(() => h.result.current.setEnabled(false));
  act(() => h.result.current.setEnabled(true));
  await act(async () => finish(response("Discard this late question?")));
  expect(
    h.result.current.draft.experienceEnrichment![id].questionPreparations![0]
      .status,
  ).toBe("pending");
  await waitFor(() =>
    expect(
      h.result.current.draft.experienceEnrichment![id].questionPreparations![0]
        .questions?.[0].text,
    ).toBe("Recovered question?"),
  );
  expect(request).toHaveBeenCalledTimes(2);
});
it("reuses a foreground question round instead of preparing it again", async () => {
  const draft = questionFixture(null),
    id = draft.roles[0].id;
  draft.experienceEnrichment![id].round = {
    id: "round",
    fingerprint: await experienceFingerprint(draft, id),
    feedbackLocale: "en",
    point: experiencePoints(experienceText(draft, id))[0],
    questions: [
      { id: "q", dimension: "scale", text: "Who used these reports?" },
    ],
    answerIds: ["answer"],
  };
  const h = setup(draft);
  await act(async () => {
    await new Promise((r) => setTimeout(r, 550));
  });
  expect(
    h.result.current.draft.experienceEnrichment![id].questionPreparations,
  ).toBeUndefined();
  expect(h.request).not.toHaveBeenCalled();
});
it("merges scoring and question metadata independently without overwriting newer editor state", async () => {
  const { mergeExperienceScoreState } = await import("../base/experience");
  const current = questionFixture(null),
    id = current.roles[0].id;
  const oldScoreSnapshot = clone(current);
  current.experienceEnrichment![id].questionPreparations = [
    {
      id: "saved",
      status: "pending",
      request: {
        intent: "questions",
        fingerprint: await experienceFingerprint(current, id),
        feedbackLocale: "en",
        point: experiencePoints(experienceText(current, id))[0],
      },
    },
  ];
  expect(
    mergeExperienceScoreState(current, oldScoreSnapshot, id)
      .experienceEnrichment![id].questionPreparations,
  ).toEqual(current.experienceEnrichment![id].questionPreparations);
  const questions = clone(current);
  delete questions.experienceEnrichment![id].assessment;
  const merged = mergeExperienceScoreState(current, questions, id, "questions");
  expect(merged.experienceEnrichment![id].assessment).toEqual(
    current.experienceEnrichment![id].assessment,
  );
});
it('does not spend on automatic questions for an experience at the 80 threshold', async () => {
 const draft=questionFixture(null); draft.experienceEnrichment![draft.roles[0].id].assessment!.value.score=80;
 const h=setup(draft); await act(async()=>{await new Promise(r=>setTimeout(r,600));});
 expect(h.result.current.draft.experienceEnrichment![draft.roles[0].id].questionPreparations).toBeUndefined();
 expect(h.request).not.toHaveBeenCalled();
});
it('begins preparing the assessed role while another experience is still awaiting its score', async () => {
 const draft=questionFixture(null), other=newRole(); other.context=fact('Coordinated weekly deliveries.'); draft.roles.push(other);
 const h=setup(draft); const started=performance.now();
 await waitFor(()=>expect(h.result.current.draft.experienceEnrichment![draft.roles[0].id].questionPreparations).toHaveLength(1),{timeout:900});
 expect(performance.now()-started).toBeLessThan(900);
 expect(h.request).not.toHaveBeenCalled();
});
