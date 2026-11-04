import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { blankDraft, newRole, fact } from "@resumora/contracts/editor/model";
import {
  experienceFingerprint,
  isExperienceResult,
} from "@resumora/contracts/intelligence/experience";
import { intelligenceOperations } from "../src/intelligence/operations.ts";
const examples = JSON.parse(
  readFileSync(
    new URL("../fixtures/skills-inventory.json", import.meta.url),
    "utf8",
  ),
);
function draft(texts) {
  const d = blankDraft(),
    r = newRole();
  r.context = fact(texts[0]);
  r.bullets = texts.slice(1).map(fact);
  d.roles = [r];
  return { d, r };
}
async function extract(d, r, respond) {
  return intelligenceOperations(async (call) => {
    const raw = respond(call);
    call.validateOutput(raw);
    return raw;
  }).experience({
    operationId: crypto.randomUUID(),
    userId: crypto.randomUUID(),
    draft: d,
    targetId: r.id,
    request: {
      intent: "skills",
      fingerprint: await experienceFingerprint(d, r.id),
    },
  });
}
const item = (call, label, category = "technicalSkills", extra = {}) => ({
  label,
  category,
  importance: "core",
  ...extra,
});
for (const example of examples)
  test(`skills fixture: ${example.name}`, async () => {
    const { d, r } = draft(example.facts);
    d.documentLocale = example.locale;
    const result = await extract(d, r, (c) => ({
      skills: example.skills.map(({label, category, importance}) => ({label, category, importance})),
    }));
    assert.equal(result.extractionVersion, "skills-inventory/2");
    assert.ok(isExperienceResult(result));
    assert.deepEqual(
      result.skills.map((s) => [s.label, s.category]).sort(),
      example.skills.map((s) => [s.label, s.category]).sort(),
    );
    assert.ok(result.skills.every(s => !("evidence" in s) && !("factIds" in s)));
  });
