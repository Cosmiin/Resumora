import test from "node:test";
import assert from "node:assert/strict";
import { blankDraft, fact, newRole } from "@resumora/contracts/editor/model";
import { encodeDraft, decodeDraft } from "@resumora/contracts/editor/transport";
import {
  experienceScoreFingerprint,
  experienceScoreIdentity,
  experienceScoreOperationId,
  experiencePoints,
  experienceText,
  pointQualityScore,
  experienceQualityScore,
  currentExperienceAssessment,
} from "@resumora/contracts/intelligence/experience";
import { experiencePolicy } from "@resumora/contracts/intelligence/experience-policy";
import { intelligenceRoute } from "../src/intelligence/routes.ts";

function fixture() {
  const draft = blankDraft(),
    role = newRole();
  draft.documentLocale = "en";
  role.title = fact("Analyst");
  role.context = fact("Prepared weekly reports.");
  draft.roles = [role];
  const snapshots = new Map(),
    receipts = new Map(),
    reservations = [],
    calls = [];
  let head,
    run = async (c) => {
      const points = experiencePoints(experienceText(c.draft, c.targetId)).map(
        (point, index) => {
          const p = {
            point,
            meaningful: true,
            contribution: "specific",
            clarity: "specific",
            specificity: "partial",
            issue: "specificity",
          };
          return { ...p, id: `p${index}`, duplicateOf: null, strength: null, improvement: null, suggestedQuestion: null, score: pointQualityScore(p) };
        },
      );
      return {
        schemaVersion: "experience-assistant/1",
        targetId: c.targetId,
        fingerprint: c.request.fingerprint,
        intent: "score",
        assessment: {
          rubric: "experience-quality/3",
          feedbackLocale: "en", scope: "complete", experience: null,
          policyVersion: experiencePolicy.version,
          score: experienceQualityScore(points),
          points,
          dimensions: ["contribution", "methods", "scope", "outcome"].map(
            (dimension) => ({ dimension, grade: "missing", evidence: [] }),
          ),
        },
      };
    };
  const save = (d) => {
    head = {
      id: crypto.randomUUID(),
      revision: snapshots.size + 1,
      payload: encodeDraft(d),
    };
    snapshots.set(head.id, head);
    return head;
  };
  save(draft);
  const options = {
    enabled: true,
    userId: crypto.randomUUID(),
    gateway: {
      loadSnapshot: async (id) => snapshots.get(id),
      loadDraft: async () => head,
      getWorkspaceOperation: async (id) =>
        structuredClone(receipts.get(id) ?? null),
      beginWorkspaceOperation: async (id, kind, input) => {
        const existing = receipts.get(id);
        if (existing) {
          if (JSON.stringify(existing.input) !== JSON.stringify(input))
            throw Object.assign(Error("IDEMPOTENCY_BODY_MISMATCH"), {
              code: "IDEMPOTENCY_BODY_MISMATCH",
              status: 409,
            });
          return { created: false };
        }
        receipts.set(id, {
          id,
          kind,
          input,
          state: "processing",
          result: null,
        });
        return { created: true };
      },
      reserveCareer: async (reservation) => {
        reservations.push(reservation);
        return true;
      },
      finishWorkspaceOperation: async (id, state, result) => {
        const row = receipts.get(id);
        Object.assign(row, { state, result });
        return row;
      },
    },
    operations: {
      experience: async (c) => {
        calls.push(c);
        return run(c);
      },
    },
  };
  const context = async (
    d = decodeDraft(head.payload),
    snapshot = head,
    attempt = 0,
  ) => ({
    snapshotId: snapshot.id,
    revision: snapshot.revision,
    targetId: role.id,
    operationId: await experienceScoreOperationId(d, role.id, attempt),
    experience: {
      intent: "score",
      fingerprint: await experienceScoreFingerprint(d, role.id),
      ...(attempt ? { scoreAttempt: attempt } : {}),
    },
  });
  const post = (body) =>
    intelligenceRoute(
      new Request("https://app.invalid/v1/intelligence/experience", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      options,
    );
  return {
    draft,
    role,
    options,
    calls,
    receipts,
    snapshots,
    reservations,
    save,
    context,
    post,
    setRun: (value) => {
      run = value;
    },
  };
}

test("replays the saved assessment across autosaves and unrelated evidence changes without inference", async () => {
  const f = fixture(),
    first = await f.context();
  const response = await f.post(first);
  assert.equal(response.status, 200);
  const value = await response.json();
  f.draft.name = fact("Updated name");
  f.draft.answers.push({
    id: "answer",
    targetId: f.role.id,
    question: "tools",
    questionText: "Tools?",
    text: "Excel",
    status: "confirmed",
    sourceId: "manual",
  });
  f.save(f.draft);
  const next = await f.context();
  assert.equal(next.operationId, first.operationId);
  const replay = await f.post(next);
  assert.equal(replay.status, 200);
  assert.deepEqual(await replay.json(), value);
  assert.equal(f.calls.length, 1);
  assert.equal(f.reservations.length, 1);
  assert.equal(f.reservations[0].kind, "score");
});
test("two tabs racing with different snapshot revisions reserve and score only once", async () => {
  const f = fixture(),
    first = await f.context();
  f.draft.name = fact("Other tab");
  f.save(f.draft);
  const second = await f.context();
  let release, started;
  const entered = new Promise((resolve) => {
    started = resolve;
  });
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  f.setRun(async (c) => {
    started();
    await gate;
    return {
      schemaVersion: "experience-assistant/1",
      targetId: c.targetId,
      fingerprint: c.request.fingerprint,
      intent: "score",
      assessment: {},
    };
  });
  const a = f.post(first);
  await entered;
  const b = await f.post(second);
  assert.equal(b.status, 409);
  release();
  assert.equal((await a).status, 200);
  assert.equal(f.calls.length, 1);
  assert.equal(f.reservations.length, 1);
  const replay = await f.post(second);
  assert.equal(replay.status, 200);
  assert.equal(f.calls.length, 1);
});
test("changed wording, role label, document locale and policy identity invalidate only relevant input", async () => {
  const f = fixture(),
    first = await f.context();
  await f.post(first);
  const initialIdentity = experienceScoreIdentity(f.draft, f.role.id);
  f.role.context = fact("Prepared reporting for three teams.");
  f.save(f.draft);
  const changed = await f.context();
  assert.notEqual(changed.operationId, first.operationId);
  assert.notEqual(experienceScoreIdentity(f.draft, f.role.id), initialIdentity);
  assert.equal((await f.post(changed)).status, 200);
  assert.equal(f.calls.length, 2);
  f.role.title = fact("Reporting analyst");
  f.save(f.draft);
  assert.notEqual((await f.context()).operationId, changed.operationId);
  const beforeLocale = await f.context();
  f.draft.documentLocale = "ro";
  f.save(f.draft);
  assert.notEqual((await f.context()).operationId, beforeLocale.operationId);
});
test("stale, removed and replaced experiences cannot start inference", async () => {
  for (const mutation of [
    (f) => {
      f.role.context = fact("Changed.");
    },
    (f) => {
      f.draft.roles = [];
    },
    (f) => {
      f.draft.id = crypto.randomUUID();
    },
  ]) {
    const f = fixture(),
      old = await f.context();
    mutation(f);
    f.save(f.draft);
    assert.equal((await f.post(old)).status, 409);
    assert.equal(f.calls.length, 0);
  }
});
test("uncertain outcomes are fenced; terminal failures require an explicit next attempt", async () => {
  const f = fixture(),
    first = await f.context();
  f.setRun(async () => {
    throw Error("AI_TIMEOUT_UNKNOWN");
  });
  assert.equal((await f.post(first)).status, 504);
  assert.equal(f.receipts.get(first.operationId).state, "unknown");
  assert.equal((await f.post(first)).status, 409);
  assert.equal(f.calls.length, 1);
  assert.equal(
    (await f.post(await f.context(undefined, undefined, 1))).status,
    504,
  );
  assert.equal(f.calls.length, 2);
  const failed = fixture(),
    original = await failed.context();
  failed.setRun(async () => {
    throw Error("AI_OUTPUT_INVALID");
  });
  await failed.post(original);
  assert.equal(failed.receipts.get(original.operationId).state, "failed");
  assert.equal((await failed.post(original)).status, 502);
  assert.equal(failed.calls.length, 1);
  assert.equal(
    (await failed.post(await failed.context(undefined, undefined, 1))).status,
    502,
  );
  assert.equal(failed.calls.length, 2);
});
test("forged operation IDs and invalid retry counters are rejected before inference", async () => {
  const f = fixture(),
    context = await f.context();
  assert.equal(
    (await f.post({ ...context, operationId: crypto.randomUUID() })).status,
    400,
  );
  assert.equal(
    (
      await f.post({
        ...context,
        experience: { ...context.experience, scoreAttempt: -1 },
      })
    ).status,
    400,
  );
  assert.equal(f.calls.length, 0);
});
test("new score metadata roundtrips and does not invalidate its own content identity", async () => {
  const f = fixture(),
    context = await f.context(),
    identity = experienceScoreIdentity(f.draft, f.role.id);
  const response = await f.post(context),
    result = await response.json();
  f.draft.experienceEnrichment = {
    [f.role.id]: {
      version: 1,
      assessment: {
        body: experienceText(f.draft, f.role.id),
        fingerprint: result.fingerprint,
        value: result.assessment,
        scoreIdentity: identity,
      },
    },
  };
  assert.deepEqual(decodeDraft(encodeDraft(f.draft)), f.draft);
  assert.equal(experienceScoreIdentity(f.draft, f.role.id), identity);
});

test("saved grades remain decodable when a later policy uses different weights", async () => {
  const { experiencePolicy } =
    await import("@resumora/contracts/intelligence/experience-policy");
  const { isAssessment } =
    await import("@resumora/contracts/intelligence/experience");
  const f = fixture(),
    c = await f.context(),
    r = await (await f.post(c)).json();
  const legacy = structuredClone(r.assessment);
  assert.equal(isAssessment(legacy), true);
  const originalWeights = experiencePolicy.weights;
  try {
    experiencePolicy.weights = {
      contribution: 10,
      clarity: 10,
      specificity: 80,
    };
    assert.equal(isAssessment(legacy), true);
    assert.notEqual(experienceQualityScore(legacy.points), legacy.score);
    assert.equal(
      isAssessment({ ...legacy, policyVersion: "unknown-policy" }),
      false,
    );
  } finally {
    experiencePolicy.weights = originalWeights;
  }
});

test("previous prompt assessments remain readable but require reassessment under the CV coaching policy", async () => {
  const f = fixture();
  const response = await f.post(await f.context());
  const result = await response.json();
  const assessment = {
    body: experienceText(f.draft, f.role.id),
    fingerprint: result.fingerprint,
    value: result.assessment,
  };
  f.draft.experienceEnrichment = {
    [f.role.id]: { version: 1, assessment },
  };
  assert.ok(currentExperienceAssessment(f.draft, f.role.id));
  for (const version of ["experience-score/3", undefined]) {
    assessment.value = {rubric:"experience-quality/2",dimensions:result.assessment.dimensions,score:result.assessment.score,
      points:result.assessment.points.map(({point,meaningful,contribution,clarity,specificity,issue,score})=>({point,meaningful,contribution,clarity,specificity,issue,score})),policyVersion:version};
    if (version === undefined) delete assessment.value.policyVersion;
    const decoded = decodeDraft(encodeDraft(f.draft));
    assert.equal(
      decoded.experienceEnrichment[f.role.id].assessment.value.score,
      result.assessment.score,
    );
    assert.equal(currentExperienceAssessment(decoded, f.role.id), undefined);
    const previousIdentity = JSON.parse(
      experienceScoreIdentity(f.draft, f.role.id),
    );
    previousIdentity[0] = "experience-score/3";
    assert.notEqual(
      experienceScoreIdentity(f.draft, f.role.id),
      JSON.stringify(previousIdentity),
    );
  }
});

test('explicit recalculation follows a completed receipt but cannot bypass an active attempt', async () => {
  const f=fixture();
  const first=await f.context();
  assert.equal((await f.post(first)).status,200);
  const next=await f.context(undefined,undefined,1);
  assert.equal((await f.post(next)).status,200);
  assert.equal(f.calls.length,2);
  assert.equal((await f.post(next)).status,200);
  assert.equal(f.calls.length,2);
  f.receipts.get(next.operationId).state='processing';
  assert.equal((await f.post(await f.context(undefined,undefined,2))).status,400);
  assert.equal(f.calls.length,2);
});
