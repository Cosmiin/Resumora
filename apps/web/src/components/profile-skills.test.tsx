import { useState, StrictMode } from "react";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import { it, expect, vi, beforeEach } from "vitest";
import { webcrypto } from "node:crypto";
import { blankDraft, newRole, fact } from "../base/model";
import { ProfileSkillsReview } from "./ProfileSkillsReview";
import { LanguageContext } from "./ui";
import { clone, type BaseDraft } from "../base/model";
import {
  experienceIdentity,
  experienceFingerprint,
} from "@resumora/contracts/intelligence/experience";
beforeEach(() =>
  Object.defineProperty(crypto, "subtle", {
    configurable: true,
    value: webcrypto.subtle,
  }),
);
it("adds concise keywords on entry without a dialog or confirmation and retains success after another role fails", async () => {
  Object.defineProperty(crypto, "subtle", {
    configurable: true,
    value: webcrypto.subtle,
  });
  const initial = blankDraft();
  initial.language = "en";
  initial.roles = [newRole(), newRole()];
  for (const [i, r] of initial.roles.entries()) {
    r.title = fact(`Role ${i}`);
    r.context = fact("Used SQL to prepare financial reports.");
  }
  let latest = initial,
    active = 0,
    maxActive = 0;
  const request = vi.fn(async (c: any) => {
    active++;
    maxActive = Math.max(maxActive, active);
    await Promise.resolve();
    active--;
    if (c.targetId === initial.roles[1].id) throw Error("AI_REQUEST_FAILED");
    return {
      schemaVersion: "experience-assistant/1" as const,
      extractionVersion: "skills-inventory/2" as const,
      intent: "skills" as const,
      targetId: c.targetId,
      fingerprint: c.experience.fingerprint,
      skills: [
        {
          id: "sql",
          label: "SQL",
          category: "technicalSkills" as const,
          evidence: "Used SQL",
          factIds: [initial.roles[0].context.id],
        },
        {
          id: "report",
          label: "Financial reporting",
          category: "professionalSkills" as const,
          evidence: "financial reports",
          factIds: [initial.roles[0].context.id],
        },
      ],
    };
  });
  function Harness() {
    const [d, set] = useState(initial);
    latest = d;
    return (
      <LanguageContext value="en">
        <ProfileSkillsReview
          draft={d}
          targetId="__skills"
          change={set}
          ready
          saveFailed={false}
          request={request}
        />
      </LanguageContext>
    );
  }
  render(
    <StrictMode>
      <Harness />
    </StrictMode>,
  );
  await waitFor(() =>
    expect(latest.technicalSkills.map((f) => f.value)).toEqual(["SQL"]),
  );
  await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
  expect(maxActive).toBe(1);
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.queryByRole("checkbox")).toBeNull();
  expect(latest.professionalSkills.map((f) => f.value)).toEqual([
    "Financial reporting",
  ]);
  expect(latest.roles).toEqual(initial.roles);
});

