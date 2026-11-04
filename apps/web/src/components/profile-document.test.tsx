import { StrictMode, useState } from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ProfileDocument } from "./ProfileDocument";
import { LanguageContext } from "./ui";
import { blankDraft, fact, newRole, type BaseDraft } from "../base/model";
import { careerContext } from "@resumora/contracts/intelligence/context";
import { acceptWording, currentWording } from "../base/wording";
import { ProfileOverview } from "./ProfileOverview";
import { Enrichment } from "./Enrichment";

function fixture() {
  const d = blankDraft();
  d.name = fact("Alex Morgan");
  d.nameParts = { first: "Alex", last: "Morgan" };
  d.language = "en";
  d.contacts[0].value = fact("alex@example.com");
  const r = newRole();
  r.title = fact("Analyst");
  r.company = fact("Example");
  r.start = fact({ year: "2022", month: "" });
  r.ongoing = fact(true);
  r.context = fact("Prepared reports.");
  r.bullets = [fact("Maintained SQL queries.")];
  d.roles = [r];
  return d;
}
it("keeps reserve skills private while leaving the skills section actions available", () => {
  const d = fixture();
  d.skillReserves = {
    technicalSkills: [fact("Hidden reserve Python")],
    professionalSkills: [],
  };
  render(
    <LanguageContext value="en">
      <ProfileDocument draft={d} change={() => {}} openEnrichment={() => {}} />
    </LanguageContext>,
  );
  expect(screen.queryByText(/Manage skill inventory/)).toBeNull();
  expect(screen.queryByDisplayValue("Hidden reserve Python")).toBeNull();
  expect(screen.queryByText("Hidden reserve Python")).toBeNull();
  expect(screen.getByRole("button", { name: "Improve skills" })).toBeTruthy();
});
function harness(
  initial = fixture(),
  summarize?: (id: string) => Promise<any>,
) {
  let latest = initial;
  function Surface() {
    const [d, set] = useState(initial);
    return (
      <LanguageContext value="en">
        <ProfileDocument
          draft={d}
          summarize={summarize}
          aiReady
          change={(next) => {
            latest = next;
            set(next);
          }}
        />
      </LanguageContext>
    );
  }
  const view = render(<Surface />);
  return { ...view, latest: () => latest };
}
it("edits one fact without overwriting unrelated career data, and Escape restores the field", () => {
  const initial = fixture(),
    v = harness(initial);
  fireEvent.click(screen.getByRole("button", { name: "Edit: Email" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Email" }), {
    target: { value: "changed@example.com" },
  });
  expect(v.latest().contacts[0].value.value).toBe("changed@example.com");
  expect(v.latest().roles).toEqual(initial.roles);
  expect(v.latest().contacts[0].value.previousFactId).toBe(
    initial.contacts[0].value.id,
  );
  fireEvent.keyDown(screen.getByRole("textbox", { name: "Email" }), {
    key: "Escape",
  });
  expect(v.latest().contacts[0].value.value).toBe("alex@example.com");
});
it("keeps empty CV sections visible and completes them in place without a second editor", async () => {
  const initial = blankDraft();
  initial.optionalSections.push({
    id: "projects",
    kind: "projects",
    label: "",
    entries: [],
  });
  const v = harness(initial);
  for (const name of [
    "Professional summary",
    "Professional experience",
    "Education",
    "Skills",
    "Languages",
    "Certifications",
    "Projects",
  ])
    expect(screen.getByRole("heading", { name })).toBeTruthy();
  expect(v.latest()).toEqual(initial); // Reading placeholders creates no saved facts.
  expect(screen.queryByText("Manage profile sections and details")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Add language" }));
  const language = await screen.findByRole("textbox", { name: "Language" });
  fireEvent.change(language, { target: { value: "Romanian" } });
  fireEvent.keyDown(language, { key: "Enter" });
  fireEvent.click(screen.getByRole("button", { name: "Edit: Proficiency" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Proficiency" }), {
    target: { value: "Native" },
  });
  fireEvent.keyDown(screen.getByRole("textbox", { name: "Proficiency" }), {
    key: "Enter",
  });
  fireEvent.click(screen.getByRole("button", { name: "Add certification" }));
  const title = await screen.findByRole("textbox", { name: "Title" });
  fireEvent.change(title, { target: { value: "Cloud certification" } });
  fireEvent.keyDown(title, { key: "Enter" });
  const saved = v.latest();
  expect(
    saved.optionalSections.find((s) => s.kind === "languages")?.entries[0]
      .proficiency?.value,
  ).toBe("Native");
  expect(
    saved.optionalSections.find((s) => s.kind === "certifications")?.entries[0]
      .title.value,
  ).toBe("Cloud certification");
  expect(saved.presentation.order).toContain("certifications");
  v.unmount();
  harness(saved);
  expect(screen.getByText("Cloud certification", { exact: true })).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Projects" })).toBeTruthy();
});
it("keeps year-only precision and removes stale name parts after a full-name correction", () => {
  const v = harness();
  fireEvent.click(screen.getByRole("button", { name: "Edit: Start" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Start" }), {
    target: { value: "2021" },
  });
  fireEvent.keyDown(screen.getByRole("textbox", { name: "Start" }), {
    key: "Enter",
  });
  expect(v.latest().roles[0].start.value).toEqual({ year: "2021", month: "" });
  fireEvent.click(screen.getByRole("button", { name: "Edit: Name" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Name" }), {
    target: { value: "Alex Taylor" },
  });
  expect(v.latest().nameParts).toBeUndefined();
  expect(v.latest().name.value).toBe("Alex Taylor");
});
it("edits accepted wording separately from original evidence and keeps list structure", () => {
  let d = fixture();
  const role = d.roles[0];
  d = acceptWording(d, role.id, {
    text: "Prepared reports.\n\n- Maintained SQL queries.",
    sources: careerContext(d, role.id).facts,
    scope: "experience",
    origin: "ai_generated",
  });
  const v = harness(d),
    region = screen.getByRole("region", { name: "Analyst" });
  expect(within(region).getByRole("list")).toBeTruthy();
  fireEvent.click(
    within(region).getByRole("button", { name: "Edit: Experience wording" }),
  );
  fireEvent.change(
    screen.getByRole("textbox", { name: "Experience wording" }),
    {
      target: {
        value: "My revised introduction.\n\n- Maintained SQL queries.",
      },
    },
  );
  expect(currentWording(v.latest(), role.id)).toContain(
    "My revised introduction.",
  );
  expect(v.latest().roles).toEqual(d.roles);
  expect(v.latest().presentation.approvedWording?.[role.id].origin).toBe(
    "user_authored",
  );
});
it.each([false, true])(
  "generates questions once after an explicit action, and never merely on a resumed role (resumed=%s)",
  async (resumed) => {
    const initial = fixture(),
      role = initial.roles[0];
    const questions = vi.fn(async () => ({
      schemaVersion: "career-question-plan/1" as const,
      targetId: role.id,
      questions: [
        {
          id: "q",
          dimension: "ownership" as const,
          text: "What did you personally do?",
          why: "Clarify your contribution.",
          selectionMode: "single" as const,
          options: [],
        },
      ],
    }));
    function Surface() {
      const [d, change] = useState(initial),
        [target, setTarget] = useState<string | undefined>(
          resumed ? role.id : undefined,
        );
      return (
        <LanguageContext value="en">
          <ProfileOverview
            draft={d}
            change={change}
            editor={null}
            enrichTarget={target}
            openEnrichment={setTarget}
            closeEnrichment={() => setTarget(undefined)}
            enrich={(id) => (
              <Enrichment
                autoStart
                draft={d}
                change={change}
                selectedTargetId={id}
                embedded
                goEdit={() => {}}
                asOf={{ year: "2026", month: "10" }}
                prepareQuestions={questions}
                rewriteRole={async () => {
                  throw Error("Not requested");
                }}
              />
            )}
          />
        </LanguageContext>
      );
    }
    render(
      <StrictMode>
        <Surface />
      </StrictMode>,
    );
    expect(questions).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", {
        name: resumed ? "Start questions" : "Improve this experience",
      }),
    );
    await screen.findByRole("textbox", { name: "What did you personally do?" });
    await waitFor(() => expect(questions).toHaveBeenCalledTimes(1));
  },
);
it("places professional and technical skills after personal details while preserving export order", () => {
  const initial = fixture();
  const order = [...initial.presentation.order];
  const view = harness(initial);
  const sections = Array.from(
    view.container.querySelectorAll("article > section"),
  ).map((e) => e.id);
  expect(sections.slice(0, 4)).toEqual([
    "profile-personal",
    "profile-skills",
    "profile-summary",
    "profile-experience",
  ]);
  expect(
    Array.from(view.container.querySelectorAll(".profile-skills-label")).map(
      (e) => e.textContent,
    ),
  ).toEqual(["Professional", "Technical"]);
  expect(view.latest().presentation.order).toEqual(order);
});
it("generates an empty role introduction from evidence, keeps bullets, and saves an editable accepted description", async () => {
  const initial = fixture();
  initial.roles[0].context.value = "";
  const role = initial.roles[0];
  const summarize = vi.fn(async () => ({
    schemaVersion: "career-role-rewrite/1",
    targetId: role.id,
    text: "Maintained SQL reports. Checked the queries used for reporting. Supported the reporting workflow.",
    factIds: [role.bullets[0].id],
    warnings: [],
  }));
  const h = harness(initial, summarize);
  fireEvent.click(
    screen.getByRole("button", { name: "Generate role summary with AI" }),
  );
  await screen.findByRole("button", { name: "Accept changes" });
  expect(h.latest().roles[0].context.value).toBe("");
  fireEvent.click(screen.getByRole("button", { name: "Accept changes" }));
  expect(h.latest().roles[0].context.value).toContain(
    "Maintained SQL reports.",
  );
  expect(h.latest().roles[0].bullets).toEqual(role.bullets);
  fireEvent.click(
    screen.getByRole("button", { name: "Edit: Role description" }),
  );
  fireEvent.change(screen.getByRole("textbox", { name: "Role description" }), {
    target: { value: "Maintained SQL reporting queries." },
  });
  const { MemoryBaseCvAdapter } = await import("../base/adapter");
  const adapter = new MemoryBaseCvAdapter();
  await adapter.save({
    draft: h.latest(),
    requestId: crypto.randomUUID(),
    expectedRevision: 0,
    mode: "autosave",
  });
  expect((await adapter.load())!.draft.roles[0].context.value).toBe(
    "Maintained SQL reporting queries.",
  );
  expect((await adapter.load())!.draft.roles[0].bullets).toEqual(role.bullets);
});
it("does not replace a description typed while AI generation is in flight", async () => {
  const initial = fixture();
  initial.roles[0].context.value = "";
  const role = initial.roles[0];
  let finish!: (p: any) => void;
  const h = harness(
    initial,
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Generate role summary with AI" }),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Edit: Role description" }),
  );
  fireEvent.change(screen.getByRole("textbox", { name: "Role description" }), {
    target: { value: "My own introduction." },
  });
  finish({
    schemaVersion: "career-role-rewrite/1",
    targetId: role.id,
    text: "Maintained SQL reports.",
    factIds: [role.bullets[0].id],
    warnings: [],
  });
  await waitFor(() =>
    expect(h.latest().roles[0].context.value).toBe("My own introduction."),
  );
  expect(h.latest().roles[0].bullets).toEqual(role.bullets);
});
it("merges a generated summary with unrelated edits made while it was processing", async () => {
  const initial = fixture();
  initial.roles[0].context.value = "";
  const role = initial.roles[0];
  let finish!: (p: any) => void;
  const h = harness(
    initial,
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Generate role summary with AI" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Edit: Email" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Email" }), {
    target: { value: "updated@example.com" },
  });
  await act(async () =>
    finish({
      schemaVersion: "career-role-rewrite/1",
      targetId: role.id,
      text: "Maintained SQL queries.",
      factIds: [role.bullets[0].id],
      warnings: [],
    }),
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "Accept changes" }),
  );
  expect(h.latest().contacts[0].value.value).toBe("updated@example.com");
  expect(h.latest().roles[0].context.value).toBe("Maintained SQL queries.");
});

