import { experiencePolicy } from "@resumora/contracts/intelligence/experience-policy";
import { StrictMode, useState } from "react";
import {
  render,
  act,
  screen,
  fireEvent,
  waitFor,
  within,
} from "@testing-library/react";
import { it, expect, vi } from "vitest";
import { webcrypto } from "node:crypto";
import { ExperienceEnrichment } from "./ExperienceEnrichment";
import { ProfileEditorContext } from './ProfileOverview';
import { LanguageContext } from "./ui";
import { blankDraft, newRole, fact, type BaseDraft } from "../base/model";
import {
  experienceText,
  experiencePoints,
  experienceFingerprint,
  experienceQualityScore,
  pointQualityScore,
  type ExperienceResult,
} from "@resumora/contracts/intelligence/experience";
import { currentWording } from "../base/wording";
import {
  applyExperiencePoint,
  undoExperiencePoint,
  applyExperienceSkills,
  confirmExperienceDetail,
} from "../base/experience";
import {
  httpIntelligence,
  IntelligenceRequestError,
} from "../base/intelligence";
function fixture() {
  const d = blankDraft(),
    r = newRole();
  d.language = "en";
  r.context = fact("Prepared weekly reports.");
  r.bullets = [fact("Maintained SQL queries.")];
  r.title = fact("Analyst");
  r.company = fact("Example");
  d.roles = [r];
  d.technicalSkills = [fact("SQL")];
  return d;
}
it('current profile experience editing does not expose skill editing or discovery actions',()=>{
 const d=fixture();render(<LanguageContext value="en"><ProfileEditorContext.Provider value={{documentMode:true,setRoleBusy:()=>{},closeEnrichment:()=>{}} as any}>
  <ExperienceEnrichment draft={d} targetId={d.roles[0].id} change={()=>{}} ready={false} saveFailed={false} request={vi.fn()}/>
 </ProfileEditorContext.Provider></LanguageContext>);
 expect(screen.queryByRole('button',{name:'Review skills'})).toBeNull();
 expect(screen.queryByRole('button',{name:/Add .* selected/})).toBeNull();
});
function harness(
  initial = fixture(),
  callback?: (context: any, recover?: boolean) => Promise<ExperienceResult>,
  ready = true,
) {
  Object.defineProperty(crypto, "subtle", {
    configurable: true,
    value: webcrypto.subtle,
  });
  let latest = initial;
  const requests = vi.fn(
    callback ??
      (async (c) =>
        ({
          schemaVersion: "experience-assistant/1",
          targetId: c.targetId,
          fingerprint: c.experience.fingerprint,
          intent: c.experience.intent,
          ...(c.experience.intent === "point"
            ? {
                point: c.experience.point,
                text: "Prepared weekly reports with SQL.",
                explanation: "Clarifies the method.",
                factIds: [initial.roles[0].context.id],
              }
            : c.experience.intent === "questions"
              ? {
                  point: c.experience.point,
                  questions: [
                    { id: "q1", dimension: "tools", text: "What did you use?" },
                  ],
                }
              : c.experience.intent === "skills"
                ? {
                    skills: [
                      {
                        id: "skill1",
                        label: "Report preparation",
                        category: "professionalSkills",
                        evidence: "Prepared weekly reports.",
                        factIds: [initial.roles[0].context.id],
                      },
                    ],
                  }
                : {
                    assessment: {
                      rubric: "experience-detail/1",
                      score: 50,
                      dimensions: [
                        "contribution",
                        "methods",
                        "scope",
                        "outcome",
                      ].map((dimension, i) => ({
                        dimension,
                        grade: i < 2 ? "specific" : "missing",
                        evidence: i < 2 ? ["Prepared"] : [],
                      })),
                    },
                  }),
        }) as ExperienceResult),
  );
  function Surface() {
    const [d, setDraft] = useState(initial);
    latest = d;
    return (
      <LanguageContext value="en">
        <ExperienceEnrichment
          draft={d}
          targetId={d.roles[0].id}
          change={setDraft}
          ready={ready}
          saveFailed={false}
          request={requests}
        />
      </LanguageContext>
    );
  }
  const view = render(
    <StrictMode>
      <Surface />
    </StrictMode>,
  );
  return {
    ...view,
    requests,
    get latest() {
      return latest;
    },
  };
}
it("opening and selecting points makes no AI requests; saved edits affect exactly one point", async () => {
  const h = harness();
  expect(h.requests).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole("button", { name: /Prepared weekly reports\.\s*Edit/ }),
  );
  fireEvent.change(screen.getByLabelText("Your point"), {
    target: { value: "Prepared weekly SQL reports." },
  });
  expect(h.requests).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Save point" }));
  await waitFor(() =>
    expect(currentWording(h.latest, h.latest.roles[0].id)).toContain(
      "Prepared weekly SQL reports.",
    ),
  );
  expect(experienceText(h.latest, h.latest.roles[0].id)).toBe(
    "Prepared weekly SQL reports.\n\n• Maintained SQL queries.",
  );
  expect(h.latest.roles[0].context.value).toBe("Prepared weekly reports.");
  await waitFor(() => expect(h.requests).toHaveBeenCalledTimes(1));
  expect(h.requests.mock.calls[0][0].experience.intent).toBe("score");
});
it("one suggestion replaces only the selected point after explicit Use; original evidence survives", async () => {
  const h = harness();
  fireEvent.click(
    screen.getByRole("button", { name: /Prepared weekly reports\.\s*Edit/ }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Improve this point" }));
  await screen.findByRole("button", { name: "Use this" });
  expect(currentWording(h.latest, h.latest.roles[0].id)).toBeNull();
  expect(h.requests).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Use this" }));
  await waitFor(() =>
    expect(experienceText(h.latest, h.latest.roles[0].id)).toBe(
      "Prepared weekly reports with SQL.\n\n• Maintained SQL queries.",
    ),
  );
  await waitFor(() =>
    expect(
      screen
        .getByRole("button", { name: "Undo last update" })
        .hasAttribute("disabled"),
    ).toBe(false),
  );
  fireEvent.click(screen.getByRole("button", { name: "Undo last update" }));
  await waitFor(() =>
    expect(experienceText(h.latest, h.latest.roles[0].id)).toContain(
      "Prepared weekly reports.",
    ),
  );
});
it("coaching is optional, free text persists, and does not alter score or CV before using a point", async () => {
  const h = harness();
  fireEvent.click(
    screen.getByRole("button", { name: /Prepared weekly reports\.\s*Edit/ }),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Help me add more detail" }),
  );
  await screen.findByRole("textbox", { name: "What did you use?" });
  expect(screen.queryByRole("checkbox")).toBeNull();
  fireEvent.change(screen.getByLabelText("What did you use?"), {
    target: { value: "SQL queries" },
  });
  expect(h.latest.answers[0].status).toBe("draft");
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  expect(h.latest.answers[0].status).toBe("confirmed");
  expect(currentWording(h.latest, h.latest.roles[0].id)).toBeNull();
  expect(
    h.latest.experienceEnrichment?.[h.latest.roles[0].id].assessment,
  ).toBeUndefined();
  fireEvent.click(screen.getByRole("button", { name: "Show me the point" }));
  await screen.findByRole("button", { name: "Use this" });
  expect(h.requests).toHaveBeenCalledTimes(2);
});
it("skill review starts unchecked, permits rename and only adds selected competencies", async () => {
  const h = harness();
  fireEvent.click(screen.getByRole("button", { name: "Review skills" }));
  const checkbox = await screen.findByRole("checkbox");
  expect((checkbox as HTMLInputElement).checked).toBe(false);
  expect(h.latest.professionalSkills).toHaveLength(0);
  fireEvent.change(
    screen.getByRole("textbox", { name: "Skill name: Report preparation" }),
    { target: { value: "Reporting" } },
  );
  fireEvent.click(checkbox);
  fireEvent.click(screen.getByRole("button", { name: "Add 1 selected" }));
  await waitFor(() =>
    expect(h.latest.professionalSkills.map((f) => f.value)).toEqual([
      "Reporting",
    ]),
  );
  expect(h.latest.technicalSkills.map((f) => f.value)).toEqual(["SQL"]);
});
it("refresh with a pending request only reads its receipt, including StrictMode", async () => {
  Object.defineProperty(crypto, "subtle", {
    configurable: true,
    value: webcrypto.subtle,
  });
  const d = fixture(),
    id = d.roles[0].id;
  d.experienceEnrichment = {
    [id]: {
      version: 1,
      pending: {
        id: crypto.randomUUID(),
        request: {
          intent: "questions",
          fingerprint: await experienceFingerprint(d, id),
        },
      },
    },
  };
  const h = harness(d, async (c) => ({
    schemaVersion: "experience-assistant/1",
    intent: "questions",
    targetId: id,
    fingerprint: c.experience.fingerprint,
    questions: [],
  }));
  await waitFor(() => expect(h.requests).toHaveBeenCalledTimes(1));
  expect(h.requests.mock.calls[0][1]).toBe(true);
  await waitFor(() =>
    expect(h.latest.experienceEnrichment?.[id].pending).toBeUndefined(),
  );
});
it("unacknowledged saves fence inference; draft editor persists for reopening", async () => {
  const h = harness(fixture(), undefined, false);
  fireEvent.click(
    screen.getByRole("button", { name: /Prepared weekly reports\.\s*Edit/ }),
  );
  fireEvent.change(screen.getByLabelText("Your point"), {
    target: { value: "Draft retained" },
  });
  expect(
    h.latest.experienceEnrichment?.[h.latest.roles[0].id].editor?.text,
  ).toBe("Draft retained");
  fireEvent.change(screen.getByLabelText("Your point"), {
    target: { value: "Prepared weekly reports." },
  });
  fireEvent.click(screen.getByRole("button", { name: "Improve this point" }));
  await waitFor(() =>
    expect(
      h.latest.experienceEnrichment?.[h.latest.roles[0].id].pending,
    ).toBeDefined(),
  );
  expect(h.requests).not.toHaveBeenCalled();
});
it("unknown requests stay fenced and progress checks reuse their ID", async () => {
  const h = harness(fixture(), async () => {
    throw new IntelligenceRequestError("AI_REQUEST_UNKNOWN");
  });
  fireEvent.click(screen.getByRole("button", { name: "Check detail score" }));
  await screen.findByRole("button", { name: "Check progress" });
  const id = h.requests.mock.calls[0][0].operationId;
  expect(
    h.latest.experienceEnrichment?.[h.latest.roles[0].id].scorePending?.id,
  ).toBe(id);
  fireEvent.click(screen.getByRole("button", { name: "Check progress" }));
  await waitFor(() => expect(h.requests).toHaveBeenCalledTimes(2));
  expect(h.requests.mock.calls[1][0].operationId).toBe(id);
  expect(h.requests.mock.calls[1][1]).toBe(true);
});
it("Undo cannot overwrite newer text; conservative dedup spans both competency lists", () => {
  const d = fixture(),
    id = d.roles[0].id;
  let next = applyExperiencePoint(
    d,
    id,
    experiencePoints(experienceText(d, id))[0],
    "Prepared SQL reports.",
    "user_authored",
  );
  expect(experienceText(undoExperiencePoint(next, id), id)).toBe(
    experienceText(d, id),
  );
  next.presentation.approvedWording![id].text = "Later edit";
  expect(() => undoExperiencePoint(next, id)).toThrow("STALE_INPUT");
  const suggestions = [
    {
      id: "sql",
      label: "SQL",
      category: "professionalSkills" as const,
      evidence: "SQL",
      factIds: [],
    },
    {
      id: "mysql",
      label: "MySQL",
      category: "technicalSkills" as const,
      evidence: "MySQL",
      factIds: [],
    },
  ];
  const added = applyExperienceSkills(d, id, suggestions, {
    sql: { selected: true, label: "  sql  ", category: "professionalSkills" },
    mysql: { selected: true, label: "MySQL", category: "technicalSkills" },
  });
  expect(added.professionalSkills).toHaveLength(0);
  expect(added.technicalSkills.map((f) => f.value)).toEqual(["SQL", "MySQL"]);
});
it("editing confirmed detail retains old citations while superseding it for later suggestions", () => {
  const d = fixture(),
    id = d.roles[0].id;
  let next = confirmExperienceDetail(
    d,
    id,
    "Used SQL",
    "Tools?",
    "tools",
    "answer1",
  );
  next = applyExperiencePoint(
    next,
    id,
    experiencePoints(experienceText(next, id))[0],
    "Prepared reports with SQL.",
    "ai_generated",
  );
  next = confirmExperienceDetail(
    next,
    id,
    "Used Excel",
    "Tools?",
    "tools",
    "answer1",
  );
  expect(currentWording(next, id)).toContain("with SQL");
  expect(next.experienceEnrichment?.[id].supersededAnswerIds).toEqual([
    "answer1",
  ]);
});
it("HTTP recovery validates intent and scope and never posts a replacement request", async () => {
  const calls: string[] = [];
  const context = {
    snapshotId: "snapshot",
    revision: 2,
    targetId: "role",
    operationId: crypto.randomUUID(),
    experience: { intent: "score" as const, fingerprint: "a".repeat(64) },
  };
  const client = httpIntelligence(async (path) => {
    calls.push(path);
    return Response.json({
      kind: "rewrite",
      input: {
        targetId: "role",
        experience: { ...context.experience, intent: "skills" },
      },
      state: "ready",
      result: {},
    });
  });
  await expect(client.experience!(context, true)).rejects.toMatchObject({
    code: "IDEMPOTENCY_BODY_MISMATCH",
  });
  expect(calls).toEqual([`/v1/intelligence/operations/${context.operationId}`]);
});
it("a saved coaching proposal reopens at the point rather than returning to the question round", async () => {
  Object.defineProperty(crypto, "subtle", {
    configurable: true,
    value: webcrypto.subtle,
  });
  const d = fixture(),
    id = d.roles[0].id,
    point = experiencePoints(experienceText(d, id))[0],
    fingerprint = await experienceFingerprint(d, id);
  d.experienceEnrichment = {
    [id]: {
      version: 1,
      editor: {
        baseText: experienceText(d, id),
        point,
        text: point.text,
        mode: "edit",
      },
      round: {
        id: "round",
        fingerprint,
        point,
        questions: [{ id: "q", dimension: "tools", text: "Tools?" }],
        answerIds: ["answer"],
      },
      proposal: {
        schemaVersion: "experience-assistant/1",
        intent: "point",
        targetId: id,
        fingerprint,
        point,
        text: "Prepared weekly SQL reports.",
        explanation: "Clear method.",
        factIds: [d.roles[0].context.id],
      },
    },
  };
  const h = harness(d);
  expect(screen.getByRole("button", { name: "Use this" })).toBeDefined();
  expect(
    screen.queryByRole("button", { name: "Show me the point" }),
  ).toBeNull();
  expect(h.requests).not.toHaveBeenCalled();
});
it("skills can be reclassified or dismissed before applying", async () => {
  const h = harness();
  fireEvent.click(screen.getByRole("button", { name: "Review skills" }));
  await screen.findByRole("checkbox");
  fireEvent.change(
    screen.getByRole("combobox", { name: "Category: Report preparation" }),
    { target: { value: "technicalSkills" } },
  );
  expect(
    h.latest.experienceEnrichment?.[h.latest.roles[0].id].skillChoices?.skill1
      .category,
  ).toBe("technicalSkills");
  fireEvent.click(
    screen.getByRole("button", { name: "Dismiss Report preparation" }),
  );
  expect(screen.queryByRole("checkbox")).toBeNull();
  expect(h.latest.professionalSkills).toHaveLength(0);
  expect(h.latest.technicalSkills.map((f) => f.value)).toEqual(["SQL"]);
});
it("returning from coaching resumes the same round without another request", async () => {
  const h = harness();
  fireEvent.click(
    screen.getByRole("button", { name: /Prepared weekly reports\.\s*Edit/ }),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Help me add more detail" }),
  );
  await screen.findByRole("textbox", { name: "What did you use?" });
  fireEvent.change(screen.getByLabelText("What did you use?"), {
    target: { value: "A draft detail" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Back to your point" }));
  fireEvent.click(
    screen.getByRole("button", { name: "Help me add more detail" }),
  );
  expect(
    (screen.getByLabelText("What did you use?") as HTMLTextAreaElement).value,
  ).toBe("A draft detail");
  expect(h.requests).toHaveBeenCalledTimes(1);
});
it("skipping discovery questions adds no duplicate achievement and invokes no rewrite", async () => {
  const h = harness();
  fireEvent.click(screen.getByRole("button", { name: "Add a point" }));
  fireEvent.click(
    screen.getByRole("button", {
      name: "Help me find something worth including",
    }),
  );
  await screen.findByRole("textbox", { name: "What did you use?" });
  fireEvent.click(screen.getByRole("button", { name: "Not sure" }));
  fireEvent.click(screen.getByRole("button", { name: "Show me the point" }));
  await screen.findByText(
    "Nothing added. Come back whenever you remember a detail.",
  );
  expect(h.requests).toHaveBeenCalledTimes(1);
  expect(currentWording(h.latest, h.latest.roles[0].id)).toBeNull();
});
it("a never-started receipt offers explicit continuation with the original request ID", async () => {
  Object.defineProperty(crypto, "subtle", {
    configurable: true,
    value: webcrypto.subtle,
  });
  const d = fixture(),
    id = d.roles[0].id;
  d.experienceEnrichment = {
    [id]: {
      version: 1,
      pending: {
        id: crypto.randomUUID(),
        request: {
          intent: "questions",
          fingerprint: await experienceFingerprint(d, id),
        },
      },
    },
  };
  const h = harness(d, async (c, recover) => {
    if (recover) throw new IntelligenceRequestError("missing");
    return {
      schemaVersion: "experience-assistant/1",
      intent: "questions",
      targetId: id,
      fingerprint: c.experience.fingerprint,
      questions: [],
    };
  });
  await screen.findByRole("button", { name: "Continue request" });
  expect(h.requests.mock.calls[0][1]).toBe(true);
  const operationId = h.requests.mock.calls[0][0].operationId;
  fireEvent.click(screen.getByRole("button", { name: "Continue request" }));
  await waitFor(() => expect(h.requests).toHaveBeenCalledTimes(2));
  expect(h.requests.mock.calls[1][0].operationId).toBe(operationId);
  expect(h.requests.mock.calls[1][1]).toBe(false);
});
it("a slow advisory score never disables point editing or hides a completed suggestion", async () => {
  let complete!: (value: ExperienceResult) => void;
  const h = harness(fixture(), async (c) =>
    c.experience.intent === "score"
      ? await new Promise<ExperienceResult>((resolve) => {
          complete = resolve;
        })
      : {
          schemaVersion: "experience-assistant/1",
          intent: "point",
          targetId: c.targetId,
          fingerprint: c.experience.fingerprint,
          point: c.experience.point,
          text: "Prepared weekly SQL reports.",
          explanation: "Clarifies method.",
          factIds: ["source"],
        },
  );
  fireEvent.click(
    screen.getByRole("button", { name: /Prepared weekly reports\.\s*Edit/ }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Improve this point" }));
  await screen.findByRole("button", { name: "Use this" });
  expect(h.requests).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Use this" }));
  await waitFor(() => expect(h.requests).toHaveBeenCalledTimes(2));
  expect(
    (screen.getByRole("button", { name: "Add a point" }) as HTMLButtonElement)
      .disabled,
  ).toBe(false);
  expect(
    (
      screen.getByRole("button", {
        name: "Undo last update",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(false);
  const c = h.requests.mock.calls[1][0];
  complete({
    schemaVersion: "experience-assistant/1",
    targetId: c.targetId,
    fingerprint: c.experience.fingerprint,
    intent: "score",
    assessment: {
      rubric: "experience-detail/1",
      score: 0,
      dimensions: ["contribution", "methods", "scope", "outcome"].map(
        (dimension) => ({
          dimension: dimension as any,
          grade: "missing",
          evidence: [],
        }),
      ),
    },
  });
  await waitFor(() =>
    expect(
      h.latest.experienceEnrichment?.[h.latest.roles[0].id].scorePending,
    ).toBeUndefined(),
  );
});
it("a rejected score leaves applied wording and manual controls usable", async () => {
  const h = harness(fixture(), async () => {
    throw new IntelligenceRequestError("AI_OUTPUT_INVALID");
  });
  fireEvent.click(
    screen.getByRole("button", { name: /Prepared weekly reports\.\s*Edit/ }),
  );
  fireEvent.change(screen.getByLabelText("Your point"), {
    target: { value: "Prepared weekly SQL reports." },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save point" }));
  await screen.findByText(
    "The score couldn’t be updated. You can keep editing; your CV text is safe.",
  );
  expect(experienceText(h.latest, h.latest.roles[0].id)).toContain(
    "Prepared weekly SQL reports.",
  );
  expect(
    h.latest.experienceEnrichment?.[h.latest.roles[0].id].pending,
  ).toBeUndefined();
  expect(
    (screen.getByRole("button", { name: "Add a point" }) as HTMLButtonElement)
      .disabled,
  ).toBe(false);
});
it("a failed foreground request unlocks the original draft and permits an explicit retry", async () => {
  const h = harness(fixture(), async () => {
    throw new IntelligenceRequestError("AI_OUTPUT_INVALID");
  });
  fireEvent.click(
    screen.getByRole("button", { name: /Prepared weekly reports\.\s*Edit/ }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Improve this point" }));
  await screen.findByText(
    "We couldn’t prepare that suggestion. Your text is safe; edit it or try again.",
  );
  expect(
    (screen.getByLabelText("Your point") as HTMLTextAreaElement).disabled,
  ).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Improve this point" }));
  await waitFor(() => expect(h.requests).toHaveBeenCalledTimes(2));
  expect(h.requests.mock.calls[0][0].operationId).not.toBe(
    h.requests.mock.calls[1][0].operationId,
  );
});
it("refresh recovers a pending background score without issuing another POST or locking controls", async () => {
  Object.defineProperty(crypto, "subtle", {
    configurable: true,
    value: webcrypto.subtle,
  });
  const d = fixture(),
    id = d.roles[0].id;
  d.experienceEnrichment = {
    [id]: {
      version: 1,
      scorePending: {
        id: crypto.randomUUID(),
        request: {
          intent: "score",
          fingerprint: await experienceFingerprint(d, id),
        },
        body: experienceText(d, id),
      },
    },
  };
  const h = harness(d, async () => {
    throw new IntelligenceRequestError("AI_REQUEST_UNKNOWN");
  });
  await screen.findByRole("button", { name: "Check progress" });
  expect(h.requests.mock.calls[0][1]).toBe(true);
  expect(
    (screen.getByRole("button", { name: "Add a point" }) as HTMLButtonElement)
      .disabled,
  ).toBe(false);
});
it("a newer applied point wins over a late score for the previous wording", async () => {
  const finishes: Array<{ c: any; resolve: (v: ExperienceResult) => void }> =
    [];
  const h = harness(
    fixture(),
    async (c) =>
      new Promise<ExperienceResult>((resolve) => finishes.push({ c, resolve })),
  );
  fireEvent.click(
    screen.getByRole("button", { name: /Prepared weekly reports\.\s*Edit/ }),
  );
  fireEvent.change(screen.getByLabelText("Your point"), {
    target: { value: "First saved wording." },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save point" }));
  await waitFor(() => expect(finishes).toHaveLength(1));
  fireEvent.click(
    screen.getByRole("button", { name: /First saved wording\.\s*Edit/ }),
  );
  fireEvent.change(screen.getByLabelText("Your point"), {
    target: { value: "Latest saved wording." },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save point" }));
  const score = (c: any): ExperienceResult => ({
    schemaVersion: "experience-assistant/1",
    targetId: c.targetId,
    fingerprint: c.experience.fingerprint,
    intent: "score",
    assessment: {
      rubric: "experience-detail/1",
      score: 0,
      dimensions: ["contribution", "methods", "scope", "outcome"].map(
        (dimension) => ({
          dimension: dimension as any,
          grade: "missing",
          evidence: [],
        }),
      ),
    },
  });
  finishes[0].resolve(score(finishes[0].c));
  await waitFor(() => expect(finishes).toHaveLength(2));
  expect(
    h.latest.experienceEnrichment?.[h.latest.roles[0].id].assessment,
  ).toBeUndefined();
  finishes[1].resolve(score(finishes[1].c));
  await waitFor(() =>
    expect(
      h.latest.experienceEnrichment?.[h.latest.roles[0].id].assessment?.body,
    ).toContain("Latest saved wording."),
  );
});
it("automatic recovery is bounded and only reads the original receipt", async () => {
  Object.defineProperty(crypto, "subtle", {
    configurable: true,
    value: webcrypto.subtle,
  });
  const d = fixture(),
    id = d.roles[0].id;
  d.experienceEnrichment = {
    [id]: {
      version: 1,
      scorePending: {
        id: crypto.randomUUID(),
        request: {
          intent: "score",
          fingerprint: await experienceFingerprint(d, id),
        },
        body: experienceText(d, id),
      },
    },
  };
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  let h: ReturnType<typeof harness> | undefined;
  try {
    h = harness(d, async () => {
      throw new IntelligenceRequestError("AI_REQUEST_PENDING");
    });
    await act(async () => {});
    expect(h.requests).toHaveBeenCalledTimes(1);
    for (const delay of [1000, 2000, 4000, 8000, 12000, 8000])
      await act(async () => {
        await vi.advanceTimersByTimeAsync(delay);
      });
    expect(h.requests).toHaveBeenCalledTimes(7);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120000);
    });
    expect(h.requests).toHaveBeenCalledTimes(7);
    expect(h.requests.mock.calls.every((call) => call[1] === true)).toBe(true);
    expect(
      new Set(h.requests.mock.calls.map((call) => call[0].operationId)).size,
    ).toBe(1);
  } finally {
    h?.unmount();
    vi.useRealTimers();
  }
});
it("a recovered successful result clears its obsolete uncertainty message", async () => {
  const h = harness(fixture(), async (c, recover) => {
    if (!recover) throw new IntelligenceRequestError("AI_REQUEST_UNKNOWN");
    return {
      schemaVersion: "experience-assistant/1",
      intent: "point",
      targetId: c.targetId,
      fingerprint: c.experience.fingerprint,
      point: c.experience.point,
      text: "Prepared weekly SQL reports.",
      explanation: "Clarifies method.",
      factIds: ["source"],
    };
  });
  fireEvent.click(
    screen.getByRole("button", { name: /Prepared weekly reports\.\s*Edit/ }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Improve this point" }));
  await screen.findByRole("button", { name: "Check progress" });
  fireEvent.click(screen.getByRole("button", { name: "Check progress" }));
  await screen.findByRole("button", { name: "Use this" });
  expect(
    screen.queryByText(
      "We couldn’t confirm the result. Your text is safe. Check progress or continue editing your CV.",
    ),
  ).toBeNull();
  expect(h.requests).toHaveBeenCalledTimes(2);
  expect(h.requests.mock.calls[1][1]).toBe(true);
});
it("a missing-detail response opens one coaching question and applies only the confirmed proposal", async () => {
  const d = fixture();
  d.roles[0].context = fact("x");
  let count = 0;
  const h = harness(d, async (c) => {
    count++;
    return {
      schemaVersion: "experience-assistant/1",
      targetId: c.targetId,
      fingerprint: c.experience.fingerprint,
      intent: "point",
      point: c.experience.point,
      ...(count === 1
        ? {
            text: "",
            explanation: "",
            factIds: [],
            needsDetails: "What task did you handle?",
          }
        : {
            text: "Prepared reports using SQL.",
            explanation: "Names your activity and tool.",
            factIds: [h.latest.answers[0].id],
          }),
    };
  });
  fireEvent.click(screen.getByRole("button", { name: /^x\s*Edit$/ }));
  expect(
    screen.getByText("Describe a task you handled. A few words are enough."),
  ).toBeDefined();
  fireEvent.click(screen.getByRole("button", { name: "Improve this point" }));
  await screen.findByRole("textbox", { name: "What task did you handle?" });
  expect(screen.queryByRole("button", { name: "Use this" })).toBeNull();
  expect(experienceText(h.latest, d.roles[0].id)).toContain("x");
  fireEvent.change(screen.getByLabelText("What task did you handle?"), {
    target: { value: "Prepared reports using SQL." },
  });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  fireEvent.click(screen.getByRole("button", { name: "Show me the point" }));
  await screen.findByRole("button", { name: "Use this" });
  expect(h.latest.answers[0].status).toBe("confirmed");
  expect(experienceText(h.latest, d.roles[0].id)).toContain("x");
});
it("score rechecks show immediate activity, preserve manual editing, and confirm an unchanged result", async () => {
  const d = fixture(),
    id = d.roles[0].id,
    body = experienceText(d, id);
  const points = experiencePoints(body).map((point, index) => {
    const p = {
      point,
      meaningful: true,
      contribution: "specific" as const,
      clarity: "specific" as const,
      specificity: "partial" as const,
      issue: "specificity" as const,
    };
    return {
      ...p,
      id: `p${index}`,
      duplicateOf: null,
      strength: null,
      improvement: null,
      suggestedQuestion: null,
      score: pointQualityScore(p),
    };
  });
  const value = {
    rubric: "experience-quality/3" as const,
    feedbackLocale: "en" as const,
    scope: "complete" as const,
    experience: null,
    policyVersion: experiencePolicy.version,
    points,
    dimensions: ["contribution", "methods", "scope", "outcome"].map(
      (dimension) => ({
        dimension: dimension as any,
        grade: "missing" as const,
        evidence: [],
      }),
    ),
    score: experienceQualityScore(points),
  };
  d.experienceEnrichment = {
    [id]: {
      version: 1,
      assessment: {
        body,
        fingerprint: await experienceFingerprint(d, id),
        value,
      },
    },
  };
  let finish!: (v: ExperienceResult) => void, context: any;
  const h = harness(d, async (c) => {
    context = c;
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  fireEvent.click(screen.getByRole("button", { name: "Check again" }));
  expect(
    (
      (await screen.findByRole("button", {
        name: "Checking experience…",
      })) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  expect(
    screen.getByText("Previous score — checking is in progress."),
  ).toBeDefined();
  expect(
    (screen.getByRole("button", { name: "Add a point" }) as HTMLButtonElement)
      .disabled,
  ).toBe(false);
  await waitFor(() => expect(h.requests).toHaveBeenCalledTimes(1));
  await act(async () =>
    finish({
      schemaVersion: "experience-assistant/1",
      targetId: id,
      fingerprint: context.experience.fingerprint,
      intent: "score",
      assessment: value,
    }),
  );
  await screen.findByText("Checked just now · score unchanged");
  expect(
    (screen.getByRole("button", { name: "Check again" }) as HTMLButtonElement)
      .disabled,
  ).toBe(false);
});
it("keeps a stale point proposal as history after correction without presenting its English wording", async () => {
  const d = fixture(),
    id = d.roles[0].id;
  d.experienceEnrichment = {
    [id]: {
      version: 1,
      proposal: {
        schemaVersion: "experience-assistant/1",
        targetId: id,
        fingerprint: "a".repeat(64),
        intent: "point",
        text: "Stale English proposal",
        explanation: "Stale English explanation",
        factIds: [],
      },
    },
  };
  d.language = "fr";
  d.documentLocale = "fr";
  d.contentLanguage = {
    locale: "fr",
    confidence: "high",
    source: "user-correction",
    policyVersion: "cv-language/1",
  };
  const h = harness(d);
  await act(async () => {});
  expect(screen.queryByText("Stale English proposal")).toBeNull();
  expect(screen.queryByText("Stale English explanation")).toBeNull();
  expect(h.latest.experienceEnrichment![id].proposal?.text).toBe(
    "Stale English proposal",
  );
});
