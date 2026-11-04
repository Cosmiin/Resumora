import { questionFixture } from "./guided-question-cache.test-fixture";
import { StrictMode, useState } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import {
  blankDraft,
  clone,
  fact,
  newRole,
  type BaseDraft,
} from "../base/model";
import {
  experienceFingerprint,
  experiencePoints,
  experienceText,
  isExperienceSessions,
  type ExperienceResult,
} from "@resumora/contracts/intelligence/experience";
import { experiencePolicy } from "@resumora/contracts/intelligence/experience-policy";
import { useGuidedExperience } from "./useGuidedExperience";
import { LanguageContext } from "./ui";

beforeEach(() =>
  Object.defineProperty(crypto, "subtle", {
    configurable: true,
    value: webcrypto.subtle,
  }),
);
function setup(
  initial = questionFixture(),
  request = vi.fn(async (c: any): Promise<ExperienceResult> => ({
    schemaVersion: "experience-assistant/1",
    targetId: c.targetId,
    fingerprint: c.experience.fingerprint,
    intent: "questions",
    point: c.experience.point,
    questions: [
      { id: "generated", dimension: "tools", text: "Which tools did you use?" },
    ],
  })),
) {
  let setLocale!: (locale: "en" | "ro") => void;
  function Wrapper({ children }: { children: React.ReactNode }) {
    const [locale, updateLocale] = useState<"en" | "ro">("en");
    setLocale = updateLocale;
    return (
      <StrictMode>
        <LanguageContext value={locale}>{children}</LanguageContext>
      </StrictMode>
    );
  }
  const hook = renderHook(
    () => {
      const [draft, setDraft] = useState(initial),
        [ready, setReady] = useState(true);
      const flow = useGuidedExperience({
        draft,
        targetId: draft.roles[0].id,
        change: setDraft,
        ready,
        saveFailed: false,
        request,
      });
      return {
        draft,
        setDraft,
        setLocale: (locale: "en" | "ro") => setLocale(locale),
        setReady,
        flow,
      };
    },
    { wrapper: Wrapper },
  );
  return {
    ...hook,
    request,
    point: experiencePoints(experienceText(initial, initial.roles[0].id))[0],
  };
}