it("offers one combined skills action and deletes an individual skill without changing experience", () => {
  const initial = fixture();
  initial.technicalSkills = [fact("SQL"), fact("Excel")];
  const v = harness(initial);
  fireEvent.click(screen.getByRole("button", { name: "Delete skill: SQL" }));
  expect(v.latest().technicalSkills.map((f) => f.value)).toEqual(["Excel"]);
  expect(v.latest().roles).toEqual(initial.roles);
  expect(v.latest().skillExclusions).toEqual(["sql"]);
  v.unmount();
  const open = vi.fn();
  render(
    <LanguageContext value="en">
      <ProfileDocument
        draft={initial}
        change={() => {}}
        openEnrichment={open}
      />
    </LanguageContext>,
  );
  expect(
    screen.queryByRole("button", { name: "Add skills from experience" }),
  ).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Improve skills" }));
  expect(open).toHaveBeenCalledWith("__improve_skills");
});
it("displays skills without source controls even when historical metadata exists", () => {
  const d = fixture();
  d.technicalSkills = [{ ...fact("SQL"), skillOrigin: "experience", skillEvidence: [{targetId:"old",factIds:["old"],quote:"Old reference"}] }];
  harness(d);
  expect(screen.getByRole("button", {name: "Edit: Skill T1"})).toBeTruthy();
  expect(screen.queryByRole("button", {name: /Source for/})).toBeNull();
  expect(screen.queryByRole("tooltip")).toBeNull();
});
