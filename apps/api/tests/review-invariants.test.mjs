import test from "node:test";
import assert from "node:assert/strict";
import {
  blankDraft,
  fact,
  newRole,
  newEducation,
  newOptionalEntry,
} from "@resumora/contracts/editor/model";
import { decodeDraft, encodeDraft } from "@resumora/contracts/editor/transport";
import { currentWording } from "@resumora/contracts/editor/wording";
import { selfContainedDocumentDraft } from "@resumora/contracts/editor/document";
import {
  translationItems,
  staleTranslationComponents,
  materializeTranslation,
} from "@resumora/contracts/editor/languages";
import { configuredStructuredRunner } from "../src/intelligence/configured.ts";
import { SyntheticLedger } from "../fixtures/synthetic-ledger.ts";
const uid = () => crypto.randomUUID(),
  ownerId = uid(),
  snapshotId = uid(),
  opId = uid();
function draft() {
  const d = blankDraft();
  d.language = "en";
  const r = newRole();
  r.id = "role";
  r.title.value = "Analyst";
  r.context.value = "Prepared SQL reports";
  r.bullets = [fact("Built reporting dashboards")];
  d.roles = [r];
  d.summary.text = "Existing summary";
  d.technicalSkills = [fact("SQL")];
  return d;
}
function retained(d) {
  return {
    schemaVersion: "job-tailor/1",
    sections: tailorTargets(d).map((targetId) => ({
      targetId,
      action: "retain",
      text: "",
      skillIds: [],
      evidenceIds: [],
      requirementIds: [],
      reason: "Keep current content",
      warnings: [],
    })),
  };
}

test("materialization preserves separate bullets, all hidden fields and optional content, and refuses stale overlays", () => {
  const d = draft(),
    r = d.roles[0],
    f = r.context;
  d.presentation.approvedWording = {
    role: {
      text: "Accepted paragraph",
      sources: [{ id: f.id, text: f.value, sourceId: f.sourceId }],
    },
  };
  assert.equal(currentWording(d, "role"), "Accepted paragraph");
  const current = selfContainedDocumentDraft(d);
  assert.equal(current.roles[0].context.value, "Accepted paragraph");
  assert.equal(current.roles[0].bullets[0].value, "Built reporting dashboards");
  d.presentation.hidden = [
    "experience",
    "summary",
    "technicalSkills",
    "identity",
  ];
  d.presentation.hiddenFields = [f.fieldId, r.id + "-contributions"];
  const hidden = selfContainedDocumentDraft(d);
  assert.equal(hidden.roles[0].context.value, "Accepted paragraph");
  assert.deepEqual(
    hidden.roles[0].bullets.map((b) => b.value),
    r.bullets.map((b) => b.value),
  );
  assert.equal(hidden.summary.text, "Existing summary");
  assert.equal(hidden.technicalSkills[0].value, "SQL");
  assert.equal(hidden.name.value, d.name.value);
  d.roles[0].context.value = "Changed support";
  assert.equal(
    selfContainedDocumentDraft(d).roles[0].context.value,
    "Changed support",
  );
  d.presentation.hidden = [];
  d.presentation.hiddenFields = [];
  assert.equal(currentWording(d, "role"), null);
});
test("whole-experience wording alone replaces bullets while stale scoped wording remains inactive", () => {
  const d = draft(),
    f = d.roles[0].context;
  d.presentation.approvedWording = {
    role: {
      scope: "experience",
      origin: "ai_generated",
      text: "Complete supported experience",
      sources: [{ id: f.id, text: f.value, sourceId: f.sourceId }],
    },
  };
  assert.deepEqual(selfContainedDocumentDraft(d).roles[0].bullets, []);
  delete d.presentation.approvedWording.role.origin;
  assert.equal(currentWording(d, "role"), null);
  assert.equal(selfContainedDocumentDraft(d).roles[0].bullets.length, 1);
});

