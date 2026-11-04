import { useState, StrictMode } from "react";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import { it, expect, vi } from "vitest";
import { webcrypto } from "node:crypto";
import { GuidedExperience } from "./GuidedExperience";
import { LanguageContext } from "./ui";
import { blankDraft, newRole, fact, type BaseDraft } from "../base/model";
import { currentWording } from "../base/wording";
import {
  experienceFingerprint,
  experiencePoints,
  experienceText,
  isExperienceSessions,
  detailDimensions,
  type ExperienceResult,
} from "@resumora/contracts/intelligence/experience";
function fixture() {
  const d = blankDraft(),
    r = newRole();
  d.language = "en";
  r.title = fact("Analyst");
  r.context = fact("Prepared reports.");
  r.bullets = [fact("Maintained SQL queries.")];
  d.roles = [r];
  return d;
}
function mount(
  request: any,
  initial = fixture(),
  ready = true,
  strict = false,
) {
  Object.defineProperty(crypto, "subtle", {
    configurable: true,
    value: webcrypto.subtle,
  });
  let latest = initial;
  function Harness() {
    const [d, set] = useState(initial);
    latest = d;
    return (
      <LanguageContext value="en">
        <GuidedExperience
          draft={d}
          targetId={d.roles[0].id}
          change={set}
          ready={ready}
          saveFailed={!ready}
          request={request}
        />
      </LanguageContext>
    );
  }
  render(
    strict ? (
      <StrictMode>
        <Harness />
      </StrictMode>
    ) : (
      <Harness />
    ),
  );
  return () => latest;
}
const roleResult = (c: any) =>
  ({
    schemaVersion: "experience-assistant/1",
    targetId: c.targetId,
    fingerprint: c.experience.fingerprint,
    intent: "role",
    text: "Prepared reports.\n\n- Maintained SQL queries.",
    explanation: "Separates responsibilities clearly.",
    factIds: ["source"],
  }) as ExperienceResult;
