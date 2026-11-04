import test from "node:test";
import assert from "node:assert/strict";
import { blankDraft, fact, newRole } from "@resumora/contracts/editor/model";
import { encodeDraft, decodeDraft } from "@resumora/contracts/editor/transport";
import {
  getSkillInventory,
  withSkillInventory,
  skillReviewFingerprint,
  skillInventoryIdentity,
  allInventorySkills,
  isSkillsImprovementResult,
} from "@resumora/contracts/intelligence/skills-improvement";
test("malformed inventory cannot replace unrelated CV sections", async () => {
  const d = blankDraft();
  d.roles = [newRole()];
  const inventory = { ...getSkillInventory(d), roles: [] };
  assert.equal(withSkillInventory(d, inventory).roles.length, 1);
  assert.equal(
    isSkillsImprovementResult({
      schemaVersion: "skills-improvement/1",
      fingerprint: await skillReviewFingerprint(d),
      inventory,
      removed: [],
    }),
    false,
  );
});
import { skillsImprovementOperation } from "../src/intelligence/skills-improvement.ts";
import {
  canonicalSkill,
  skillKey,
} from "@resumora/contracts/intelligence/skill-keywords";

test("uses familiar acronyms without switching natural-language skill labels away from the CV locale", () => {
  for (const locale of ["ro", "fr", "de"]) {
    assert.equal(
      canonicalSkill("Structured Query Language", "technicalSkills", locale)
        .label,
      "SQL",
    );
    assert.equal(
      canonicalSkill(
        "Application Programming Interfaces",
        "technicalSkills",
        locale,
      ).label,
      "APIs",
    );
    assert.equal(
      canonicalSkill(
        "Customer Relationship Management",
        "professionalSkills",
        locale,
      ).label,
      "CRM",
    );
    assert.equal(skillKey("Customer Relationship Management"), skillKey("CRM"));
  }
  assert.equal(
    canonicalSkill("Gestion des parties prenantes", "professionalSkills", "fr")
      .label,
    "Gestion des parties prenantes",
  );
});

