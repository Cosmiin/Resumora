import { it, expect } from "vitest";
import { blankDraft, newRole, fact } from "./model";
import * as skills from "./profile-skills";
import { patchFact } from "./editing";
import {
  experienceIdentity,
  type SkillSuggestion,
} from "@resumora/contracts/intelligence/experience";
function fixture() {
  const d = blankDraft();
  for (let i = 0; i < 2; i++) {
    const r = newRole();
    r.context = fact("Used SQL to prepare recurring financial reports.");
    d.roles.push(r);
    d.experienceEnrichment ??= {};
    d.experienceEnrichment[r.id] = {
      version: 1,
      skillsIdentity: experienceIdentity(d, r.id),
      skills: {
        schemaVersion: "experience-assistant/1",
        extractionVersion: "skills-inventory/2",
        intent: "skills",
        targetId: r.id,
        fingerprint: "a".repeat(64),
        skills: [
          {
            id: "sql",
            label: "SQL",
            category: "technicalSkills",
          },
          {
            id: "reports",
            label: "Financial reporting",
            category: "professionalSkills",
          },
        ],
      },
    };
  }
  return d;
}
it("does not add a reserved keyword back into the active list during ordinary discovery", () => {
  const d = fixture();
  d.skillReserves = { technicalSkills: [fact("SQL")], professionalSkills: [] };
  const next = skills.addProfileSkillKeywords(d);
  expect(next.technicalSkills).toHaveLength(0);
  expect(next.skillReserves!.technicalSkills[0].value).toBe("SQL");
  expect(next.professionalSkills[0].skillOrigin).toBeUndefined();
});
it("normal inline skill edits remain self-declared and discard obsolete skill evidence", () => {
  for (const origin of [undefined, "self_declared", "experience"] as const) {
    const d = blankDraft();
    const original = {
      ...fact("Python"),
      ...(origin ? { skillOrigin: origin } : {}),
    };
    d.technicalSkills = [original];
    const next = patchFact(d, original, "Rust");
    const edited = next.technicalSkills[0];
    expect(edited.skillOrigin).toBeUndefined();
    expect(edited.skillEvidence).toBeUndefined();
  }
});
it("consolidates duplicate skills across roles while retaining suggestion IDs without evidence defaults", () => {
  expect(typeof skills.profileSkillSuggestions).toBe("function");
  const d = fixture(),
    rows = skills.profileSkillSuggestions(d);
  expect(rows).toHaveLength(2);
  expect(rows.find((r) => r.label === "SQL")?.sources).toHaveLength(2);
  expect(rows.find((r) => r.label === "SQL")?.selected).toBe(true);
  expect(rows.find((r) => r.label === "Financial reporting")?.selected).toBe(
    true,
  );
});
it("one confirmation preserves existing skills and applies selected rows without references", () => {
  const d = fixture();
  d.professionalSkills.push(fact("Communication"));
  const before = structuredClone(d);
  const next = skills.acceptProfileSkills(d, skills.profileSkillSuggestions(d));
  expect(next.technicalSkills.map((f) => f.value)).toEqual(["SQL"]);
  expect(next.technicalSkills[0].skillEvidence).toBeUndefined();
  expect(next.professionalSkills.map((f) => f.value)).toEqual([
    "Communication",
    "Financial reporting",
  ]);
  expect(d).toEqual(before);
  expect(
    skills.profileSkillSuggestions(next).map((s) => s.label),
  ).not.toContain("SQL");
});
it("stale evidence excludes suggestions and cannot be confirmed from a captured review", () => {
  const d = fixture(),
    rows = skills.profileSkillSuggestions(d);
  d.roles[0].context.value = "Different work.";
  d.roles[1].context.value = "Different work.";
  expect(skills.profileSkillSuggestions(d)).toHaveLength(0);
  expect(() => skills.acceptProfileSkills(d, rows)).toThrow(/STALE/);
});
it("a later duplicate cannot override an explicit deselection, in either entry order", () => {
  let d = fixture();
  const later = d.experienceEnrichment![d.roles[1].id];
  delete d.experienceEnrichment![d.roles[1].id];
  const row = skills.profileSkillSuggestions(d).find((r) => r.label === "SQL")!;
  d = skills.setProfileSkillChoice(d, row, { selected: false });
  d.experienceEnrichment![d.roles[1].id] = later;
  expect(
    skills.profileSkillSuggestions(d).find((r) => r.label === "SQL")?.selected,
  ).toBe(false);
  d.roles.reverse();
  expect(
    skills.profileSkillSuggestions(d).find((r) => r.label === "SQL")?.selected,
  ).toBe(false);
});
it("deduplicates when the user renames two selected suggestions to the same skill", () => {
  const d = fixture();
  d.roles[0].context.sourceId = "source-one";
  d.roles[1].context.sourceId = "source-two";
  for (const role of d.roles)
    d.experienceEnrichment![role.id].skillsIdentity = experienceIdentity(
      d,
      role.id,
    );
  d.experienceEnrichment![d.roles[0].id].skills!.skills =
    d.experienceEnrichment![d.roles[0].id].skills!.skills.slice(0, 1);
  d.experienceEnrichment![d.roles[1].id].skills!.skills =
    d.experienceEnrichment![d.roles[1].id].skills!.skills.slice(1);
  const rows = skills
    .profileSkillSuggestions(d)
    .map((r) => ({ ...r, label: "SQL", selected: true }));
  const next = skills.acceptProfileSkills(d, rows);
  expect([...next.technicalSkills, ...next.professionalSkills]).toHaveLength(1);
  expect(next.technicalSkills[0].skillEvidence).toBeUndefined();
});