test("rich evidence yields more than eight skills, up to 30 in each category", async () => {
  const { d, r } = draft([
    "Implemented numerous named technical methods and coordinated several documented business practices.",
  ]);
  const result = await extract(d, r, (c) => ({
    skills: [
      ...Array.from({ length: 30 }, (_, i) =>
        item(c, `Method ${String.fromCharCode(65 + i)}`),
      ),
      ...Array.from({ length: 30 }, (_, i) =>
        item(
          c,
          `Practice ${String.fromCharCode(65 + i)}`,
          "professionalSkills",
        ),
      ),
    ],
  }));
  assert.equal(
    result.skills.filter((s) => s.category === "technicalSkills").length,
    30,
  );
  assert.equal(
    result.skills.filter((s) => s.category === "professionalSkills").length,
    30,
  );
});
test("aliases normalize consistently without merging distinct technology and capability concepts", async () => {
  const { d, r } = draft([
    "Used SQL, Java, JavaScript, C and C++ to validate imported data and documented business requirements.",
  ]);
  d.documentLocale = "en";
  const result = await extract(d, r, (c) => ({
    skills: [
      item(c, "RESTful APIs"),
      item(c, "REST APIs"),
      item(c, "SQL"),
      item(c, "Data validation", "professionalSkills"),
      item(c, "Java"),
      item(c, "JavaScript"),
      item(c, "C"),
      item(c, "C++"),
      item(c, "Analiza cerințelor", "technicalSkills"),
    ],
  }));
  assert.deepEqual(
    result.skills.map((s) => s.label).sort(),
    [
      "REST APIs",
      "SQL",
      "Data Validation",
      "Java",
      "JavaScript",
      "C",
      "C++",
      "Requirements Analysis",
    ].sort(),
  );
  assert.equal(
    result.skills.find((s) => s.label === "Data Validation").category,
    "technicalSkills",
  );
  assert.equal(
    result.skills.find((s) => s.label === "Requirements Analysis").category,
    "professionalSkills",
  );
});
test("existing multilingual synonyms suppress duplicates but not distinct capabilities", async () => {
  const { d, r } = draft([
    "Used SQL to validate records and analysed requirements.",
  ]);
  d.professionalSkills = [fact("Analiza cerințelor")];
  const result = await extract(d, r, (c) => ({
    skills: [
      item(c, "Requirements Analysis", "professionalSkills"),
      item(c, "SQL"),
      item(c, "Data Validation"),
    ],
  }));
  assert.deepEqual(result.skills.map((s) => s.label).sort(), [
    "Data Validation",
    "SQL",
  ]);
});
test("official longer names survive; malformed fields and obsolete reference fields are rejected", async () => {
  const { d, r } = draft([
    "Used Microsoft Dynamics 365 Business Central for accounting.",
  ]);
  const good = await extract(d, r, (c) => ({
    skills: [
      item(c, "Microsoft Dynamics 365 Business Central"),
    ],
  }));
  assert.equal(good.skills[0].label, "Microsoft Dynamics 365 Business Central");
  for (const extra of [
    { evidence: "invented" },
    { evidence: "" },
    { factIds: ["foreign"] },
    { basis: "speculative" },
    { importance: "critical" },
    { rationale: "" },
    { label: "x".repeat(101) },
  ])
    await assert.rejects(
      extract(d, r, (c) => ({
        skills: [item(c, "Kubernetes", "technicalSkills", extra)],
      })),
      /AI_OUTPUT_INVALID/,
    );
});
test("valid skill labels pass without comparing numbers or names against source text", async () => {
  const {d,r} = draft(["Implemented a quality management process."]);
  const result = await extract(d,r,c=>({skills:[item(c,"ISO 9001"),item(c,"Python")]}));
  assert.deepEqual(result.skills.map(s=>s.label).sort(), ["ISO 9001", "Python"]);
});
test("skills evidence excludes hidden, draft and superseded answers; confirmed questions retain context", async () => {
  const { d, r } = draft(["Implemented SQL reports.", "Hidden experience"]);
  d.presentation.hiddenFields = [r.bullets[0].fieldId];
  d.answers = [
    ["confirmed", "kept", "Used Excel."],
    ["draft", "draft", "Used Python."],
    ["confirmed", "old", "Used Go."],
  ].map(([status, id, text]) => ({
    id,
    status,
    text,
    targetId: r.id,
    question: "tools",
    questionText: "Which tool?",
    sourceId: "manual",
  }));
  d.experienceEnrichment = {
    [r.id]: { version: 1, supersededAnswerIds: ["old"] },
  };
  await extract(d, r, (c) => {
    assert.deepEqual(
      c.input.facts.map((f) => f.text),
      ["Implemented SQL reports.", "Used Excel."],
    );
    assert.equal(c.input.facts[1].question, "Which tool?");
    return { skills: [] };
  });
});
test("obsolete reference fields reject a whole new result, without changing existing skills", async () => {
  const { d, r } = draft(["Used SQL to validate records."]);
  const before = structuredClone(d);
  await assert.rejects(
    extract(d, r, (c) => ({
      skills: [
        item(c, "Data Validation"),
        item(c, "Python", "technicalSkills", {
          evidence: "Used SQL to validate records.",
          basis: "explicit",
        }),
      ],
    })),
    /AI_OUTPUT_INVALID/,
  );
  assert.deepEqual(d, before);
});
test("skill labels use the shared detected or translated CV locale rather than a stale legacy or interface locale", async () => {
  const { d, r } = draft(["J’ai utilisé SQL pour contrôler les données."]);
  d.language = "en";
  d.documentLocale = "en";
  d.contentLanguage = {
    locale: "fr",
    confidence: "high",
    source: "narrative",
    policyVersion: "cv-language/1",
  };
  await extract(d, r, (c) => {
    assert.equal(c.input.documentLocale, "fr");
    assert.equal(c.input.locale, "fr");
    return { skills: [] };
  });
  d.translation = { documentLocale: "es" };
  await extract(d, r, (c) => {
    assert.equal(c.input.documentLocale, "es");
    assert.equal(c.input.locale, "es");
    return { skills: [] };
  });
});
