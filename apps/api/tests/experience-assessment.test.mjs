import test from "node:test";
import assert from "node:assert/strict";
import { blankDraft, newRole, fact } from "@resumora/contracts/editor/model";
import { encodeDraft, decodeDraft } from "@resumora/contracts/editor/transport";
import {
  experienceFingerprint,
  experienceScoreIdentity,
  experienceScoreOperationId,
  isAssessment,
  currentExperienceAssessment,
} from "@resumora/contracts/intelligence/experience";
import { experienceAssessmentPrompt } from "@resumora/contracts/intelligence/experience-assessment-prompt";
import { intelligenceOperations } from "../src/intelligence/operations.ts";

const market =
  "Supported Romanian market-entry planning through partner outreach.";
function draft(texts = [market]) {
  const d = blankDraft(),
    r = newRole();
  d.language = "en";
  d.documentLocale = "en";
  r.title = fact("Global Market Developer");
  r.context = fact(texts[0]);
  r.bullets = texts.slice(1).map(fact);
  d.roles = [r];
  return { d, r };
}
const observation = (id) => ({
  status: "clear",
  strength: "The activity is understandable.",
  improvement: null,
  evidencePointIds: [id],
});
function output(call, strong = false) {
  const points = call.input.points.map((p) => ({
    id: p.id,
    meaningful: true,
    contribution: strong ? "specific" : "partial",
    clarity: "specific",
    specificity: strong ? "specific" : "partial",
    issue: strong ? "none" : "contribution",
    duplicateOf: null,
    strength:
      call.input.locale === "ro"
        ? "Precizează piața și scopul activității."
        : "Identifies the market and purpose.",
    improvement: strong
      ? null
      : call.input.locale === "ro"
        ? "Nu este clar ce ai făcut personal."
        : "Your personal involvement is unclear.",
    suggestedQuestion: strong
      ? null
      : call.input.locale === "ro"
        ? "Ce ai făcut personal în contactarea partenerilor?"
        : "What did you personally do during the partner outreach?",
  }));
  return {
    points,
    dimensions: ["contribution", "methods", "scope", "outcome"].map(
      (dimension, i) => ({
        dimension,
        grade: i === 0 ? "specific" : "missing",
        evidencePointIds: i === 0 ? [points[0].id] : [],
      }),
    ),
    experience:
      call.input.scope === "partial"
        ? null
        : {
            distinctiveness:
              points.length > 1
                ? observation(points[0].id)
                : {
                    status: "insufficient_context",
                    strength: null,
                    improvement: null,
                    evidencePointIds: [],
                  },
            professionalValue: observation(points[0].id),
            coherence: observation(points[0].id),
            priorityPointId: strong ? null : points[0].id,
          },
  };
}
async function assess(f, runner, locale = "ro") {
  return intelligenceOperations(runner).experience({
    operationId: crypto.randomUUID(),
    userId: crypto.randomUUID(),
    draft: f.d,
    targetId: f.r.id,
    request: {
      intent: "score",
      feedbackLocale: locale,
      fingerprint: await experienceFingerprint(f.d, f.r.id),
    },
  });
}
test("approved prompt, minimal input and diagnostic schema travel together; English CV retains English feedback despite Romanian client override and earns 65", async () => {
  const f = draft();
  f.d.answers.push({
    id: "private",
    targetId: f.r.id,
    question: "impact",
    text: "Private answer",
    questionText: "Outcome?",
    status: "confirmed",
    sourceId: "manual",
  });
  let calls = 0;
  const result = await assess(f, async (c) => {
    calls++;
    assert.ok(c.system.endsWith(experienceAssessmentPrompt));
    assert.ok(c.system.includes("(en)"));
    assert.equal(c.promptVersion, "experience-score/5");
    assert.deepEqual(Object.keys(c.input).sort(), [
      "documentLocale",
      "locale",
      "points",
      "role",
      "scope",
    ]);
    assert.equal(c.input.locale, "en");
    assert.equal(c.input.documentLocale, "en");
    assert.deepEqual(c.input.points, [{ id: "p0", text: market }]);
    assert.ok(!JSON.stringify(c.input).includes("Private answer"));
    assert.ok(
      c.schema.properties.points.items.required.includes("suggestedQuestion"),
    );
    assert.equal(c.maxOutputTokens, 1250);
    const raw = output(c);
    assert.deepEqual(c.validateOutput(raw), raw);
    return raw;
  });
  assert.equal(calls, 1);
  assert.equal(result.assessment.score, 65);
  assert.equal(result.assessment.feedbackLocale, "en");
  assert.equal(
    result.assessment.points[0].suggestedQuestion,
    "What did you personally do during the partner outreach?",
  );
  assert.equal(
    result.assessment.experience.distinctiveness.status,
    "insufficient_context",
  );
  assert.ok(isAssessment(result.assessment));
  f.d.experienceEnrichment = {
    [f.r.id]: {
      version: 1,
      assessment: {
        body: market,
        fingerprint: result.fingerprint,
        value: result.assessment,
      },
    },
  };
  const decoded = decodeDraft(encodeDraft(f.d));
  assert.ok(currentExperienceAssessment(decoded, f.r.id));
  assert.equal(currentExperienceAssessment(decoded, f.r.id, "ro"), undefined);
});
test("concise responsibilities need no metrics, tools, outcomes or extra questions", async () => {
  const result = await assess(
    draft([
      "Prepared employment contracts for temporary workers.",
      "Coordinated onboarding documentation between recruiters and payroll teams.",
    ]),
    async (c) => output(c, true),
    "en",
  );
  assert.equal(result.assessment.score, 100);
  assert.ok(
    result.assessment.points.every(
      (p) =>
        p.issue === "none" &&
        p.improvement === null &&
        p.suggestedQuestion === null,
    ),
  );
  assert.equal(
    result.assessment.dimensions.find((d) => d.dimension === "outcome").grade,
    "missing",
  );
  assert.equal(result.assessment.experience.priorityPointId, null);
});
test("partial chunks cannot claim a whole-experience review and preserve all distinct responsibilities", async () => {
  let calls = 0;
  const f = draft(
    Array.from(
      { length: 15 },
      (_, i) => `Prepared document ${i} for the team.`,
    ),
  );
  const result = await assess(f, async (c) => {
    calls++;
    assert.equal(c.input.scope, "partial");
    assert.deepEqual(c.schema.properties.experience, { type: "null" });
    return output(c, true);
  });
  assert.equal(calls, 2);
  assert.equal(result.assessment.scope, "partial");
  assert.equal(result.assessment.experience, null);
  assert.equal(result.assessment.points.length, 15);
  assert.equal(result.assessment.score, 100);
});
test("bad advisory text falls back without losing valid grades or buying a repair request", async () => {
  let calls = 0;
  const result = await assess(draft(), async (c) => {
    calls++;
    const v = output(c);
    v.points[0].strength = "x".repeat(241);
    v.points[0].suggestedQuestion = "What did you do? With which tool?";
    v.experience.coherence.evidencePointIds = ["foreign"];
    return v;
  });
  assert.equal(calls, 1);
  assert.equal(result.assessment.score, 65);
  assert.equal(result.assessment.points[0].strength, null);
  assert.equal(result.assessment.points[0].suggestedQuestion, null);
  assert.equal(result.assessment.experience, null);
});
test("foreign, incomplete, self-duplicate and invalid-grade results never produce invented scores", async () => {
  for (const change of [
    (v) => (v.points[0].id = "foreign"),
    (v) => (v.points = []),
    (v) => (v.points[0].clarity = "excellent"),
    (v) => {
      v.points[0].issue = "duplicate";
      v.points[0].duplicateOf = "p0";
    },
    (v) => (v.dimensions[0].evidencePointIds = ["foreign"]),
    (v) => (v.dimensions[1].dimension = "contribution"),
  ]) {
    await assert.rejects(
      assess(draft(), async (c) => {
        const v = output(c);
        change(v);
        return v;
      }),
      /EXPERIENCE_SCORE|AI_OUTPUT_INVALID/,
    );
  }
});
test("a sufficient point cannot acquire manufactured coaching advice", async () => {
  const result = await assess(draft(), async (c) => {
    const v = output(c, true);
    v.points[0].issue = "methods";
    v.points[0].improvement = "Add a tool.";
    v.points[0].suggestedQuestion = "Which tool did you use?";
    return v;
  });
  assert.equal(result.assessment.score, 100);
  assert.equal(result.assessment.points[0].issue, "none");
  assert.equal(result.assessment.points[0].improvement, null);
  assert.equal(result.assessment.points[0].suggestedQuestion, null);
});
test("contribution takes priority over clarity without contradictory diagnostic text", async () => {
  const result = await assess(draft(), async (c) => {
    const v = output(c);
    v.points[0].clarity = "partial";
    v.points[0].issue = "clarity";
    v.points[0].improvement = "Use shorter wording.";
    return v;
  });
  assert.equal(result.assessment.points[0].issue, "contribution");
  assert.equal(result.assessment.points[0].improvement, null);
  assert.equal(result.assessment.score, 50);
});
test("exact repeats across chunks receive zero and a reference; distinct related work stays useful", async () => {
  const texts = Array.from(
    { length: 13 },
    (_, i) => `Prepared contract type ${i} for temporary workers.`,
  );
  texts.push(texts[0]);
  const result = await assess(draft(texts), async (c) => output(c, true));
  const last = result.assessment.points.at(-1);
  assert.equal(last.issue, "duplicate");
  assert.equal(last.duplicateOf, "p0");
  assert.equal(last.score, 0);
  assert.equal(last.suggestedQuestion, null);
  assert.equal(result.assessment.points[1].score, 100);
  assert.ok(isAssessment(result.assessment));
});
test("feedback languages have distinct receipt identities without altering CV facts", async () => {
  const { d, r } = draft();
  assert.notEqual(
    experienceScoreIdentity(d, r.id, "ro"),
    experienceScoreIdentity(d, r.id, "en"),
  );
  assert.notEqual(
    await experienceScoreOperationId(d, r.id, 0, "ro"),
    await experienceScoreOperationId(d, r.id, 0, "en"),
  );
  assert.equal(d.roles[0].context.value, market);
});

test("unusable wording keeps its useful initial question while receiving zero", async () => {
  const result = await assess(draft(["TBD"]), async (c) => {
    const v = output(c);
    Object.assign(v.points[0], {
      meaningful: false,
      contribution: "missing",
      clarity: "missing",
      specificity: "missing",
      issue: "example",
      strength: null,
      improvement: "Descrie o activitate reală din acest rol.",
      suggestedQuestion: "De ce activitate te ocupai în acest rol?",
    });
    v.dimensions = v.dimensions.map((d) => ({
      ...d,
      grade: "missing",
      evidencePointIds: [],
    }));
    v.experience = null;
    return v;
  });
  assert.equal(result.assessment.score, 0);
  assert.equal(
    result.assessment.points[0].suggestedQuestion,
    "De ce activitate te ocupai în acest rol?",
  );
  assert.ok(isAssessment(result.assessment));
});