const entry = (f, label = f.value, extra = {}) => ({
  label,
  category: "technicalSkills",
  sourceSkillIds: [f.id],
  importance: "core",
  ...extra,
});
const request = async (d) => ({
  draft: d,
  userId: "user",
  operationId: crypto.randomUUID(),
  fingerprint: await skillReviewFingerprint(d),
});
test("preserves input skills omitted from cleanup output", async () => {
  const draft = blankDraft();
  draft.technicalSkills = [fact("SQL")];
  const result = await skillsImprovementOperation(async () => ({ skills: [], removed: [] }))(await request(draft));
  assert.deepEqual(result.inventory.technicalSkills.map(skill => skill.value), ["SQL"]);
});
test("cleanup normalizes, splits, merges, preserves self-declared and retains overflow", async () => {
  const d = blankDraft();
  d.technicalSkills = Array.from({ length: 34 }, (_, i) => fact(`Tool ${i}`));
  d.professionalSkills = Array.from({ length: 24 }, (_, i) =>
    fact(`People skill ${i}`),
  );
  const run = async (op) => {
    const result = {
      skills: op.input.existing.map((f) =>
        entry({ id: f.id, value: f.label }, f.label, { category: f.category }),
      ),
      removed: [],
    };
    op.validateOutput(result);
    return result;
  };
  const result = await skillsImprovementOperation(run)(await request(d));
  assert.equal(result.inventory.technicalSkills.length, 20);
  assert.equal(result.inventory.skillReserves.technicalSkills.length, 14);
  assert.equal(result.inventory.professionalSkills.length, 20);
  assert.equal(result.inventory.skillReserves.professionalSkills.length, 4);
  assert.ok(
    result.inventory.technicalSkills.every(
      (f) => f.skillOrigin === undefined,
    ),
  );
  const f = fact("Using SQL and Microsoft Excel every day");
  d.professionalSkills = [];
  d.technicalSkills = [f, fact("MS Excel")];
  const split = await skillsImprovementOperation(async (op) => ({
    skills: [
      entry(f, "SQL"),
      entry(f, "Excel", { sourceSkillIds: d.technicalSkills.map((x) => x.id) }),
    ],
    removed: [],
  }))(await request(d));
  assert.deepEqual(split.inventory.technicalSkills.map((f) => f.value).sort(), [
    "Excel",
    "SQL",
  ]);
});
test("omitted originals are retained and explicit model removals are applied", async () => {
  const d = blankDraft();
  d.professionalSkills = [fact("Management"), fact("Other skills")];
  const omitted = await skillsImprovementOperation(async () => ({ skills: [], removed: [] }))(await request(d));
  assert.deepEqual(omitted.inventory.professionalSkills.map(skill => skill.value).sort(), ["Management", "Other skills"]);
  const result = await skillsImprovementOperation(async () => ({
    skills: [],
    removed: d.professionalSkills.map((f) => ({
      id: f.id,
      reason: "Vague label",
      confidence: "high",
    })),
  }))(await request(d));
  assert.equal(result.inventory.professionalSkills.length, 0);
  assert.deepEqual(result.removed.map(r=>r.label).sort(), ["Management", "Other skills"]);
});
test("partial provider failure never returns a partial inventory", async () => {
  const d = blankDraft(),
    r = newRole();
  r.context = { ...fact("Used SQL for reports."), status: "user_authored" };
  d.roles = [r];
  d.technicalSkills = [fact("SQL")];
  let calls = 0;
  await assert.rejects(
    skillsImprovementOperation(async (op) => {
      calls++;
      if (op.promptVersion === "skills-improvement/3")
        throw Error("AI_TIMEOUT_UNKNOWN");
      return { skills: [] };
    })(await request(d)),
    /AI_TIMEOUT_UNKNOWN/,
  );
  assert.equal(calls, 2);
});
test("a merged output uses tracking IDs without semantic cross-checks", async () => {
  for (const [category, labels] of [
    ["technicalSkills", ["SQL", "Python"]],
    ["professionalSkills", ["Planning", "Communication"]],
  ]) {
    const d = blankDraft();
    d[category] = labels.map(fact);
    const result = await skillsImprovementOperation(async () => ({
      skills: [
        entry(d[category][0], labels[0], {
          category,
          sourceSkillIds: d[category].map((f) => f.id),
        }),
      ],
      removed: [],
    }))(await request(d));
    assert.deepEqual(
      result.inventory[category].map((f) => f.value).sort(),
      [labels[0]],
    );
    assert.deepEqual(result.removed, []);
  }
});

test("inventory roundtrips reserves while retiring old origin labels", async () => {
  const d = blankDraft();
  assert.deepEqual(decodeDraft(encodeDraft(d)), d);
  const inventory = getSkillInventory(d);
  inventory.technicalSkills = [
    { ...fact("SQL"), skillOrigin: "self_declared" },
  ];
  inventory.skillReserves.professionalSkills = [fact("Negotiation")];
  const next = withSkillInventory(d, inventory);
  assert.deepEqual(
    getSkillInventory(decodeDraft(encodeDraft(next))),
    {...inventory, technicalSkills: inventory.technicalSkills.map(({skillOrigin, ...f})=>f)},
  );
  assert.equal(
    allInventorySkills(next, "professionalSkills")[0].value,
    "Negotiation",
  );
  assert.equal(d.technicalSkills.length, 0);
  const fingerprint = await skillReviewFingerprint(next);
  next.name.value = "Unrelated name edit";
  assert.equal(await skillReviewFingerprint(next), fingerprint);
  next.skillReserves.professionalSkills[0].value = "Communication";
  assert.notEqual(await skillReviewFingerprint(next), fingerprint);
});
test("review fingerprint includes experience and exclusions but not pending-operation metadata", async () => {
  const d = blankDraft(),
    r = newRole();
  r.context = fact("Used SQL.");
  d.roles = [r];
  const original = await skillReviewFingerprint(d);
  d.skillReview = {
    operationId: crypto.randomUUID(),
    fingerprint: original,
    snapshotId: crypto.randomUUID(),
    revision: 1,
  };
  assert.equal(await skillReviewFingerprint(d), original);
  d.experienceEnrichment = {
    [r.id]: {
      version: 1,
      skillChoices: {
        x: { label: "SQL", category: "technicalSkills", selected: false },
      },
    },
  };
  assert.notEqual(await skillReviewFingerprint(d), original);
  const inventory = skillInventoryIdentity(d);
  r.context.value = "Used Python.";
  assert.equal(skillInventoryIdentity(d), inventory);
  assert.notEqual(await skillReviewFingerprint(d), original);
});