it("adds short supported keywords directly, retains existing skills and explicit exclusions, and never repeats removed keywords", () => {
  let d = fixture();
  d.professionalSkills.push(fact("Communication"));
  const rows = skills.profileSkillSuggestions(d);
  d = skills.setProfileSkillChoice(
    d,
    rows.find((row) => row.label === "SQL")!,
    { selected: false },
  );
  const next = skills.addProfileSkillKeywords(d);
  expect(next.technicalSkills).toEqual([]);
  expect(next.professionalSkills.map((f) => f.value)).toEqual([
    "Communication",
    "Financial reporting",
  ]);
  expect(next.roles).toEqual(d.roles);
  expect(skills.addProfileSkillKeywords(next)).toEqual(next);
  next.professionalSkills = next.professionalSkills.filter(
    (f) => f.value !== "Financial reporting",
  );
  expect(
    skills.addProfileSkillKeywords(next).professionalSkills.map((f) => f.value),
  ).toEqual(["Communication"]);
});
it("accepts structurally valid labels without a second semantic filter", () => {
  const d = fixture();
  for (const role of d.roles)
    d.experienceEnrichment![role.id].skills!.skills[1].label =
      "Preparing recurring financial reports for the team";
  const next = skills.addProfileSkillKeywords(d);
  expect(next.technicalSkills.map((f) => f.value)).toEqual(["SQL"]);
  expect(next.professionalSkills.map((f) => f.value)).toEqual([
    "Preparing recurring financial reports for the team",
  ]);
  expect(next.roles).toEqual(d.roles);
});
it("keeps a removed keyword excluded when a different experience suggests it later", () => {
  const d = fixture(),
    first = d.roles[0],
    second = d.roles[1];
  const later = d.experienceEnrichment![second.id];
  delete d.experienceEnrichment![second.id];
  const added = skills.addProfileSkillKeywords(d);
  added.technicalSkills = [];
  added.experienceEnrichment![second.id] = later;
  expect(skills.addProfileSkillKeywords(added).technicalSkills).toEqual([]);
});
it("keeps accumulated exclusions and new keywords valid for autosave", async () => {
  const { encodeDraft, decodeDraft } =
    await import("@resumora/contracts/editor/transport");
  const d = fixture(),
    state = d.experienceEnrichment![d.roles[0].id];
  state.skillChoices = Object.fromEntries(
    Array.from({ length: 30 }, (_, i) => [
      `excluded-${i}`,
      {
        selected: false,
        dismissed: true,
        label: `Prior skill ${i}`,
        category: "professionalSkills" as const,
      },
    ]),
  );
  const next = skills.addProfileSkillKeywords(d);
  expect(() => decodeDraft(encodeDraft(next))).not.toThrow();
  expect(
    Object.values(
      next.experienceEnrichment![d.roles[0].id].skillChoices!,
    ).filter((c) => c.label.startsWith("Prior skill")),
  ).toHaveLength(30);
});