it("opens with the current role wording beside its improvement guidance", () => {
  mount(vi.fn());
  expect(
    screen.getByRole("heading", { name: "Current description" }),
  ).toBeTruthy();
  expect(screen.getByText("Prepared reports.")).toBeTruthy();
  expect(screen.getByText("Maintained SQL queries.")).toBeTruthy();
  expect(
    screen.getByRole("complementary", { name: "Writing guidance" }),
  ).toBeTruthy();
});
it("shows contextual answer guidance without filling or confirming the answer", async () => {
  const request = vi.fn(async (c: any) => ({
    schemaVersion: "experience-assistant/1",
    targetId: c.targetId,
    fingerprint: c.experience.fingerprint,
    intent: "questions",
    questions: [
      {
        id: "q",
        dimension: "impact",
        text: "Who used these reports?",
        hint: "Name the receiving team and the decision these reports supported.",
      },
    ],
  }));
  const latest = mount(request);
  fireEvent.click(
    screen.getByRole("button", {
      name: "Improve your experience through questions",
    }),
  );
  const answer = await screen.findByRole("textbox", {
    name: "Who used these reports?",
  });
  expect(
    screen.getByText(
      "Name the receiving team and the decision these reports supported.",
    ),
  ).toBeTruthy();
  expect((answer as HTMLTextAreaElement).value).toBe("");
  expect(latest().answers.every((a) => a.status === "draft")).toBe(true);
});
it("persists a completed proposal while the display finishes revealing it, with an optional skip", async () => {
  const text =
    "Prepared clear finance reports and maintained SQL queries. ".repeat(12);
  let finish!: (r: ExperienceResult) => void, context: any;
  const latest = mount((c: any, _recover: boolean, onDraft: any) => {
    context = c;
    onDraft(text);
    return new Promise<ExperienceResult>((resolve) => {
      finish = resolve;
    });
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Improve wording with AI" }),
  );
  await screen.findByText("Drafting…");
  await act(async () =>
    finish({
      ...roleResult(context),
      intent: "role",
      text,
      explanation: "Clearer.",
      factIds: ["source"],
    }),
  );
  await waitFor(() =>
    expect(
      latest().experienceEnrichment?.[latest().roles[0].id].candidate,
    ).toBe(text),
  );
  expect(
    screen.queryByRole("textbox", { name: "Proposed description" }),
  ).toBeNull();
  expect(screen.queryByRole("button", { name: "Use this version" })).toBeNull();
  await waitFor(() =>
    expect(document.querySelector(".guided-prose")).not.toBeNull(),
  );
  expect(
    document.querySelector(".guided-prose")!.textContent!.length,
  ).toBeLessThan(text.length);
  fireEvent.click(screen.getByRole("button", { name: "Show full text" }));
  expect(
    (
      screen.getByRole("textbox", {
        name: "Proposed description",
      }) as HTMLTextAreaElement
    ).value,
  ).toBe(text);
  expect(screen.getByRole("button", { name: "Use this version" })).toBeTruthy();
  expect(currentWording(latest(), latest().roles[0].id)).toBeNull();
});
it("streams one whole-role proposal and requires one explicit acceptance before applying", async () => {
  let finish!: (r: ExperienceResult) => void;
  let context: any;
  const request = vi.fn((c: any, _r: any, onDraft: any) => {
    context = c;
    onDraft?.("Prepared");
    return new Promise<ExperienceResult>((r) => (finish = r));
  });
  const latest = mount(request);
  fireEvent.click(
    screen.getByRole("button", { name: "Improve wording with AI" }),
  );
  await screen.findByText("Prepared");
  expect(currentWording(latest(), latest().roles[0].id)).toBeNull();
  expect(screen.queryByRole("button", { name: "Use this version" })).toBeNull();
  await act(async () => finish(roleResult(context)));
  const editor = await screen.findByRole(
    "textbox",
    {
      name: "Proposed description",
    },
    { timeout: 3000 },
  );
  expect((editor as HTMLTextAreaElement).value).toBe(
    "Prepared reports.\n\n- Maintained SQL queries.",
  );
  fireEvent.click(screen.getByRole("button", { name: "Use this version" }));
  await screen.findByText("Role saved");
  expect(currentWording(latest(), latest().roles[0].id)).toContain("SQL");
});
it("the final answer explicitly requests a proposal with the confirmed evidence", async () => {
  const request = vi.fn(async (c: any) =>
    c.experience.intent === "questions"
      ? {
          schemaVersion: "experience-assistant/1",
          targetId: c.targetId,
          fingerprint: c.experience.fingerprint,
          intent: "questions",
          questions: [
            { id: "q", dimension: "scale", text: "Who used the reports?" },
          ],
        }
      : roleResult(c),
  );
  const latest = mount(request);
  fireEvent.click(
    screen.getByRole("button", {
      name: "Improve your experience through questions",
    }),
  );
  fireEvent.change(
    await screen.findByRole("textbox", { name: "Who used the reports?" }),
    { target: { value: "The finance team." } },
  );
  fireEvent.click(screen.getByRole("button", { name: "See proposal" }));
  await screen.findByRole("textbox", { name: "Proposed description" });
  expect(
    latest().answers.some(
      (a) => a.status === "confirmed" && a.text === "The finance team.",
    ),
  ).toBe(true);
  expect(
    request.mock.calls.filter((c) => c[0].experience.intent === "role"),
  ).toHaveLength(1);
  expect(currentWording(latest(), latest().roles[0].id)).toBeNull();
});
it("reopens a pending operation with read-only recovery", async () => {
  Object.defineProperty(crypto, "subtle", {
    configurable: true,
    value: webcrypto.subtle,
  });
  const d = fixture(),
    id = d.roles[0].id;
  d.experienceEnrichment = {
    [id]: {
      version: 1,
      guided: true,
      pending: {
        id: crypto.randomUUID(),
        request: {
          intent: "role",
          fingerprint: await experienceFingerprint(d, id),
        },
      },
    },
  };
  const request = vi.fn(async (c: any, recover: boolean) => {
    expect(recover).toBe(true);
    return roleResult(c);
  });
  mount(request, d);
  await screen.findByRole("textbox", { name: "Proposed description" });
  expect(request).toHaveBeenCalledTimes(1);
});
it("never reports saved while the Profile save is failing", async () => {
  const d = fixture(),
    id = d.roles[0].id;
  d.experienceEnrichment = {
    [id]: { version: 1, acceptedText: "Prepared reports." },
  };
  mount(vi.fn(), d, false);
  expect(screen.queryByText("Role saved")).toBeNull();
  expect(screen.getByText(/save/i)).toBeTruthy();
});
it("Strict Mode recovers a pending proposal without losing the result or dispatching twice", async () => {
  Object.defineProperty(crypto, "subtle", {
    configurable: true,
    value: webcrypto.subtle,
  });
  const d = fixture(),
    id = d.roles[0].id;
  d.experienceEnrichment = {
    [id]: {
      version: 1,
      guided: true,
      pending: {
        id: crypto.randomUUID(),
        request: {
          intent: "role",
          fingerprint: await experienceFingerprint(d, id),
        },
      },
    },
  };
  const request = vi.fn(async (c: any, recover: boolean) => {
    expect(recover).toBe(true);
    await Promise.resolve();
    return roleResult(c);
  });
  mount(request, d, true, true);
  await screen.findByRole("textbox", { name: "Proposed description" });
  expect(request).toHaveBeenCalledTimes(1);
});
it("editing a candidate immediately invalidates a score and discards a late preview", async () => {
  Object.defineProperty(crypto, "subtle", {
    configurable: true,
    value: webcrypto.subtle,
  });
  const d = fixture(),
    id = d.roles[0].id,
    fingerprint = await experienceFingerprint(d, id);
  const context = { targetId: id, experience: { fingerprint } },
    proposal = roleResult(context) as Extract<
      ExperienceResult,
      { intent: "role" }
    >;
  d.experienceEnrichment = {
    [id]: {
      version: 1,
      guided: true,
      roleProposal: proposal,
      candidate: proposal.text,
      pending: {
        id: crypto.randomUUID(),
        request: { intent: "preview", fingerprint, candidate: proposal.text },
      },
    },
  };
  let finish!: (r: ExperienceResult) => void;
  const latest = mount(
    vi.fn(() => new Promise<ExperienceResult>((r) => (finish = r))),
    d,
  );
  fireEvent.change(
    await screen.findByRole("textbox", { name: "Proposed description" }),
    { target: { value: "Prepared reports for finance." } },
  );
  await act(async () =>
    finish({
      schemaVersion: "experience-assistant/1",
      targetId: id,
      fingerprint,
      intent: "preview",
      candidate: proposal.text,
      assessment: { rubric: "experience-detail/1", dimensions: [], score: 100 },
    }),
  );
  expect(latest().experienceEnrichment?.[id].preview).toBeUndefined();
  expect(screen.queryByText("100")).toBeNull();
});
it("a saved request with no receipt can explicitly resume the same operation", async () => {
  Object.defineProperty(crypto, "subtle", {
    configurable: true,
    value: webcrypto.subtle,
  });
  const d = fixture(),
    id = d.roles[0].id,
    operationId = crypto.randomUUID();
  d.experienceEnrichment = {
    [id]: {
      version: 1,
      guided: true,
      pending: {
        id: operationId,
        request: {
          intent: "role",
          fingerprint: await experienceFingerprint(d, id),
        },
      },
    },
  };
  const request = vi.fn(async (c: any, recover: boolean) => {
    expect(c.operationId).toBe(operationId);
    if (recover) throw Error("MISSING");
    return roleResult(c);
  });
  mount(request, d);
  fireEvent.click(
    await screen.findByRole("button", { name: "Resume improvement" }),
  );
  await screen.findByRole("textbox", { name: "Proposed description" });
  expect(request.mock.calls.map((c) => c[1])).toEqual([true, false]);
});
it("a stale saved proposal can be replaced explicitly without discarding it before success", async () => {
  Object.defineProperty(crypto, "subtle", {
    configurable: true,
    value: webcrypto.subtle,
  });
  const d = fixture(),
    id = d.roles[0].id;
  const proposal = roleResult({
    targetId: id,
    experience: { fingerprint: await experienceFingerprint(d, id) },
  }) as Extract<ExperienceResult, { intent: "role" }>;
  d.experienceEnrichment = {
    [id]: {
      version: 1,
      guided: true,
      roleProposal: proposal,
      candidate: proposal.text,
    },
  };
  d.roles[0].context.value = "Prepared reports for finance.";
  let finish!: (r: ExperienceResult) => void, context: any;
  const request = vi.fn((c: any) => {
    context = c;
    return new Promise<ExperienceResult>((r) => (finish = r));
  });
  const latest = mount(request, d);
  fireEvent.click(
    screen.getByRole("button", { name: "Improve wording with AI" }),
  );
  await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  expect(latest().experienceEnrichment![id].candidate).toBe(proposal.text);
  await act(async () => finish(roleResult(context)));
  expect(
    (
      (await screen.findByRole("textbox", {
        name: "Proposed description",
      })) as HTMLTextAreaElement
    ).value,
  ).toBe(proposal.text);
  expect(latest().experienceEnrichment![id].roleProposal!.fingerprint).not.toBe(
    proposal.fingerprint,
  );
});

it("opens point-specific questions directly and preserves unfinished answers when visiting other points", async () => {
  const d = fixture(),
    id = d.roles[0].id,
    body = experienceText(d, id),
    points = experiencePoints(body);
  d.experienceEnrichment = {
    [id]: {
      version: 1,
      assessment: {
        fingerprint: "a".repeat(64),
        body,
        value: {
          rubric: "experience-quality/3",
          policyVersion: "experience-score/5",
          feedbackLocale: "en",
          scope: "complete",
          score: 65,
          dimensions: detailDimensions.map((dimension) => ({
            dimension,
            grade: "missing",
            evidence: [],
          })),
          experience: null,
          points: points.map((point, index) => ({
            id: `p${index}`,
            point,
            meaningful: true,
            contribution: "partial",
            clarity: "specific",
            specificity: "partial",
            score: 65,
            issue: "scope",
            duplicateOf: null,
            strength: null,
            improvement: `Clarify responsibility ${index + 1}.`,
            suggestedQuestion: null,
          })),
        },
      },
    },
  };
  let failOtherPoint = true;
  const request = vi.fn(async (c: any) => {
    if (c.experience.point.start === points[1].start && failOtherPoint) {
      failOtherPoint = false;
      throw Error("AI_OUTPUT_INVALID");
    }
    return {
      schemaVersion: "experience-assistant/1",
      targetId: id,
      fingerprint: c.experience.fingerprint,
      intent: "questions",
      point: c.experience.point,
      questions: [
        { id: c.operationId, dimension: "scale", text: "Who used this work?" },
      ],
    };
  });
  const latest = mount(request, d);
  expect(screen.queryByRole("button", { name: "Continue" })).toBeNull();
  expect(request).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole("button", { name: /Clarify responsibility 1/ }),
  );
  const answer = await screen.findByRole("textbox", {
    name: "Who used this work?",
  });
  expect(request.mock.calls[0][0].experience.point).toEqual(points[0]);
  expect(screen.getByText("Prepared reports.")).toBeTruthy();
  fireEvent.change(answer, { target: { value: "An unfinished memory" } });
  fireEvent.click(screen.getByRole("button", { name: "Back to suggestions" }));
  fireEvent.click(
    screen.getByRole("button", { name: /Clarify responsibility 2/ }),
  );
  await screen.findByText(
    "We couldn’t prepare the result. You can try again; your information is retained.",
  );
  expect(
    screen.queryByRole("textbox", { name: "Who used this work?" }),
  ).toBeNull();
  fireEvent.click(
    screen.getByRole("button", { name: /Clarify responsibility 2/ }),
  );
  await waitFor(() => expect(request).toHaveBeenCalledTimes(3));
  await screen.findByRole("textbox", { name: "Who used this work?" });
  fireEvent.click(screen.getByRole("button", { name: "Back to suggestions" }));
  fireEvent.click(
    screen.getByRole("button", { name: /Clarify responsibility 1/ }),
  );
  expect(
    (
      screen.getByRole("textbox", {
        name: "Who used this work?",
      }) as HTMLTextAreaElement
    ).value,
  ).toBe("An unfinished memory");
  expect(request).toHaveBeenCalledTimes(3);
  expect(isExperienceSessions(latest().experienceEnrichment)).toBe(true);
});
it("an unavailable saved result shows the overview and permits only an explicit new attempt", async () => {
  const d = fixture(),
    id = d.roles[0].id,
    operationId = crypto.randomUUID();
  d.experienceEnrichment = {
    [id]: {
      version: 1,
      guided: true,
      pending: {
        id: operationId,
        request: {
          intent: "questions",
          fingerprint: await experienceFingerprint(d, id),
        },
      },
    },
  };
  const request = vi.fn(async (c: any, recover: boolean) => {
    if (recover) throw Error("AI_RESULT_UNAVAILABLE");
    return {
      schemaVersion: "experience-assistant/1",
      targetId: id,
      fingerprint: c.experience.fingerprint,
      intent: "questions",
      questions: [
        { id: "q", dimension: "impact", text: "Who used the reports?" },
      ],
    };
  });
  mount(request, d);
  await screen.findByText(
    "The request was interrupted. Your answers are retained.",
  );
  expect(
    screen.getByRole("heading", { name: "Current description" }),
  ).toBeTruthy();
  expect(screen.queryByText("Preparing your draft…")).toBeNull();
  expect(request).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await screen.findByRole("textbox", { name: "Who used the reports?" });
  expect(request).toHaveBeenCalledTimes(2);
  expect(request.mock.calls[1][0].operationId).not.toBe(operationId);
  expect(request.mock.calls.map((c) => c[1])).toEqual([true, false]);
});

it("reopening an already improved role opens its overview without a Continue gate", () => {
  const d = fixture(),
    id = d.roles[0].id;
  d.experienceEnrichment = {
    [id]: { version: 1, guided: true, acceptedText: experienceText(d, id) },
  };
  const request = vi.fn();
  mount(request, d);
  expect(
    screen.getByRole("heading", { name: "Current description" }),
  ).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Continue" })).toBeNull();
  expect(screen.queryByText("Role saved")).toBeNull();
  expect(request).not.toHaveBeenCalled();
});
