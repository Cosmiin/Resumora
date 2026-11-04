import test from "node:test";
import assert from "node:assert/strict";
import { blankDraft, newRole, fact } from "@resumora/contracts/editor/model";
import { encodeDraft, decodeDraft } from "@resumora/contracts/editor/transport";
import {
  experienceText,
  experiencePoints,
  experienceFingerprint,
  replaceExperiencePoint,
  detailScore,
  isExperienceResult,
  isAssessment,
  pointQualityScore,
  experienceQualityScore,
} from "@resumora/contracts/intelligence/experience";
import { selfContainedDocumentDraft } from "@resumora/contracts/editor/document";
import { experiencePolicy } from "@resumora/contracts/intelligence/experience-policy";
import { intelligenceOperations } from "../src/intelligence/operations.ts";
import { intelligenceRoute } from "../src/intelligence/routes.ts";
function fixture() {
  const d = blankDraft(),
    r = newRole();
  d.language = "en";
  r.title = fact("Analyst");
  r.context = fact("Prepared weekly reports.");
  r.bullets = [
    fact("Maintained SQL queries."),
    fact("Checked source records."),
  ];
  d.roles = [r];
  return { d, r };
}
async function input(d, r, intent = "point") {
  return {
    operationId: crypto.randomUUID(),
    userId: crypto.randomUUID(),
    draft: d,
    targetId: r.id,
    request: {
      intent,
      fingerprint: await experienceFingerprint(d, r.id),
      ...(intent === "point" || intent === "questions"
        ? { point: experiencePoints(experienceText(d, r.id))[1] }
        : {}),
    },
  };
}
const grades = (text) =>
  ["contribution", "methods", "scope", "outcome"].map((dimension, i) => ({
    dimension,
    grade: i < 2 ? "specific" : "missing",
    evidence: i < 2 ? [text] : [],
  }));
const selectedGrades = (call) =>
  grades(call.input.points[0].id).map(({ evidence, ...g }) => ({
    ...g,
    evidencePointIds: evidence,
  }));
const selectedPoints = (call) =>
  call.input.points.map((p) => ({
    id: p.id,
    meaningful: true,
    contribution: "specific",
    clarity: "partial",
    specificity: "partial",
    issue: "clarity",
    duplicateOf: null,
    strength: "Names a work activity.",
    improvement: "Clarify the wording.",
    suggestedQuestion: null,
  }));