it("caps each category at 20 and ranks core skills from later roles before incidental ones", () => {
  const d = fixture();
  for (const [i, role] of d.roles.entries()) {
    d.experienceEnrichment![role.id].skills!.skills = Array.from(
      { length: 30 },
      (_, j) => ({
        id: `t${j}`,
        label: `${i ? "Core" : "Incidental"} ${j}`,
        category: "technicalSkills" as const,
        evidence: role.context.value,
        factIds: [role.context.id],
        basis: "inferred" as const,
        importance: i ? ("core" as const) : ("supporting" as const),
        rationale: "A demonstrated reusable capability.",
      }),
    );
  }
  d.professionalSkills = [fact("Communication")];
  const next = skills.addProfileSkillKeywords(d);
  expect(next.technicalSkills).toHaveLength(20);
  expect(next.skillReserves!.technicalSkills).toHaveLength(40);
  expect(next.technicalSkills.every((f) => f.value.startsWith("Core"))).toBe(
    true,
  );
  expect(next.professionalSkills).toEqual(d.professionalSkills);
});
it("preserves existing identities and over-limit legacy data while preventing extra automatic additions", () => {
  const d = fixture();
  d.technicalSkills = Array.from({ length: 31 }, (_, i) =>
    fact(`Existing ${i}`),
  );
  const next = skills.addProfileSkillKeywords(d);
  expect(next.technicalSkills).toEqual(d.technicalSkills);
  expect(next.professionalSkills.map((f) => f.value)).toEqual([
    "Financial reporting",
  ]);
  d.technicalSkills = d.technicalSkills.slice(0, 19);
  expect(skills.addProfileSkillKeywords(d).technicalSkills).toHaveLength(20);
});
it("deduplicates multilingual aliases and respects synonym exclusions without merging distinct skills", () => {
  const d = fixture(),
    role = d.roles[0],
    state = d.experienceEnrichment![role.id];
  state.skills!.skills = [
    {
      ...state.skills!.skills[0],
      id: "req",
      label: "Requirements Analysis",
      category: "professionalSkills",
    },
    { ...state.skills!.skills[0], id: "validation", label: "Data Validation" },
    state.skills!.skills[0],
  ];
  d.professionalSkills = [fact("Analiza cerințelor")];
  state.skillChoices = {
    old: {
      selected: false,
      label: "Validation des données",
      category: "technicalSkills",
    },
  };
  const next = skills.addProfileSkillKeywords(d);
  expect(next.technicalSkills.map((f) => f.value)).toEqual(["SQL"]);
  expect(
    next.professionalSkills.filter(
      (f) =>
        skills.skillKey(f.value) === skills.skillKey("Requirements Analysis"),
    ),
  ).toHaveLength(1);
});
it("legacy experience acceptance respects capacity without storing references", async () => {
  const { applyExperienceSkills } = await import("./experience");
  const d = fixture(),
    r = d.roles[0],
    s = d.experienceEnrichment![r.id].skills!.skills[0];
  d.technicalSkills = Array.from({ length: 30 }, (_, i) =>
    fact(`Existing ${i}`),
  );
  expect(
    applyExperienceSkills(d, r.id, [s], {
      [s.id]: { selected: true, label: s.label, category: s.category },
    }).technicalSkills,
  ).toEqual(d.technicalSkills);
  d.technicalSkills = [];
  const next = applyExperienceSkills(d, r.id, [s], {
    [s.id]: { selected: true, label: s.label, category: s.category },
  });
  expect(next.technicalSkills[0].skillEvidence).toBeUndefined();
});

it("deleting a skill removes active and reserve synonyms and prevents rediscovery", () => {
  const d = fixture();
  const f = fact("SQL");
  d.technicalSkills = [f, fact("Excel")];
  d.skillReserves = {
    technicalSkills: [fact("Structured Query Language")],
    professionalSkills: [fact("Negotiation")],
  };
  const next = skills.removeProfileSkill(d, f.id);
  expect(next.technicalSkills.map((f) => f.value)).toEqual(["Excel"]);
  expect(next.skillReserves!.technicalSkills).toEqual([]);
  expect(next.skillReserves!.professionalSkills[0].value).toBe("Negotiation");
  expect(
    skills.addProfileSkillKeywords(next).technicalSkills.map((f) => f.value),
  ).toEqual(["Excel"]);
  expect(d.technicalSkills).toHaveLength(2);
});