it("opens the current assessment's question immediately with an empty draft answer and no generation", async () => {
  const h = setup();
  await act(async () => h.result.current.flow.ask(h.point));

  expect(h.result.current.flow.question?.text).toBe("Who used these reports?");
  expect(h.result.current.flow.question?.dimension).toBe("scale");
  expect(h.result.current.flow.answer).toMatchObject({
    text: "",
    status: "draft",
  });
  expect(h.request).not.toHaveBeenCalled();
  expect(
    isExperienceSessions(h.result.current.draft.experienceEnrichment),
  ).toBe(true);
});
it("reuses prepared API questions without a second request and preserves typed answers", async () => {
  const draft = questionFixture(null),
    id = draft.roles[0].id;
  const fingerprint = await experienceFingerprint(draft, id);
  const point = experiencePoints(experienceText(draft, id))[0];
  draft.experienceEnrichment![id].questionPreparations = [
    {
      id: "prepared",
      status: "ready",
      request: {
        intent: "questions",
        fingerprint,
        feedbackLocale: "en",
        point,
      },
      questions: [
        {
          id: "q",
          dimension: "scale",
          text: "Who received the reports?",
          hint: "Name the audience.",
        },
      ],
    },
  ];
  const h = setup(draft);
  await act(async () => h.result.current.flow.ask(h.point));
  expect(h.result.current.flow.question).toMatchObject({
    text: "Who received the reports?",
    hint: "Name the audience.",
  });
  act(() => h.result.current.flow.answerText("Finance"));
  act(() => h.result.current.flow.back());
  await act(async () => h.result.current.flow.ask(h.point));
  expect(h.result.current.flow.answer?.text).toBe("Finance");
  expect(h.request).not.toHaveBeenCalled();
});
it.each(["text", "locale"])(
  "does not reuse a saved round after a %s change",
  async (change) => {
    const h = setup();
    await act(async () => h.result.current.flow.ask(h.point));
    expect(h.result.current.flow.question?.text).toBe(
      "Who used these reports?",
    );
    act(() => h.result.current.flow.back());
    act(() => {
      if (change === "locale")
        h.result.current.setDraft({
          ...h.result.current.draft,
          documentLocale: "ro",
        });
      else {
        const next = clone(h.result.current.draft);
        next.roles[0].company = fact("Different organization");
        delete next.experienceEnrichment![next.roles[0].id].assessment;
        h.result.current.setDraft(next);
      }
    });
    await act(async () => h.result.current.flow.ask(h.point));
    await waitFor(() => expect(h.request).toHaveBeenCalledTimes(1));

    await waitFor(() =>
      expect(h.result.current.flow.question?.text).toBe(
        "Which tools did you use?",
      ),
    );
    expect(h.request.mock.calls[0][0].experience.feedbackLocale).toBe(
      change === "locale" ? "ro" : "en",
    );
  },
);
it("waits for the existing background receipt when clicked mid-preparation", async () => {
  const draft = questionFixture(null),
    id = draft.roles[0].id;
  const point = experiencePoints(experienceText(draft, id))[0];
  draft.experienceEnrichment![id].questionPreparations = [
    {
      id: "inflight",
      status: "pending",
      request: {
        intent: "questions",
        fingerprint: await experienceFingerprint(draft, id),
        feedbackLocale: "en",
        point,
      },
    },
  ];
  const h = setup(draft);
  await act(async () => h.result.current.flow.ask(h.point));
  expect(h.result.current.flow.preparing).toBe(true);
  expect(h.request).not.toHaveBeenCalled();
  act(() => {
    const next = clone(h.result.current.draft);
    const entry = next.experienceEnrichment![id].questionPreparations![0];
    entry.status = "ready";
    entry.questions = [
      { id: "q", dimension: "scale", text: "Who received the reports?" },
    ];
    h.result.current.setDraft(next);
  });
  await waitFor(() =>
    expect(h.result.current.flow.question?.text).toBe(
      "Who received the reports?",
    ),
  );
  expect(h.result.current.flow.preparing).toBe(false);
  expect(h.request).not.toHaveBeenCalled();
});
it("validates bounded preparation metadata and rejects malformed or ambiguous entries", async () => {
  const draft = questionFixture(null),
    id = draft.roles[0].id;
  const entry = {
    id: "prepared",
    status: "ready" as const,
    request: {
      intent: "questions" as const,
      fingerprint: await experienceFingerprint(draft, id),
      feedbackLocale: "en" as const,
      point: experiencePoints(experienceText(draft, id))[0],
    },
    questions: [
      {
        id: "q",
        dimension: "scale" as const,
        text: "Who received the reports?",
      },
    ],
  };
  const valid = (entries: unknown[]) =>
    isExperienceSessions({
      [id]: { version: 1, questionPreparations: entries },
    });
  expect(valid([entry])).toBe(true);
  expect(valid([entry, entry])).toBe(false);
  expect(
    valid(Array.from({ length: 4 }, (_, i) => ({ ...entry, id: String(i) }))),
  ).toBe(false);
  expect(
    valid([{ ...entry, request: { ...entry.request, intent: "role" } }]),
  ).toBe(false);
  expect(
    valid([
      { ...entry, request: { ...entry.request, feedbackLocale: undefined } },
    ]),
  ).toBe(false);
  expect(valid([{ ...entry, status: "pending" }])).toBe(false);
  expect(
    valid([{ ...entry, questions: [{ ...entry.questions[0], text: "" }] }]),
  ).toBe(false);
});
it("leaves a waiting question when its text or feedback language changes", async () => {
  const draft = questionFixture(null),
    id = draft.roles[0].id;
  const point = experiencePoints(experienceText(draft, id))[0];
  draft.experienceEnrichment![id].questionPreparations = [
    {
      id: "inflight",
      status: "pending",
      request: {
        intent: "questions",
        fingerprint: await experienceFingerprint(draft, id),
        feedbackLocale: "en",
        point,
      },
    },
  ];
  const h = setup(draft);
  await act(async () => h.result.current.flow.ask(h.point));
  expect(h.result.current.flow.activeQuestionPoint).toEqual(point);
  expect(h.result.current.flow.preparing).toBe(true);
  act(() =>
    h.result.current.setDraft({
      ...h.result.current.draft,
      documentLocale: "ro",
    }),
  );
  expect(h.result.current.flow.questionsOpen).toBe(false);
  expect(h.result.current.flow.preparing).toBe(false);
  expect(h.request).not.toHaveBeenCalled();
});
it("an explicit retry replaces an unavailable background receipt with one fresh operation", async () => {
  const draft = questionFixture(null),
    id = draft.roles[0].id;
  draft.experienceEnrichment![id].questionPreparations = [
    {
      id: "unknown-receipt",
      status: "unknown",
      request: {
        intent: "questions",
        fingerprint: await experienceFingerprint(draft, id),
        feedbackLocale: "en",
        point: experiencePoints(experienceText(draft, id))[0],
      },
    },
  ];
  const request = vi.fn(
    async (c: any, recover?: boolean): Promise<ExperienceResult> => {
      if (recover) throw Error("AI_RESULT_UNAVAILABLE");
      return {
        schemaVersion: "experience-assistant/1",
        intent: "questions",
        targetId: id,
        fingerprint: c.experience.fingerprint,
        point: c.experience.point,
        questions: [
          { id: "new", dimension: "scale", text: "Who received your work?" },
        ],
      };
    },
  );
  const h = setup(draft, request);
  await act(async () => h.result.current.flow.ask(h.point));
  await waitFor(() =>
    expect(h.result.current.flow.error).toBe("AI_RESULT_UNAVAILABLE"),
  );
  act(() => h.result.current.flow.retry());
  await waitFor(() =>
    expect(h.result.current.flow.question?.text).toBe(
      "Who received your work?",
    ),
  );
  expect(request).toHaveBeenCalledTimes(2);
  expect(request.mock.calls.map(([, recover]) => recover)).toEqual([
    true,
    false,
  ]);
  expect(request.mock.calls[1][0].operationId).not.toBe("unknown-receipt");
});
it("keeps an unfinished second question after confirming the first and revisiting the point", async () => {
  const draft = questionFixture(null),
    id = draft.roles[0].id;
  draft.experienceEnrichment![id].questionPreparations = [
    {
      id: "prepared",
      status: "ready",
      request: {
        intent: "questions",
        fingerprint: await experienceFingerprint(draft, id),
        feedbackLocale: "en",
        point: experiencePoints(experienceText(draft, id))[0],
      },
      questions: [
        { id: "first", dimension: "scale", text: "Who used your reports?" },
        { id: "second", dimension: "tools", text: "Which reporting tools?" },
      ],
    },
  ];
  const h = setup(draft);
  await act(async () => h.result.current.flow.ask(h.point));
  act(() => h.result.current.flow.answerText("The finance team"));
  await act(async () => h.result.current.flow.advance());
  expect(h.result.current.flow.question?.id).toBe("second");
  expect(h.result.current.flow.state.round?.fingerprint).toBe(
    await experienceFingerprint(h.result.current.draft, id),
  );
  act(() => h.result.current.flow.answerText("SQL and a spreadsheet"));
  act(() => h.result.current.flow.back());
  await act(async () => h.result.current.flow.ask(h.point));
  expect(h.result.current.flow.question?.id).toBe("second");
  expect(h.result.current.flow.answer?.text).toBe("SQL and a spreadsheet");
  expect(
    h.result.current.draft.answers.filter((a) => a.status === "confirmed"),
  ).toHaveLength(1);
  expect(h.request).not.toHaveBeenCalled();
});