test("discovers first, then improves the entire existing, reserve and discovered inventory in one call", async () => {
  const d = blankDraft(), role = newRole();
  role.context = fact("Used SQL to validate reports."); d.roles = [role];
  d.technicalSkills = [fact("MS Excel")];
  d.skillReserves = { technicalSkills: [fact("Python")], professionalSkills: [] };
  const calls = [];
  const result = await skillsImprovementOperation(async op => {
    calls.push(op);
    if (calls.length === 1) {
      assert.ok(!("removed" in op.schema.properties), "first model request extracts skills");
      return { skills: [{ label:"SQL", category:"technicalSkills", importance:"core" }] };
    }
    assert.deepEqual(op.input.existing.map(f => f.label).sort(), ["MS Excel", "Python", "SQL"]);
    return { skills: op.input.existing.map(f => entry({id:f.id,value:f.label})), removed:[] };
  })(await request(d));
  assert.equal(calls.length, 2);
  assert.deepEqual(result.inventory.technicalSkills.map(f=>f.value).sort(), ["Excel","Python","SQL"]);
  const sql = result.inventory.technicalSkills.find(f=>f.value === "SQL");
  assert.equal(sql.skillOrigin, undefined);
  assert.equal(sql.skillEvidence, undefined);
});
test("deleted keywords stay excluded from discovery, including after a draft roundtrip", async () => {
  const d = blankDraft(), role = newRole(); role.context = fact("Used SQL."); d.roles=[role];
  d.skillExclusions = ["sql"];
  const saved=decodeDraft(encodeDraft(d));
  assert.deepEqual(saved.skillExclusions,["sql"]);
  const result=await skillsImprovementOperation(async op => "removed" in op.schema.properties
    ? {skills:op.input.existing.map(f=>entry({id:f.id,value:f.label})),removed:[]}
    : {skills:[{label:"SQL",category:"technicalSkills",importance:"core"}]}
  )(await request(saved));
  assert.deepEqual(result.inventory.technicalSkills,[]);
  const prior=await skillReviewFingerprint(d); d.skillExclusions=[];
  assert.notEqual(await skillReviewFingerprint(d),prior);
});

test("cleanup does not resurrect a deleted keyword by splitting a surviving combined label", async () => {
  const d=blankDraft(), f=fact("SQL and Microsoft Excel"); d.technicalSkills=[f];d.skillExclusions=["sql"];
  const result=await skillsImprovementOperation(async()=>({skills:[entry(f,"SQL"),entry(f,"Excel")],removed:[]}))(await request(d));
  assert.deepEqual(result.inventory.technicalSkills.map(f=>f.value),["Excel"]);
});
test("old reference metadata is removed when an existing skill is carried forward", async () => {
  const d=blankDraft(), role=newRole();role.context=fact("Used SQL.");d.roles=[role];
  const source={targetId:role.id,factIds:[role.context.id],quote:"Used SQL.",basis:"explicit"};
  d.technicalSkills=[{...fact("SQL"),skillOrigin:"experience",skillEvidence:[source]}];
  const result=await skillsImprovementOperation(async op=> "removed" in op.schema.properties
    ? {skills:op.input.existing.map(f=>entry({id:f.id,value:f.label})),removed:[]}
    : {skills:[]})(await request(d));
  assert.equal(result.inventory.technicalSkills[0].skillOrigin,undefined);
  assert.equal(result.inventory.technicalSkills[0].skillEvidence,undefined);
});

test("large historical reference lists are discarded in the resulting inventory", async () => {
  const d=blankDraft(), role=newRole();role.context=fact("Used SQL.");d.roles=[role];
  d.technicalSkills=[{...fact("SQL"),skillOrigin:"experience",skillEvidence:Array.from({length:120},(_,i)=>({targetId:role.id,factIds:[role.context.id],quote:"Used SQL.",basis:"explicit",rationale:`Saved evidence ${i}`}))}];
  const result=await skillsImprovementOperation(async op=> "removed" in op.schema.properties
    ? {skills:op.input.existing.map(f=>entry({id:f.id,value:f.label})),removed:[]}
    : {skills:[{label:"SQL",category:"technicalSkills",importance:"core"}]})(await request(d));
  assert.equal(result.inventory.technicalSkills[0].value,"SQL");
  assert.equal(result.inventory.technicalSkills[0].skillEvidence,undefined);
});


