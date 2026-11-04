import { WorkspaceContext, WorkspaceRegistry } from "../workspace/context";
import { validateWorkspaceValue } from "@resumora/contracts/editor/workspace";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { overviewFields } from "@resumora/contracts/jobs/workflow";
import { JobWorkflowPanel } from "./JobWorkflow";
import { JobsScreen } from "./JobsScreen";
import { LanguageContext } from "./ui";
function context() {
  const requirement = {
    id: "requirement",
    text: "Employer requirement",
    categories: ["technical"],
    priority: "required",
    emphasis: "central",
    operator: "and",
    components: [{ id: "component", text: "Employer requirement" }],
    evidence: [],
    eligibility: false,
    origin: "extracted",
  };
  const vacancy = {
    schemaVersion: "vacancy-extraction/3",
    sourceLocale: "en",
    overview: Object.fromEntries(overviewFields.map((k) => [k, null])),
    requirements: [requirement],
    issues: [],
    completeness: "complete",
  };
  const suggestions = [
    {
      id: "first",
      type: "clarify",
      requirementIds: ["requirement"],
      evidenceIds: [],
      targetId: "role",
      state: "new",
      priority: 1,
      reason: "Clarifiez la première activité.",
      question: "Comment avez-vous utilisé cette méthode ?",
    },
    {
      id: "second",
      type: "verify",
      requirementIds: ["requirement"],
      evidenceIds: [],
      targetId: "role",
      state: "new",
      priority: 2,
      reason: "Vérifiez la deuxième activité.",
      question: "Avez-vous personnellement effectué cette activité ?",
    },
  ];
  const workflow = {
    revision: 1,
    extracted: vacancy,
    reviewed: vacancy,
    duplicates: [],
    sourceParentId: null,
    currentSnapshotId: "snapshot",
    currentSnapshotRevision: 1,
    documentLocale: "fr-CA",
    targetLocale: "fr-CA",
    currentSections: [{ id: "role", label: "Rôle", questionLabel: "ce rôle" }],
    suggestions,
    operations: [
      {
        id: "11111111-1111-4111-8111-111111111111",
        kind: "match",
        state: "ready",
        jobRevision: 1,
        snapshotId: "snapshot",
        snapshotRevision: 1,
        result: {
          schemaVersion: "job-evidence-match/1",
          components: [],
          suggestions,
        },
      },
    ],
  };
  const job = {
    id: crypto.randomUUID(),
    state: "draft",
    versionId: null,
    createdAt: "2026-11-03T00:00:00Z",
    snapshotId: null,
    snapshotRevision: null,
    intake: { text: "Employer requirement" },
    requirements: [],
  };
  return { workflow, job };
}
it("submits the selected owned question identity when two localized suggestions share a requirement", async () => {
  const f = context(),
    writes: any[] = [];
  const transport = vi.fn(async (_path: string, init?: RequestInit) => {
    if (init?.body) {
      writes.push(JSON.parse(String(init.body)));
      return Response.json({});
    }
    return Response.json(f.workflow);
  });
  render(
    <LanguageContext value="en">
      <JobWorkflowPanel
        job={f.job as any}
        transport={transport}
        ready
        panel="answers"
      />
    </LanguageContext>,
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "Verify information" }),
  );
  expect(screen.getByText(f.workflow.suggestions[1].question)).toBeTruthy();
  expect(screen.queryByText(f.workflow.suggestions[0].question)).toBeNull();
  fireEvent.change(screen.getByRole("textbox", { name: "Exact answer" }), {
    target: { value: "Original English answer evidence" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save answer" }));
  await waitFor(() => expect(writes).toHaveLength(1));
  expect(writes[0]).toMatchObject({
    operationId: "11111111-1111-4111-8111-111111111111",
    suggestionId: "second",
    requirementId: "requirement",
    locale: "fr-CA",
    targetId: "role",
    text: "Original English answer evidence",
  });
  expect(writes[0]).not.toHaveProperty("questionText");
});
it("sends the English interface fallback before a CV exists", async () => {
  const writes: any[] = [],
    f = context();
  const transport = async (path: string, init?: RequestInit) => {
    if (!init?.body)
      return Response.json(path.endsWith("/workflow") ? f.workflow : []);
    const body = JSON.parse(String(init.body));
    writes.push(body);
    return Response.json({ ...f.job, intake: body.intake });
  };
  render(
    <LanguageContext value="en">
      <JobsScreen transport={transport} snapshot={null} ready={false} />
    </LanguageContext>,
  );
  fireEvent.change(screen.getByLabelText("Advert text"), {
    target: { value: "A source advert" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save job draft" }));
  await waitFor(() => expect(writes).toHaveLength(1));
  expect(writes[0].interfaceLocale).toBe("en");
});

it("retains separate original draft answers and exact localized question identities for suggestions sharing a requirement", async () => {
  const f = context(),
    registry = new WorkspaceRegistry();
  render(
    <LanguageContext value="en">
      <WorkspaceContext value={registry}>
        <JobWorkflowPanel
          job={f.job as any}
          transport={async () => Response.json(f.workflow)}
          ready
          panel="answers"
        />
      </WorkspaceContext>
    </LanguageContext>,
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "Answer a question" }),
  );
  fireEvent.change(screen.getByRole("textbox", { name: "Exact answer" }), {
    target: { value: "First original answer" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Verify information" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Exact answer" }), {
    target: { value: "Second original answer" },
  });
  const saved = registry.controllers
    .get(`job-answer:${f.job.id}`)!
    .snapshot().value;
  expect(saved.entries.first.text).toBe("First original answer");
  expect(saved.entries.second.text).toBe("Second original answer");
  expect(saved.entries.second).toMatchObject({
    question: f.workflow.suggestions[1].question,
    operationId: "11111111-1111-4111-8111-111111111111",
    suggestionId: "second",
  });
  expect(() => validateWorkspaceValue("job-answer", saved)).not.toThrow();
});