it("keeps English questions and draft answers when only the interface changes to Romanian", async () => {
  const h = setup();
  await act(async () => h.result.current.flow.ask(h.point));
  act(() => h.result.current.flow.answerText("The finance team."));
  act(() => h.result.current.flow.back());
  act(() => h.result.current.setLocale("ro"));
  await act(async () => h.result.current.flow.ask(h.point));
  expect(h.result.current.flow.question?.text).toBe("Who used these reports?");
  expect(h.result.current.flow.answer?.text).toBe("The finance team.");
  expect(h.request).not.toHaveBeenCalled();
});
it("uses explicit Romanian content language even with an English interface and legacy English language field", async () => {
  const draft = questionFixture(null);
  draft.documentLocale = "ro";
  const h = setup(draft);
  await act(async () => h.result.current.flow.ask());
  await waitFor(() => expect(h.request).toHaveBeenCalledOnce());
  expect(h.request.mock.calls[0][0].experience.feedbackLocale).toBe("ro");
});
it("opens the main guided action with an existing diagnostic question without another AI request", async () => {
  const h = setup();
  await act(async () => h.result.current.flow.ask());
  expect(h.result.current.flow.question?.text).toBe("Who used these reports?");
  expect(h.result.current.flow.activeQuestionPoint?.text).toBe(h.point.text);
  expect(h.request).not.toHaveBeenCalled();
});
it("the main guided action reuses prepared point questions and saved draft answers", async () => {
  const draft = questionFixture(null),
    id = draft.roles[0].id;
  const point = experiencePoints(experienceText(draft, id))[0];
  draft.experienceEnrichment![id].questionPreparations = [
    {
      id: "cached",
      status: "ready",
      request: {
        intent: "questions",
        feedbackLocale: "en",
        fingerprint: await experienceFingerprint(draft, id),
        point,
      },
      questions: [
        { id: "q", dimension: "scale", text: "Who received your work?" },
      ],
    },
  ];
  const h = setup(draft);
  await act(async () => h.result.current.flow.ask());
  expect(h.result.current.flow.question?.text).toBe("Who received your work?");
  act(() => h.result.current.flow.answerText("The finance team"));
  act(() => h.result.current.flow.back());
  await act(async () => h.result.current.flow.ask());
  expect(h.result.current.flow.answer?.text).toBe("The finance team");
  expect(h.request).not.toHaveBeenCalled();
});
it("appends voice segments against the latest answer without overwriting intervening edits", async () => {
  const h = setup();
  await act(async () => h.result.current.flow.ask(h.point));
  const append = h.result.current.flow.appendAnswerText;
  act(() => {
    h.result.current.flow.answerText("Typed first.");
    append("First spoken sentence.");
    append("Second spoken sentence.");
  });
  expect(h.result.current.flow.answer?.text).toBe(
    "Typed first.\nFirst spoken sentence.\nSecond spoken sentence.",
  );
  act(() => h.result.current.flow.answerText("x".repeat(3999)));
  expect(append("more")).toBe(false);
  expect(h.result.current.flow.answer?.text).toHaveLength(3999);
});
it.each(["current", "archived"])(
  "resumes an unfinished %s whole-role round before selecting a diagnostic point",
  async (location) => {
    const draft = questionFixture(),
      id = draft.roles[0].id;
    const round = {
      id: "existing-round",
      fingerprint: await experienceFingerprint(draft, id),
      feedbackLocale: "en" as const,
      questions: [
        {
          id: "saved-question",
          dimension: "tools" as const,
          text: "Which tools supported your work?",
        },
      ],
      answerIds: ["saved-answer"],
    };
    draft.answers.push({
      id: "saved-answer",
      targetId: id,
      question: "tools",
      questionText: round.questions[0].text,
      text: "My unfinished answer",
      status: "draft",
    });
    if (location === "current") draft.experienceEnrichment![id].round = round;
    else draft.experienceEnrichment![id].rounds = [round];
    const h = setup(draft);
    await act(async () => h.result.current.flow.ask());
    expect(h.result.current.flow.state.round?.id).toBe("existing-round");
    expect(h.result.current.flow.question?.id).toBe("saved-question");
    expect(h.result.current.flow.answer?.text).toBe("My unfinished answer");
    expect(h.result.current.flow.activeQuestionPoint).toBeUndefined();
    expect(h.request).not.toHaveBeenCalled();
  },
);
it("changes full content locale lazily while preserving original answers and receipt ids", async () => {
  const h = setup();
  await act(async () => h.result.current.flow.ask());
  act(() => h.result.current.flow.answerText("Original answer evidence"));
  const original = h.result.current.draft,
    id = original.roles[0].id;
  act(() =>
    h.result.current.setDraft({
      ...original,
      language: "fr-CA",
      documentLocale: "fr-CA",
      contentLanguage: {
        locale: "fr-CA",
        confidence: "high",
        source: "user-correction",
        policyVersion: "cv-language/1",
      },
    }),
  );
  expect(h.result.current.flow.question).toBeUndefined();
  expect(
    h.result.current.draft.answers.some(
      (a) => a.text === "Original answer evidence",
    ),
  ).toBe(true);
  expect(h.request).not.toHaveBeenCalled();
  await act(async () => h.result.current.flow.ask());
  await waitFor(() => expect(h.request).toHaveBeenCalledOnce());
  expect(h.request.mock.calls[0][0].experience.feedbackLocale).toBe("fr-CA");
});
it("does not present an unaccepted proposal after a content language correction", async () => {
  const draft = questionFixture(null),
    id = draft.roles[0].id;
  draft.experienceEnrichment![id].roleProposal = {
    schemaVersion: "experience-assistant/1",
    targetId: id,
    intent: "role",
    fingerprint: await experienceFingerprint(draft, id),
    text: "Old English proposal",
    explanation: "Old English explanation",
    factIds: [],
  };
  draft.experienceEnrichment![id].candidate = "Old English proposal";
  draft.language = "fr";
  draft.documentLocale = "fr";
  draft.contentLanguage = {
    locale: "fr",
    confidence: "high",
    source: "user-correction",
    policyVersion: "cv-language/1",
  };
  const originalAnswers = clone(draft.answers),
    h = setup(draft);
  await act(async () => {});
  expect(h.result.current.flow.state.roleProposal).toBeUndefined();
  expect(h.result.current.draft.answers).toEqual(originalAnswers);
  expect(h.request).not.toHaveBeenCalled();
});