function skillDraft() {
  const d = blankDraft(),
    r = newRole();
  d.language = "en";
  r.title = fact("Analyst");
  r.context = fact("Used SQL to prepare financial reports.");
  d.roles = [r];
  return d;
}
function skillResult(d: BaseDraft, fingerprint: string, label = "SQL") {
  return {
    extractionVersion: "skills-inventory/2" as const,
    schemaVersion: "experience-assistant/1" as const,
    intent: "skills" as const,
    targetId: d.roles[0].id,
    fingerprint,
    skills: [
      {
        id: "sql",
        label,
        category: "technicalSkills" as const,
        evidence: "Used SQL",
        factIds: [d.roles[0].context.id],
      },
    ],
  };
}
function mountSkills(initial: BaseDraft, request: any, initialReady = true) {
  let latest = initial,
    edit!: (d: BaseDraft) => void,
    saved!: (ready: boolean) => void;
  function Harness() {
    const [d, set] = useState(initial),
      [ready, setReady] = useState(initialReady);
    latest = d;
    edit = set;
    saved = setReady;
    const discovery = () => (
      <ProfileSkillsReview
        draft={d}
        targetId="__skills"
        change={set}
        ready={ready}
        saveFailed={false}
        request={request}
      />
    );
    return <LanguageContext value="en">{discovery()}</LanguageContext>;
  }
  return {
    ...render(
      <StrictMode>
        <Harness />
      </StrictMode>,
    ),
    latest: () => latest,
    edit: (d: BaseDraft) => act(() => edit(d)),
    saved: () => act(() => saved(true)),
  };
}
it("adds a current cached keyword without another AI request", async () => {
  const d = skillDraft(),
    r = d.roles[0];
  d.experienceEnrichment = {
    [r.id]: {
      version: 1,
      skillsIdentity: experienceIdentity(d, r.id),
      skills: skillResult(d, await experienceFingerprint(d, r.id)),
    },
  };
  const request = vi.fn(),
    h = mountSkills(d, request);
  await waitFor(() =>
    expect(h.latest().technicalSkills.map((f) => f.value)).toEqual(["SQL"]),
  );
  expect(request).not.toHaveBeenCalled();
});
it("refreshes old verbose suggestions instead of inserting or truncating them", async () => {
  const d = skillDraft(),
    r = d.roles[0];
  d.experienceEnrichment = {
    [r.id]: {
      version: 1,
      skillsIdentity: experienceIdentity(d, r.id),
      skills: skillResult(
        d,
        await experienceFingerprint(d, r.id),
        "Using SQL to prepare recurring financial reports",
      ),
    },
  };
  d.experienceEnrichment![r.id].skills!.extractionVersion = "skills-inventory/1";
  const request = vi.fn(async (c: any) =>
      skillResult(d, c.experience.fingerprint),
    ),
    h = mountSkills(d, request);
  await waitFor(() =>
    expect(h.latest().technicalSkills.map((f) => f.value)).toEqual(["SQL"]),
  );
  expect(request).toHaveBeenCalledTimes(1);
});
it("waits for save before new inference and merges results with intervening edits", async () => {
  const d = skillDraft();
  let resolve!: (value: any) => void;
  const request = vi.fn(() => new Promise<any>((r) => (resolve = r))),
    h = mountSkills(d, request, false);
  await waitFor(() =>
    expect(
      h.latest().experienceEnrichment?.[d.roles[0].id]?.pending,
    ).toBeTruthy(),
  );
  expect(request).not.toHaveBeenCalled();
  h.saved();
  await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  const next = clone(h.latest());
  next.professionalSkills.push(fact("Communication"));
  h.edit(next);
  await act(async () =>
    resolve(skillResult(d, await experienceFingerprint(d, d.roles[0].id))),
  );
  await waitFor(() =>
    expect(h.latest().technicalSkills.map((f) => f.value)).toEqual(["SQL"]),
  );
  expect(h.latest().professionalSkills.map((f) => f.value)).toEqual([
    "Communication",
  ]);
});
it("recovers an existing skills receipt without sending a second inference request", async () => {
  const d = skillDraft(),
    r = d.roles[0],
    fingerprint = await experienceFingerprint(d, r.id);
  d.experienceEnrichment = {
    [r.id]: {
      version: 1,
      pending: {
        id: "existing-operation",
        request: { intent: "skills", fingerprint, feedbackLocale: "en" },
      },
    },
  };
  const request = vi.fn(async (_context: any, _recover?: boolean) =>
      skillResult(d, fingerprint),
    ),
    h = mountSkills(d, request);
  await waitFor(() =>
    expect(h.latest().technicalSkills.map((f) => f.value)).toEqual(["SQL"]),
  );
  expect(request).toHaveBeenCalledTimes(1);
  expect(request.mock.calls[0][0].operationId).toBe("existing-operation");
  expect(request.mock.calls[0][1]).toBe(true);
});
it("ignores a result after unmount and preserves the current skills", async () => {
  const d = skillDraft();
  let resolve!: (value: any) => void;
  const request = vi.fn(() => new Promise<any>((r) => (resolve = r))),
    h = mountSkills(d, request);
  await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  h.unmount();
  await act(async () =>
    resolve(skillResult(d, await experienceFingerprint(d, d.roles[0].id))),
  );
  expect(h.latest().technicalSkills).toEqual([]);
});
it("starts a deferred entry when its existing review finishes, without another click", async () => {
  const d = skillDraft(),
    r = d.roles[0],
    fingerprint = await experienceFingerprint(d, r.id);
  d.experienceEnrichment = {
    [r.id]: {
      version: 1,
      pending: {
        id: "role-operation",
        request: { intent: "role", fingerprint, feedbackLocale: "en" },
      },
    },
  };
  const request = vi.fn(async (_context: any, _recover?: boolean) =>
      skillResult(d, fingerprint),
    ),
    h = mountSkills(d, request);
  await screen.findByText("Some experiences have unfinished reviews.");
  expect(request).not.toHaveBeenCalled();
  const next = clone(h.latest());
  delete next.experienceEnrichment![r.id].pending;
  h.edit(next);
  await waitFor(() =>
    expect(h.latest().technicalSkills.map((f) => f.value)).toEqual(["SQL"]),
  );
  expect(request).toHaveBeenCalledTimes(1);
});
it("preserves a rejected keyword when verbose cached results are regenerated with new suggestion IDs", async () => {
  const d = skillDraft(),
    r = d.roles[0],
    fingerprint = await experienceFingerprint(d, r.id);
  const result = skillResult(d, fingerprint);
  result.skills.push({
    ...result.skills[0],
    id: "verbose",
    label: "Using SQL to prepare recurring financial reports",
  });
  d.experienceEnrichment = {
    [r.id]: {
      version: 1,
      skillsIdentity: experienceIdentity(d, r.id),
      skills: {...result, extractionVersion: "skills-inventory/1"},
      skillChoices: {
        sql: { selected: false, label: "SQL", category: "technicalSkills" },
      },
    },
  };
  const request = vi.fn(async () => ({
    ...skillResult(d, fingerprint),
    skills: [{ ...result.skills[0], id: "new-sql" }],
  }));
  const h = mountSkills(d, request);
  await screen.findByText("No new skills to add.");
  expect(request).toHaveBeenCalledTimes(1);
  expect(h.latest().technicalSkills).toEqual([]);
});
it("refreshes short legacy cached suggestions once for the new extraction policy", async () => {
  const d = skillDraft(),
    r = d.roles[0];
  const { extractionVersion: _, ...legacy } = skillResult(
    d,
    await experienceFingerprint(d, r.id),
  );
  d.experienceEnrichment = {
    [r.id]: {
      version: 1,
      skillsIdentity: experienceIdentity(d, r.id),
      skills: legacy,
    },
  };
  const request = vi.fn(async (c: any) =>
    skillResult(d, c.experience.fingerprint),
  );
  const h = mountSkills(d, request);
  await waitFor(() =>
    expect(
      h.latest().experienceEnrichment![r.id].skills?.extractionVersion,
    ).toBe("skills-inventory/2"),
  );
  await waitFor(() =>
    expect(h.latest().technicalSkills.map((f) => f.value)).toEqual(["SQL"]),
  );
  expect(request).toHaveBeenCalledTimes(1);
});
it("waits for later roles before filling category capacity and automatically inserts the strongest inventory", async () => {
  const d = skillDraft(),
    later = newRole();
  later.context = fact("Used SQL to prepare financial reports.");
  d.roles.push(later);
  let finish!: (value: any) => void;
  const response = (id: string, fingerprint: string, core: boolean) => ({
    schemaVersion: "experience-assistant/1",
    intent: "skills",
    extractionVersion: "skills-inventory/2",
    targetId: id,
    fingerprint,
    skills: Array.from({ length: 30 }, (_, i) => ({
      id: `skill-${i}`,
      label: `${core ? "Core" : "Incidental"} ${i}`,
      category: "technicalSkills",
      basis: "inferred",
      importance: core ? "core" : "supporting",
      rationale: "Demonstrated implementation capability.",
      evidence: "Used SQL",
      factIds: [d.roles.find((r) => r.id === id)!.context.id],
    })),
  });
  const request = vi.fn(async (c: any) =>
    c.targetId === later.id
      ? new Promise((resolve) => (finish = resolve))
      : response(c.targetId, c.experience.fingerprint, false),
  );
  const h = mountSkills(d, request);
  await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
  expect(h.latest().technicalSkills).toEqual([]);
  await act(async () =>
    finish(response(later.id, await experienceFingerprint(d, later.id), true)),
  );
  await waitFor(() => expect(h.latest().technicalSkills).toHaveLength(20));
  expect(
    h.latest().technicalSkills.every((f) => f.value.startsWith("Core")),
  ).toBe(true);
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("keeps category capacity available for a role deferred behind an unfinished review", async () => {
  const d = skillDraft(),
    later = newRole();
  later.context = fact("Used SQL to prepare financial reports.");
  d.roles.push(later);
  d.experienceEnrichment = {
    [later.id]: {
      version: 1,
      pending: {
        id: "unfinished-review",
        request: {
          intent: "role",
          fingerprint: await experienceFingerprint(d, later.id),
        },
      },
    },
  };
  const request = vi.fn(async (c: any) => ({
    schemaVersion: "experience-assistant/1",
    intent: "skills",
    extractionVersion: "skills-inventory/2",
    targetId: c.targetId,
    fingerprint: c.experience.fingerprint,
    skills: Array.from({ length: 30 }, (_, i) => ({
      id: `skill-${i}`,
      label: `${c.targetId === later.id ? "Core" : "Incidental"} ${i}`,
      category: "technicalSkills",
      basis: "inferred",
      importance: c.targetId === later.id ? "core" : "supporting",
      rationale: "Demonstrated implementation capability.",
      evidence: "Used SQL",
      factIds: [d.roles.find((r) => r.id === c.targetId)!.context.id],
    })),
  }));
  const h = mountSkills(d, request);
  await screen.findByText("Some experiences have unfinished reviews.");
  await waitFor(() =>
    expect(h.latest().experienceEnrichment![d.roles[0].id].skills).toBeTruthy(),
  );
  await waitFor(() =>
    expect(
      (
        screen.getByRole("button", {
          name: "Add skills from experience",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false),
  );
  await act(async () => {
    await Promise.resolve();
  });
  expect(h.latest().technicalSkills).toEqual([]);
  const next = clone(h.latest());
  delete next.experienceEnrichment![later.id].pending;
  h.edit(next);
  await waitFor(() => expect(h.latest().technicalSkills).toHaveLength(20));
  expect(
    h.latest().technicalSkills.every((f) => f.value.startsWith("Core")),
  ).toBe(true);
});

it("does not refill a category automatically after the user removes a skill from a completed batch", async () => {
  const d = skillDraft(),
    later = newRole();
  later.context = fact("Used SQL to prepare financial reports.");
  d.roles.push(later);
  d.experienceEnrichment = {};
  for (const [index, r] of d.roles.entries())
    d.experienceEnrichment[r.id] = {
      version: 1,
      skillsIdentity: experienceIdentity(d, r.id),
      skills: {
        ...skillResult(d, await experienceFingerprint(d, r.id)),
        targetId: r.id,
        skills: Array.from({ length: index ? 1 : 30 }, (_, i) => ({
          id: `skill-${i}`,
          label: index ? "Overflow" : `Core ${i}`,
          category: "technicalSkills",
          importance: index ? "supporting" : "core",
          basis: "inferred",
          rationale: "Demonstrated technical method.",
          evidence: "Used SQL",
          factIds: [r.context.id],
        })),
      },
    };
  const h = mountSkills(d, vi.fn());
  await waitFor(() => expect(h.latest().technicalSkills).toHaveLength(20));
  const next = clone(h.latest());
  next.technicalSkills.pop();
  h.edit(next);
  await act(async () => {
    await Promise.resolve();
  });
  expect(h.latest().technicalSkills).toHaveLength(19);
  expect(h.latest().technicalSkills.some((f) => f.value === "Overflow")).toBe(
    false,
  );
});
it("does not apply legacy suggestions when their policy refresh fails", async () => {
  const d = skillDraft(),
    r = d.roles[0];
  const { extractionVersion: _, ...legacy } = skillResult(
    d,
    await experienceFingerprint(d, r.id),
    "Requirements Analysis",
  );
  d.experienceEnrichment = {
    [r.id]: {
      version: 1,
      skillsIdentity: experienceIdentity(d, r.id),
      skills: legacy,
    },
  };
  const h = mountSkills(
    d,
    vi.fn(async () => {
      throw Error("AI_REQUEST_FAILED");
    }),
  );
  await waitFor(() =>
    expect(h.latest().experienceEnrichment![r.id].skillsFailed).toBe(true),
  );
  await act(async () => {
    await Promise.resolve();
  });
  expect(h.latest().technicalSkills).toEqual([]);
  expect(h.latest().experienceEnrichment![r.id].skills).toEqual(legacy);
});