const scoreOutput = (call) => ({
  dimensions: selectedGrades(call),
  points: selectedPoints(call),
  experience: null,
});
test("raw point replacement preserves surrounding bytes and markers, rejects moved anchors", () => {
  const body =
    "An introduction.\n\n1. Built reports\n   for the team.\n2. Checked records.\n\nFinal paragraph.";
  const points = experiencePoints(body);
  assert.equal(points.length, 4);
  assert.equal(points[1].text, "Built reports\n   for the team.");
  assert.equal(
    replaceExperiencePoint(body, points[1], "Built weekly reports."),
    "An introduction.\n\n1. Built weekly reports.\n2. Checked records.\n\nFinal paragraph.",
  );
  assert.throws(
    () => replaceExperiencePoint("Changed " + body, points[1], "A point."),
    /STALE/,
  );
  assert.equal(
    replaceExperiencePoint("1. One.\n2. Two.", undefined, "Three."),
    "1. One.\n2. Two.\n\n3. Three.",
  );
});
test("metadata is optional, roundtrips strictly, stays out of job copies", () => {
  const { d, r } = fixture();
  assert.deepEqual(decodeDraft(encodeDraft(d)), d);
  d.experienceEnrichment = {
    [r.id]: {
      version: 1,
      editor: {
        baseText: experienceText(d, r.id),
        text: "Draft text",
        mode: "edit",
        point: experiencePoints(experienceText(d, r.id))[0],
      },
    },
  };
  assert.deepEqual(decodeDraft(encodeDraft(d)), d);
  assert.equal(selfContainedDocumentDraft(d).experienceEnrichment, undefined);
  for (const bad of [
    { version: 2 },
    { version: 1, secret: "no" },
    {
      version: 1,
      pending: { id: "x", request: { intent: "point", fingerprint: "wrong" } },
    },
  ]) {
    d.experienceEnrichment[r.id] = bad;
    assert.throws(() => decodeDraft(encodeDraft(d)), /invalidEditorDraft/);
  }
});
test("point request is grounded, scoped and does not mutate evidence", async () => {
  const { d, r } = fixture(),
    before = structuredClone(d),
    calls = [];
  const ops = intelligenceOperations(async (call) => {
    calls.push(call);
    if (call.promptVersion === experiencePolicy.version)
      return scoreOutput(call);
    return {
      text: "Maintained SQL reporting queries.",
      explanation: "Names the method clearly.",
      factIds: [call.input.facts.find((f) => f.text.includes("SQL")).id],
    };
  });
  const result = await ops.experience(await input(d, r));
  assert.equal(result.intent, "point");
  assert.equal(result.point.text, "Maintained SQL queries.");
  assert.deepEqual(d, before);
  assert.match(calls[0].system, /ONE replacement/);
  assert.equal(calls[0].tier, "career");
  assert.ok(calls[0].input.facts.length <= 24);
  assert.ok(isExperienceResult(result));
});
test("inventions, multiline proposals, foreign citations and stale points are rejected", async () => {
  const { d, r } = fixture(),
    args = await input(d, r);
  for (const output of [
    (f) => ({
      text: "Improved revenue by 90%.",
      explanation: "Clearer.",
      factIds: [f[0].id],
    }),
    (f) => ({ text: "One\nTwo", explanation: "Clearer.", factIds: [f[0].id] }),
    () => ({ text: "A point.", explanation: "Clearer.", factIds: ["foreign"] }),
  ]) {
    const ops = intelligenceOperations(async (c) => output(c.input.facts));
    await assert.rejects(ops.experience(args), /AI_OUTPUT_INVALID/);
  }
  let calls = 0;
  const ops = intelligenceOperations(async () => {
    calls++;
    return {};
  });
  r.context.value = "Changed";
  await assert.rejects(ops.experience(args), /STALE_INPUT/);
  assert.equal(calls, 0);
});
test("questions allow none, suppress exact repeats and never carry hypothetical options", async () => {
  const { d, r } = fixture();
  d.answers.push({
    id: "old",
    targetId: r.id,
    question: "tools",
    questionText: "What did you use?",
    text: "SQL",
    status: "confirmed",
    sourceId: "manual",
  });
  const ops = intelligenceOperations(async () => ({
    questions: [{ dimension: "tools", text: "What did you use?" }],
  }));
  const result = await ops.experience(await input(d, r, "questions"));
  assert.deepEqual(result.questions, []);
  const empty = intelligenceOperations(async () => ({ questions: [] }));
  assert.deepEqual(
    (await empty.experience(await input(d, r, "questions"))).questions,
    [],
  );
});
test("score uses only applied text, validates evidence and aggregates without repetition bonus", async () => {
  const { d, r } = fixture();
  d.answers.push({
    id: "private-answer",
    targetId: r.id,
    question: "impact",
    questionText: "Outcome?",
    text: "SECRET ANSWER",
    status: "confirmed",
    sourceId: "manual",
  });
  let calls = 0;
  const ops = intelligenceOperations(async (call) => {
    calls++;
    assert.equal(call.input.facts, undefined);
    assert.ok(!JSON.stringify(call.input).includes("SECRET ANSWER"));
    return scoreOutput(call);
  });
  const result = await ops.experience(await input(d, r, "score"));
  assert.equal(result.assessment.score, 70);
  assert.equal(calls, 1);
  assert.equal(detailScore(grades("a")), 50);
  const bad = intelligenceOperations(async (c) => ({
    experience: null,
    points: selectedPoints(c),
    dimensions: grades("invented-id").map(({ evidence, ...g }) => ({
      ...g,
      evidencePointIds: evidence,
    })),
  }));
  await assert.rejects(
    bad.experience(await input(d, r, "score")),
    /EXPERIENCE_SCORE_EVIDENCE/,
  );
});
test("score resolves passage references to original Unicode and multiline wording without model transcription", async () => {
  const { d, r } = fixture();
  d.documentLocale = "ro";
  r.context = fact(
    "Am coordonat verificările „end-to-end” pentru 5–6 echipe.\nAm folosit SQL și Excel; durata a scăzut cu 20%.",
  );
  r.bullets = [];
  const body = experienceText(d, r.id);
  let calls = 0;
  const ops = intelligenceOperations(async (c) => {
    calls++;
    assert.equal(c.promptVersion, experiencePolicy.version);
    assert.equal(c.input.text, undefined);
    assert.ok(c.input.points.every((p) => body.includes(p.text)));
    assert.deepEqual(
      c.schema.properties.dimensions.items.properties.evidencePointIds.items
        .enum,
      c.input.points.map((p) => p.id),
    );
    const value = scoreOutput(c);
    assert.deepEqual(c.validateOutput(value), value);
    return value;
  });
  const result = await ops.experience(await input(d, r, "score"));
  assert.equal(calls, 1);
  assert.equal(result.assessment.score, 70);
  assert.ok(body.includes(result.assessment.dimensions[0].evidence[0]));
  assert.ok(body.includes(result.assessment.dimensions[1].evidence[0]));
  assert.ok(isExperienceResult(result));
  assert.ok(!JSON.stringify(result).includes("evidencePointIds"));
});
test("score rejects unknown references, unsupported grades and incomplete dimensions instead of inventing a score", async () => {
  const { d, r } = fixture();
  for (const change of [
    (g) => (g[0].evidencePointIds = ["foreign"]),
    (g) => (g[0].evidencePointIds = ["p999"]),
    (g) => (g[0].grade = "excellent"),
    (g) => g.pop(),
    (g) => (g[1].dimension = g[0].dimension),
    (g) => (g[0].evidencePointIds = []),
    (g) => (g[2].evidencePointIds = ["p1"]),
    (g) => (g[0].evidence = "fabricated quote"),
  ]) {
    const ops = intelligenceOperations(async (c) => {
      const dimensions = selectedGrades(c);
      change(dimensions);
      const value = { dimensions, points: selectedPoints(c), experience: null };
      assert.throws(() => c.validateOutput(value));
      return value;
    });
    await assert.rejects(
      ops.experience(await input(d, r, "score")),
      /EXPERIENCE_SCORE|AI_OUTPUT_INVALID/,
    );
  }
});
test("long roles are chunked for skills and score; per-point fact context stays bounded", async () => {
  const { d, r } = fixture();
  r.bullets = Array.from({ length: 30 }, (_, i) =>
    fact(`SQL report ${i}: ` + "x".repeat(340)),
  );
  const seen = [];
  const ops = intelligenceOperations(async (c) => {
    seen.push(c);
    if (c.promptVersion === "experience-skills/4") return { skills: [] };
    if (c.promptVersion === experiencePolicy.version) return scoreOutput(c);
    return {
      text: "Maintained SQL queries.",
      explanation: "Clearer.",
      factIds: [c.input.facts[0].id],
    };
  });
  await ops.experience(await input(d, r, "skills"));
  assert.ok(seen.length > 1);
  for (const c of seen) {
    assert.ok(c.input.facts.length <= 24);
    assert.ok(c.input.facts.reduce((n, f) => n + f.text.length, 0) <= 8000);
  }
  seen.length = 0;
  await ops.experience(await input(d, r, "score"));
  assert.ok(seen.length > 1);
  for (const c of seen) {
    assert.ok(c.input.points.reduce((n, p) => n + p.text.length, 0) <= 7800);
    for (const p of c.input.points) {
      assert.ok(p.text.length <= 6000);
      assert.ok(experienceText(d, r.id).includes(p.text));
    }
  }
});
test("skills deduplicate across categories without requiring references", async () => {
  const { d, r } = fixture();
  d.technicalSkills = [fact(" sql ")];
  const ops = intelligenceOperations(async (c) => ({
    skills: [
      { label: "SQL", category: "technicalSkills", importance: "core" },
      {
        label: "Query maintenance",
        category: "professionalSkills",
        importance: "core",
      },
    ],
  }));
  assert.deepEqual(
    (await ops.experience(await input(d, r, "skills"))).skills.map(
      (s) => s.label,
    ),
    ["Query maintenance"],
  );
  const bad = intelligenceOperations(async (c) => ({
    skills: [
      {
        label: "Python",
        category: "technicalSkills",
        basis: "inferred",
        importance: "core",
        rationale: "The documented activity demonstrates this skill.",
        evidence: "Used Python",
        factIds: [c.input.facts[0].id],
      },
    ],
  }));
  await assert.rejects(
    bad.experience(await input(d, r, "skills")),
    /AI_OUTPUT_INVALID/,
  );
});
test("owned snapshot, input identity and intent checked before provider; ready receipt replays once", async () => {
  const { d, r } = fixture(),
    snapshot = {
      id: crypto.randomUUID(),
      revision: 1,
      payload: encodeDraft(d),
    },
    receipts = new Map();
  let calls = 0,
    reserves = 0;
  const options = {
    enabled: true,
    userId: crypto.randomUUID(),
    gateway: {
      loadSnapshot: async (id) => (id === snapshot.id ? snapshot : null),
      loadDraft: async () => snapshot,
      reserveCareer: async () => {
        reserves++;
        return true;
      },
      getWorkspaceOperation: async (id) => receipts.get(id),
      beginWorkspaceOperation: async (id, kind, input) => {
        receipts.set(id, { id, kind, input, state: "processing" });
        return { created: true };
      },
      finishWorkspaceOperation: async (id, state, result) =>
        receipts.set(id, { ...receipts.get(id), state, result }),
    },
    operations: {
      experience: async (c) => {
        calls++;
        return {
          schemaVersion: "experience-assistant/1",
          targetId: r.id,
          fingerprint: c.request.fingerprint,
          intent: "questions",
          questions: [],
        };
      },
    },
  };
  const body = {
    snapshotId: snapshot.id,
    revision: 1,
    targetId: r.id,
    operationId: crypto.randomUUID(),
    experience: (await input(d, r, "questions")).request,
  };
  const post = async (b) =>
    intelligenceRoute(
      new Request("https://app.invalid/v1/intelligence/experience", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(b),
      }),
      options,
    );
  assert.equal((await post(body)).status, 200);
  assert.equal((await post(body)).status, 200);
  assert.equal(calls, 1);
  assert.equal(reserves, 1);
  assert.equal(
    (
      await post({
        ...body,
        experience: { ...body.experience, intent: "point" },
      })
    ).status,
    409,
  );
  assert.equal(calls, 1);
  assert.equal(
    (await post({ ...body, snapshotId: crypto.randomUUID() })).status,
    404,
  );
  assert.equal(
    (
      await post({
        ...body,
        experience: { ...body.experience, fingerprint: "0".repeat(64) },
      })
    ).status,
    409,
  );
  assert.equal(calls, 1);
  assert.equal(
    (await post({ ...body, experience: { ...body.experience, secret: "bad" } }))
      .status,
    400,
  );
});
test("quality averages every point across chunks while coverage remains a separate ceiling", async () => {
  const { d, r } = fixture();
  r.context = fact("Built SQL reports.");
  r.bullets = Array.from({ length: 30 }, (_, i) =>
    fact(`Prepared report ${i}. ` + "context ".repeat(45)),
  );
  const ops = intelligenceOperations(async (c) => scoreOutput(c));
  const scored = await ops.experience(await input(d, r, "score"));
  assert.equal(scored.assessment.score, 70);
  assert.equal(scored.assessment.points.length, 31);
  assert.equal(detailScore(scored.assessment.dimensions), 50);
  const lower = intelligenceOperations(async (c) => ({
    ...scoreOutput(c),
    points: selectedPoints(c).map((p) => ({
      ...p,
      contribution: "partial",
      clarity: "missing",
      specificity: "missing",
    })),
  }));
  r.context = fact("Reports.");
  r.bullets = [];
  assert.equal(
    (await lower.experience(await input(d, r, "score"))).assessment.score,
    20,
  );
});
test("a missing role or oversized selected point is rejected before generation", async () => {
  const { d, r } = fixture();
  let calls = 0;
  const ops = intelligenceOperations(async () => {
    calls++;
    return {};
  });
  const args = await input(d, r);
  await assert.rejects(
    ops.experience({ ...args, targetId: "foreign-role" }),
    (e) => e.code === "INVALID_TARGET" && e.status === 422,
  );
  r.context = fact("x".repeat(3000));
  const large = {
    ...(await input(d, r)),
    request: {
      intent: "point",
      fingerprint: await experienceFingerprint(d, r.id),
      point: experiencePoints(experienceText(d, r.id))[0],
    },
  };
  await assert.rejects(
    ops.experience(large),
    (e) => e.code === "INVALID_POINT" && e.status === 422,
  );
  assert.equal(calls, 0);
});
test("reported seven-point placeholder example earns 11, even when the model tries to award placeholders full marks", async () => {
  const { d, r } = fixture();
  r.context = fact("x");
  r.bullets = [
    "x",
    "x",
    "x",
    "Restructured data and configurable workflows as volumes grew; sites adopted consistent procedures.",
    "dasda asdas",
    "N-am făcut nimic special.",
  ].map(fact);
  const ops = intelligenceOperations(async (c) => ({
    ...scoreOutput(c),
    points: selectedPoints(c).map((p) => ({
      ...p,
      contribution: "partial",
      clarity: "specific",
      specificity: "specific",
      issue: "contribution",
    })),
  }));
  const result = await ops.experience(await input(d, r, "score"));
  assert.equal(result.assessment.rubric, "experience-quality/3");
  assert.equal(result.assessment.points.length, 7);
  assert.equal(result.assessment.score, 11);
  assert.equal(result.assessment.points.filter((p) => p.score === 0).length, 6);
  assert.equal(result.assessment.points[4].score, 80);
  assert.ok(result.assessment.dimensions.every((g) => g.grade === "missing"));
  assert.ok(isAssessment(result.assessment));
  d.experienceEnrichment = {
    [r.id]: {
      version: 1,
      assessment: {
        body: experienceText(d, r.id),
        fingerprint: await experienceFingerprint(d, r.id),
        value: result.assessment,
      },
    },
  };
  assert.deepEqual(decodeDraft(encodeDraft(d)), d);
  const forged = structuredClone(result.assessment);
  forged.score = 100;
  assert.equal(isAssessment(forged), false);
});
test("all placeholders earn zero and repeated points lower quality across chunks", async () => {
  const { d, r } = fixture();
  r.context = fact("x");
  r.bullets = [fact("dasda asdas")];
  const ops = intelligenceOperations(async (c) => scoreOutput(c));
  assert.equal(
    (await ops.experience(await input(d, r, "score"))).assessment.score,
    0,
  );
  r.context = fact("Prepared weekly reports for department leads.");
  r.bullets = Array.from({ length: 27 }, () => fact(r.context.value));
  const scored = (await ops.experience(await input(d, r, "score"))).assessment;
  assert.equal(scored.points.filter((p) => p.issue === "duplicate").length, 27);
  assert.equal(scored.score, 3);
});
test("placeholder improvement asks for facts without inference, then uses confirmed answers for the selected point", async () => {
  const { d, r } = fixture();
  r.context = fact("x");
  r.bullets = [];
  let calls = 0;
  const ops = intelligenceOperations(async (c) => {
    calls++;
    return {
      text: "Prepared reports using SQL.",
      explanation: "Names the method.",
      factIds: [c.input.facts.find((f) => f.text.includes("SQL")).id],
    };
  });
  const args = await input(d, r);
  args.request.point = experiencePoints(experienceText(d, r.id))[0];
  const response = await ops.experience(args);
  assert.equal(response.intent, "point");
  assert.ok(response.needsDetails);
  assert.equal(response.text, "");
  assert.equal(calls, 0);
  assert.ok(isExperienceResult(response));
  d.answers = [
    {
      id: "a1",
      targetId: r.id,
      question: "ownership",
      questionText: response.needsDetails,
      text: "Prepared reports using SQL.",
      status: "confirmed",
      sourceId: "manual",
    },
  ];
  d.experienceEnrichment = {
    [r.id]: {
      version: 1,
      round: {
        id: "round",
        fingerprint: args.request.fingerprint,
        point: args.request.point,
        questions: [
          { id: "q", dimension: "ownership", text: response.needsDetails },
        ],
        answerIds: ["a1"],
      },
    },
  };
  const updated = await input(d, r);
  updated.request.point = args.request.point;
  const rewritten = await ops.experience(updated);
  assert.equal(rewritten.text, "Prepared reports using SQL.");
  assert.equal(calls, 1);
});
test("assessment is focused; writing and discovery reuse a current diagnosis only", async () => {
  const { experienceWritingRubric, experienceAtsGuidance } =
    await import("@resumora/contracts/intelligence/experience-rubric");
  const { d, r } = fixture();
  const seen = [];
  const ops = intelligenceOperations(async (c) => {
    seen.push(c);
    if (c.promptVersion === experiencePolicy.version) {
      assert.ok(c.system.includes("RECRUITER COMPREHENSION TEST"));
      return scoreOutput(c);
    }
    assert.ok(c.system.includes(experienceWritingRubric));
    assert.ok(c.system.includes(experienceAtsGuidance));
    if (c.promptVersion.startsWith("experience-questions/"))
      return { questions: [] };
    return {
      text: "Maintained SQL queries.",
      explanation: "Clear.",
      factIds: [c.input.facts.find((f) => f.text.includes("SQL")).id],
    };
  });
  const assessment = (await ops.experience(await input(d, r, "score")))
    .assessment;
  d.experienceEnrichment = {
    [r.id]: {
      version: 1,
      assessment: {
        body: experienceText(d, r.id),
        fingerprint: await experienceFingerprint(d, r.id),
        value: assessment,
      },
    },
  };
  await ops.experience(await input(d, r, "questions"));
  assert.equal(seen.at(-1).input.diagnosis.issue, "clarity");
  await ops.experience(await input(d, r));
  assert.equal(seen.at(-1).input.diagnosis.issue, "clarity");
  d.experienceEnrichment[r.id].assessment.body = "old text";
  await ops.experience(await input(d, r, "questions"));
  assert.equal(seen.at(-1).input.diagnosis, undefined);
});
test("AI can request a missing fact instead of returning an invented replacement", async () => {
  const { d, r } = fixture();
  const ops = intelligenceOperations(async (c) => {
    const raw = {
      text: "",
      explanation: "Need a concrete activity.",
      factIds: [],
      needsDetails: true,
      question: "What did you personally check?",
    };
    c.validateOutput(raw);
    return raw;
  });
  const result = await ops.experience(await input(d, r));
  assert.equal(result.needsDetails, "What did you personally check?");
  assert.ok(isExperienceResult(result));
  assert.equal(result.text, "");
});
test("a long single point is fully assessed in bounded parts and counted only once", async () => {
  const { d, r } = fixture();
  r.context = fact(
    "Prepared weekly reports for department leads. ".repeat(210),
  );
  r.bullets = [];
  const seen = [];
  const ops = intelligenceOperations(async (c) => {
    seen.push(...c.input.points.map((p) => p.text));
    return scoreOutput(c);
  });
  const result = await ops.experience(await input(d, r, "score"));
  assert.equal(result.assessment.points.length, 1);
  assert.equal(
    result.assessment.points[0].point.text,
    r.context.value.trimEnd(),
  );
  assert.equal(seen.join(""), r.context.value.trimEnd());
  assert.equal(result.assessment.score, 70);
  assert.ok(seen.every((text) => text.length <= 6000));
});

test("skill output rejects sentence-length labels rather than truncating evidence-backed keywords", async () => {
  const { d, r } = fixture();
  for (const label of [
    "Requirements analysis and defining acceptance criteria",
    "x".repeat(49),
    "Requirements\nanalysis",
  ]) {
    const ops = intelligenceOperations(async (c) => ({
      skills: [
        {
          label,
          category: "professionalSkills",
          basis: "inferred",
          importance: "core",
          rationale: "The documented activity demonstrates this skill.",
          evidence: "Prepared weekly reports.",
          factIds: [
            c.input.facts.find((f) => f.text === "Prepared weekly reports.").id,
          ],
        },
      ],
    }));
    await assert.rejects(
      ops.experience(await input(d, r, "skills")),
      /AI_OUTPUT_INVALID/,
    );
  }
});