test("sourced custom heading translates with its own stable field, and source set additions/removals are stale", async () => {
  const d = draft(),
    entry = newOptionalEntry();
  entry.title.value = "";
  entry.details.value = "An awarded project";
  d.optionalSections.push({
    id: "awards",
    kind: "custom",
    label: "",
    heading: fact("Premii"),
    entries: [entry],
  });
  d.presentation.order.push("awards");
  const items = await translationItems(d),
    heading = d.optionalSections.at(-1).heading;
  assert.equal(items.find((i) => i.fieldId === heading.fieldId).text, "Premii");
  const input = {
      contentType: "cv",
      sourceLocale: "ro-RO",
      targetLocale: "en-GB",
      items,
      sourceDocumentId: d.id,
      sourceVersionId: "source",
      sourceRevision: 1,
      glossaryVersion: "1",
      approvedGlossary: [],
      translationPreferences: { regionalTerminology: "" },
    },
    output = {
      schemaVersion: "cv-translation/1",
      sourceLocale: "ro-RO",
      targetLocale: "en-GB",
      completion: "complete",
      items: items.map((i) => ({
        id: i.id,
        fieldId: i.fieldId,
        text: i.id === heading.fieldId ? "Awards" : i.text,
        factIds: i.factIds,
        evidenceIds: i.evidenceIds,
      })),
      warnings: [],
      ambiguousTerms: [],
      suggestedGlossary: [],
    };
  assert.equal(
    (await materializeTranslation(d, input, output)).optionalSections.at(-1)
      .heading.value,
    "Awards",
  );
  const lineage = { components: items };
  assert.deepEqual(await staleTranslationComponents(lineage, d), []);
  const skill = fact("Python");
  d.technicalSkills.push(skill);
  assert.deepEqual(await staleTranslationComponents(lineage, d), [
    skill.fieldId,
  ]);
  d.technicalSkills = [];
  assert.ok(
    (await staleTranslationComponents(lineage, d)).includes(
      items.find((i) => i.sectionId === "technicalSkills").id,
    ),
  );
});

test("configured runner accounts separate generation/verification/suggestion attempts and fences replay/cancellation", async () => {
  const ledger = new SyntheticLedger(),
    calls = [],
    env = {
      AI_PAID_INFERENCE: "on",
      AI_PROCESSING_POLICY: "synthetic",
      AI_WORKER_SECRET: "synthetic-worker-secret-at-least-32",
      OPENROUTER_MODEL: "synthetic/model",
      OPENROUTER_ENDPOINT: "synthetic",
      OPENROUTER_API_KEY: "synthetic-router",
      OPENAI_MODEL: "synthetic-direct",
      OPENAI_API_KEY: "synthetic-key",
    };
  let fence = false;
  const durable = {
      durability: "durable",
      begin: (s) => {
        if (fence) throw Error("VERSION_CONFLICT");
        return ledger.begin(s);
      },
      finish: (id, r) => ledger.finish(id, r),
      report: (p) => ledger.report(p),
    },
    transport = async (_url, init) => {
      calls.push(init.headers["X-Client-Request-Id"]);
      return Response.json({
        id: "response-" + calls.length,
        model: "synthetic/model",
        provider: "synthetic",
        usage: {
          prompt_tokens: 10,
          completion_tokens: 10,
          total_tokens: 20,
          prompt_tokens_details: { cached_tokens: 0 },
          completion_tokens_details: { reasoning_tokens: 0 },
          cost: 0.001,
        },
        choices: [
          { finish_reason: "stop", message: { content: '{"valid":true}' } },
        ],
      });
    },
    controller = new AbortController(),
    run = configuredStructuredRunner(
      env,
      ownerId,
      durable,
      controller.signal,
      transport,
    ),
    base = {
      operationId: opId,
      userId: ownerId,
      operation: "cv_rewrite",
      promptVersion: "synthetic/1",
      tier: "career",
      system: "Synthetic adjudication",
      input: {},
      schema: {
        type: "object",
        properties: { valid: { type: "boolean" } },
        required: ["valid"],
        additionalProperties: false,
      },
      maxOutputTokens: 20,
      validateOutput: (v) => v,
    };
  for (const attemptPhase of [undefined, "verify", "suggest"])
    await run({ ...base, attemptPhase });
  assert.deepEqual(calls, [
    opId + "-primary",
    opId + "-verify-primary",
    opId + "-suggest-primary",
  ]);
  await assert.rejects(run({ ...base, attemptPhase: "verify" }));
  assert.equal(calls.length, 3);
  fence = true;
  await assert.rejects(
    run({ ...base, operationId: uid(), attemptPhase: "verify" }),
  );
  assert.equal(calls.length, 3);
  const today = new Date().toISOString().slice(0, 10),
    usage = await ledger.report({ from: today, to: today });
  assert.equal(usage.totals.attempts, 3);
  assert.equal(usage.totals.input, 30);
  assert.equal(usage.totals.output, 30);
  controller.abort();
  await assert.rejects(
    run({ ...base, operationId: uid(), attemptPhase: "verify" }),
  );
  assert.equal(calls.length, 3);
});