test("reference-free extraction and cleanup accept renamed skills with tracking IDs only", async () => {
  const d = blankDraft(), role = newRole();
  role.context = fact("Created reports for the team.");
  d.roles = [role];
  d.technicalSkills = [fact("Building reports")];
  let calls = 0;
  const result = await skillsImprovementOperation(async op => {
    calls++;
    const response = calls === 1
      ? { skills: [{ label: "Power BI", category: "technicalSkills", importance: "core" }] }
      : { skills: op.input.existing.map(f => entry({id:f.id}, f.label === "Building reports" ? "Reporting 2026" : f.label)), removed: [] };
    op.validateOutput(response);
    return response;
  })(await request(d));
  assert.equal(calls, 2);
  assert.deepEqual(result.inventory.technicalSkills.map(f=>f.value).sort(), ["Power BI", "Reporting 2026"]);
  assert.ok(result.inventory.technicalSkills.every(f => !("skillEvidence" in f) && !("skillOrigin" in f)));
});


test("cleanup rejects malformed rows and unknown tracking IDs without changing the profile", async () => {
  const d = blankDraft(); d.technicalSkills = [fact("SQL")];
  const before = structuredClone(d);
  for (const patch of [{label:42},{category:"other"},{importance:"critical"},{sourceSkillIds:["unknown"]},{sourceSkillIds:[]},{label:"x".repeat(2001)}]) {
    await assert.rejects(skillsImprovementOperation(async()=>({skills:[entry(d.technicalSkills[0],"SQL",patch)],removed:[]}))(await request(d)), /AI_OUTPUT_INVALID/);
  }
  assert.deepEqual(d,before);
});

test("legacy profiles discard reference metadata while preserving skill IDs and import provenance", () => {
  const d = blankDraft();
  const f = {...fact("SQL"),skillEvidence:[{targetId:"deleted",factIds:["missing"],quote:"outdated"}],skillOrigin:"experience",sourceLineage:[{sourceId:"manual"}]};
  d.technicalSkills=[f];
  const raw = {schemaVersion:"resumora-editor-draft/1",content:{...d},answers:d.answers};
  delete raw.content.answers;
  const restored = decodeDraft(raw);
  assert.equal(restored.technicalSkills[0].id,f.id);
  assert.deepEqual(restored.technicalSkills[0].sourceLineage,f.sourceLineage);
  assert.equal(restored.technicalSkills[0].skillEvidence,undefined);
  assert.equal(restored.technicalSkills[0].skillOrigin,undefined);
  assert.equal(encodeDraft(d).content.technicalSkills[0].skillEvidence,undefined);
});

test("skill identities survive reordered nested metadata and still track meaningful edits", async () => {
  const d = blankDraft(), role = newRole();
  role.context = fact("Used SQL for reports.");
  role.context.sourceLineage = [{sourceId:"manual", sourceClaimId:"original-claim"}];
  d.roles = [role];
  d.technicalSkills = [fact("SQL")];
  d.skillReserves = {technicalSkills:[fact("Excel")],professionalSkills:[]};
  d.experienceEnrichment = {[role.id]:{version:1,skillChoices:{one:{selected:false,label:"Python",category:"technicalSkills"}}}};
  const reorder = value => Array.isArray(value) ? value.map(reorder) : value && typeof value === "object"
    ? Object.fromEntries(Object.keys(value).sort().reverse().map(key=>[key,reorder(value[key])])) : value;
  const saved = decodeDraft(reorder(encodeDraft(d)));
  assert.equal(skillInventoryIdentity(saved), skillInventoryIdentity(d));
  assert.equal(await skillReviewFingerprint(saved), await skillReviewFingerprint(d));
  for (const change of [
    next=>{next.roles[0].context.value="Different work";},
    next=>{next.skillReserves.technicalSkills[0].value="Other tool";},
    next=>{next.experienceEnrichment[role.id].skillChoices.one.selected=true;},
    next=>{next.technicalSkills[0].id="different-id";},
  ]) {
    const changed=structuredClone(saved); change(changed);
    assert.notEqual(await skillReviewFingerprint(changed),await skillReviewFingerprint(d));
  }
});
