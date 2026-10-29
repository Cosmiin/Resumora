import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../App";
import { MemoryBaseCvAdapter } from "./adapter";
import { prepareDraft } from "./editing";
import { expect, it, vi } from "vitest";
import { HttpJobCvAdapter } from "./job-adapter";
import { jobDocumentsRoute } from "../../../api/src/jobs/documents";
import { encodeDraft } from "@resumora/contracts/editor/transport";
import { blankDraft, fact, newRole } from "./model";
import type {
  JobEditorPayload,
  JobEditorVersion,
} from "@resumora/contracts/jobs/documents";

export function jobHarness() {
  const source = blankDraft();
  source.name.value = "Synthetic owner";
  source.roles.push(newRole());
  source.roles[0].title.value = "Engineer";
  source.roles[0].context.value = "Maintained PLC systems";
  source.professionalSkills.push(fact("Leadership"), fact("Planning"));
  source.technicalSkills.push(fact("SQL"));
  source.answers.push({
    id: "selected-answer",
    targetId: source.roles[0].id,
    question: "context",
    questionText: "Exact question?",
    text: "Exact free text",
    status: "confirmed",
    sourceId: "local_manual",
    options: [{ id: "choice", label: "Exact selected option" }],
    selectedOptionIds: ["choice"],
    selectionMode: "single",
  });
  source.presentation.templateVersionId = "future-template-v9";
  source.presentation.photo = {
    assetId: crypto.randomUUID(),
    crop: { version: 1, centerX: 0.4, centerY: 0.5, zoom: 1 },
    shape: "circle",
    visible: true,
  };
  const snapshotId = crypto.randomUUID();
  const jobs = [crypto.randomUUID(), crypto.randomUUID()];
  const versions = new Map<string, JobEditorVersion[]>();
  const requests = new Map<string, JobEditorVersion>();
  const context = (id: string) => ({
    job: { id, versionId: null, fingerprint: "a".repeat(64) },
    source: { snapshotId, revision: 7 },
  });
  const gateway = {
    jobEditorContext: async (id: string) => context(id),
    loadSnapshot: async (id: string) =>
      id === snapshotId
        ? {
            id,
            revision: 7,
            parentId: null,
            reason: "save" as const,
            createdAt: "2026-10-29T00:00:00Z",
            payload: encodeDraft(source),
          }
        : null,
    loadJobEditor: async (id: string) => versions.get(id)?.at(-1) ?? null,
    jobEditorHistory: async (
      id: string,
      _doc: string,
      page?: { beforeRevision?: number },
    ) =>
      [...(versions.get(id) ?? [])]
        .reverse()
        .filter(
          (v) => !page?.beforeRevision || v.revision < page.beforeRevision,
        )
        .slice(0, 20),
    saveJobEditor: async (
      id: string,
      input: {
        requestId: string;
        documentId: string | null;
        expectedRevision: number;
        payload: JobEditorPayload;
      },
    ) => {
      if (requests.has(input.requestId)) return requests.get(input.requestId)!;
      const rows = versions.get(id) ?? [];
      if (rows.length !== input.expectedRevision)
        throw { status: 409, code: "PT409" };
      const v: JobEditorVersion = {
        id: crypto.randomUUID(),
        documentId: rows[0]?.documentId ?? crypto.randomUUID(),
        revision: rows.length + 1,
        parentId: rows.at(-1)?.id ?? null,
        createdAt: "2026-10-29T00:00:00Z",
        reason: "save",
        payload: structuredClone(input.payload),
        sourcePayload: encodeDraft(source),
      };
      versions.set(id, [...rows, v]);
      requests.set(input.requestId, v);
      return v;
    },
    restoreJobEditor: async (
      id: string,
      input: {
        requestId: string;
        documentId: string;
        expectedRevision: number;
        versionId: string;
      },
    ) => {
      const old = versions.get(id)!.find((v) => v.id === input.versionId)!;
      const saved = await gateway.saveJobEditor(id, {
        ...input,
        payload: old.payload,
      });
      saved.reason = "restore";
      saved.restoredFrom = old.id;
      return saved;
    },
    deleteJobEditor: async (_id: string, input: { documentId: string }) => ({
      documentId: input.documentId,
      deleted: true as const,
    }),
  };
  const transport = vi.fn(async (path: string, init?: RequestInit) =>
    jobDocumentsRoute(new Request(`http://localhost${path}`, init), gateway),
  );
  return { source, jobs, versions, transport, gateway, snapshotId };
}

it("creates, reopens, revises and restores one job independently with exact pins and metadata", async () => {
  const h = jobHarness(),
    original = structuredClone(h.source);
  const a = new HttpJobCvAdapter(h.transport, h.jobs[0]);
  expect(await a.load()).toBeNull();
  const draft = a.initialDraft();
  draft.summary.text = "Job-specific professional summary";
  const role = draft.roles[0];
  draft.presentation.approvedWording = {
    [role.id]: {
      text: "Maintained PLC systems for the selected role",
      sources: [
        {
          id: role.context.id,
          text: role.context.value,
          sourceId: role.context.sourceId,
        },
      ],
    },
  };
  draft.professionalSkills = [
    draft.professionalSkills[1],
    fact("Team coaching"),
  ];
  draft.technicalSkills.push(fact("PostgreSQL"));
  draft.presentation.hiddenFields = [draft.roles[0].context.fieldId];
  draft.presentation.order.reverse();
  let saved = await a.save({
    draft,
    requestId: crypto.randomUUID(),
    expectedRevision: 0,
  });
  expect(saved.draft.summary.text).toBe(draft.summary.text);
  expect(saved.draft.professionalSkills.map((f) => f.value)).toEqual([
    "Planning",
    "Team coaching",
  ]);
  expect(saved.draft.technicalSkills.map((f) => f.value)).toEqual([
    "SQL",
    "PostgreSQL",
  ]);
  expect(saved.draft.answers).toEqual(original.answers);
  expect(saved.draft.presentation.approvedWording?.[role.id].text).toBe(
    "Maintained PLC systems for the selected role",
  );
  expect(saved.draft.presentation.photo).toEqual(original.presentation.photo);
  expect(saved.draft.presentation.templateVersionId).toBe("future-template-v9");
  const first = saved;
  const reopened = new HttpJobCvAdapter(h.transport, h.jobs[0]);
  expect(await reopened.load()).toEqual(first);
  const changed = structuredClone(saved.draft);
  changed.summary.text = "Second summary";
  saved = await reopened.save({
    draft: changed,
    expectedRevision: 1,
    requestId: crypto.randomUUID(),
  });
  expect(saved.revision).toBe(2);
  expect((await reopened.history()).map((v) => v.revision)).toEqual([2, 1]);
  const restored = await reopened.restore({
    snapshotId: first.id,
    expectedRevision: 2,
    requestId: crypto.randomUUID(),
  });
  expect(restored).toMatchObject({
    revision: 3,
    restoredFrom: first.id,
    draft: first.draft,
  });
  const other = new HttpJobCvAdapter(h.transport, h.jobs[1]);
  expect(await other.load()).toBeNull();
  expect(await other.history()).toEqual([]);
  expect(other.initialDraft()).toEqual(original);
  expect(h.source).toEqual(original);
  const posted = h.transport.mock.calls
    .filter(([, init]) => init?.method === "POST")
    .map(([, init]) => JSON.parse(init!.body as string));
  expect(posted[0]).toMatchObject({
    documentId: null,
    expectedRevision: 0,
    payload: {
      source: { snapshotId: h.snapshotId, revision: 7 },
      job: { id: h.jobs[0] },
    },
  });
  expect(posted[1]).toMatchObject({
    documentId: h.versions.get(h.jobs[0])![0].documentId,
    expectedRevision: 1,
  });
  expect(
    h.transport.mock.calls.every(([path]) => path.startsWith(`/v1/jobs/`)),
  ).toBe(true);
});

it("retains identical accepted body after uncertain response and rejects unsupported fact changes", async () => {
  const h = jobHarness();
  let uncertain = true;
  const transport = vi.fn(async (path: string, init?: RequestInit) => {
    const response = await h.transport(path, init);
    if (path.endsWith("/save") && uncertain) {
      uncertain = false;
      throw new Error("lost response");
    }
    return response;
  });
  const a = new HttpJobCvAdapter(transport, h.jobs[0]);
  await a.load();
  const input = {
    draft: a.initialDraft(),
    expectedRevision: 0,
    requestId: crypto.randomUUID(),
  };
  await expect(a.save(input)).rejects.toThrow("lost response");
  await expect(
    a.save({ ...input, draft: { ...input.draft, language: "en" } }),
  ).rejects.toMatchObject({ code: "requestMismatch" });
  const saved = await a.save(input);
  expect(saved.revision).toBe(1);
  const posts = transport.mock.calls.filter(([p]) => p.endsWith("/save"));
  expect(posts[0][1]!.body).toBe(posts[1][1]!.body);
  const bad = structuredClone(saved.draft);
  bad.roles[0].company.value = "Invented company";
  await expect(
    a.save({ draft: bad, expectedRevision: 1, requestId: crypto.randomUUID() }),
  ).rejects.toMatchObject({ code: "rejected" });
  expect(h.versions.get(h.jobs[0])).toHaveLength(1);
  await expect(
    a.save({
      draft: saved.draft,
      expectedRevision: 0,
      requestId: crypto.randomUUID(),
    }),
  ).rejects.toMatchObject({ code: "conflict" });
});

it("opens from a saved vacancy, edits and restores in existing history, then returns to unchanged Base", async () => {
  const h = jobHarness(),
    base = new MemoryBaseCvAdapter();
  const baseDraft = prepareDraft(h.source);
  await base.save({
    draft: baseDraft,
    expectedRevision: 0,
    requestId: crypto.randomUUID(),
    mode: "autosave",
  });
  const baseline = await base.load();
  const transport = vi.fn(async (path: string, init?: RequestInit) => {
    if (path === "/v1/jobs")
      return Response.json(
        h.jobs.map((id, i) => ({
          id,
          title: `Job ${i + 1}`,
          state: "draft",
          createdAt: "2026-10-29",
        })),
      );
    if (h.jobs.some((id) => path === `/v1/jobs/${id}`))
      return Response.json({
        id: path.split("/").at(-1),
        state: "draft",
        snapshotId: h.snapshotId,
        snapshotRevision: 7,
        intake: {
          text: "Synthetic vacancy",
          title: "Job 1",
          company: "Synthetic employer",
        },
        requirements: [],
      });
    return h.transport(path, init);
  });
  window.location.hash = "jobs";
  const user = userEvent.setup();
  render(<App adapter={base} transport={transport} />);
  await user.click(await screen.findByRole("button", { name: /Job 1/ }));
  await user.click(
    await screen.findByRole("button", {
      name: "Deschide CV-ul pentru acest job",
    }),
  );
  await screen.findByRole("region", { name: "Job CV context" });
  await waitFor(() =>
    expect(screen.queryByText("Deschidem sesiunea…")).toBeNull(),
  );
  await user.click(
    screen.getByText("Rezumat profesional", { selector: "summary" }),
  );
  const summary = screen.getByRole("textbox", {
    name: "Rezumat profesional în cuvintele tale",
  });
  fireEvent.change(summary, {
    target: { value: "Summary for selected vacancy" },
  });
  await waitFor(
    () =>
      expect(
        h.versions.get(h.jobs[0])?.at(-1)?.payload.presentation.summaryText,
      ).toBe("Summary for selected vacancy"),
    { timeout: 3000 },
  );
  fireEvent.change(summary, { target: { value: "Second vacancy summary" } });
  await waitFor(() => expect(h.versions.get(h.jobs[0])?.length).toBe(2), {
    timeout: 3000,
  });
  await user.click(screen.getByRole("button", { name: "Istoric" }));
  await screen.findByRole("heading", { name: "Istoric" });
  await user.click(
    await screen.findByRole("button", { name: "Inspectează v1" }),
  );
  expect(
    screen.getByRole("complementary", { name: "Previzualizare CV" }),
  ).toBeTruthy();
  const inspection = screen.getByRole("region", { name: "Inspectezi v1" });
  expect(
    inspection.compareDocumentPosition(
      screen.getByRole("button", { name: "Inspectează v2" }),
    ) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Restaurează v1" }));
  await user.click(
    screen.getByRole("button", { name: "Restaurează versiunea" }),
  );
  await waitFor(() =>
    expect(h.versions.get(h.jobs[0])?.at(-1)?.reason).toBe("restore"),
  );
  expect(await base.load()).toEqual(baseline);
  expect(h.versions.has(h.jobs[1])).toBe(false);
  await user.click(
    screen.getByRole("button", { name: "Înapoi la CV-ul de bază" }),
  );
  await screen.findByRole("textbox", { name: /Prenume/ });
  expect(screen.queryByRole("region", { name: "Job CV context" })).toBeNull();
  expect(await base.load()).toEqual(baseline);
});

it("fences a delayed previous-account job load and cannot save it through the new account", async () => {
  const { ConnectedApp } = await import("../auth/ConnectedApp");
  const h = jobHarness();
  const source = prepareDraft(h.source);
  let release!: () => void;
  let started = false;
  const delayed = new Promise<void>((resolve) => {
    release = resolve;
  });
  const oldTransport = vi.fn(async (path: string, init?: RequestInit) => {
    if (path === "/v1/base-cv")
      return Response.json({
        id: h.snapshotId,
        revision: 7,
        parentId: null,
        reason: "save",
        createdAt: "2026-10-29",
        draft: source,
      });
    if (path === "/v1/jobs")
      return Response.json([
        {
          id: h.jobs[0],
          title: "Old account vacancy",
          state: "draft",
          createdAt: "2026-10-29",
        },
      ]);
    if (path === `/v1/jobs/${h.jobs[0]}`)
      return Response.json({
        id: h.jobs[0],
        state: "draft",
        snapshotRevision: 7,
        intake: { text: "Old account advert", title: "Old account vacancy" },
        requirements: [],
      });
    if (path === `/v1/jobs/${h.jobs[0]}/cv`) {
      started = true;
      await delayed;
    }
    return h.transport(path, init);
  });
  const beta = structuredClone(source);
  beta.name.value = "Beta Owner";
  beta.nameParts = { first: "Beta", last: "Owner" };
  const newTransport = vi.fn(async (_path: string) =>
    Response.json({
      id: crypto.randomUUID(),
      revision: 1,
      parentId: null,
      reason: "save",
      createdAt: "2026-10-29",
      draft: beta,
    }),
  );
  const user = userEvent.setup();
  window.location.hash = "jobs";
  const view = render(
    <ConnectedApp
      account={{ id: "a", email: "a@example.invalid" }}
      transport={oldTransport}
    />,
  );
  await user.click(
    await screen.findByRole("button", { name: /Old account vacancy/ }),
  );
  await user.click(
    screen.getByRole("button", { name: "Deschide CV-ul pentru acest job" }),
  );
  await waitFor(() => expect(started).toBe(true));
  view.rerender(
    <ConnectedApp
      account={{ id: "b", email: "b@example.invalid" }}
      transport={newTransport}
    />,
  );
  await screen.findByDisplayValue("Beta");
  release();
  await waitFor(() =>
    expect(oldTransport.mock.calls.some(([p]) => p.endsWith("/context"))).toBe(
      true,
    ),
  );
  expect(screen.queryByRole("region", { name: "Job CV context" })).toBeNull();
  expect(screen.getByDisplayValue("Beta")).toBeTruthy();
  expect(newTransport.mock.calls.every(([p]) => !p.includes("/jobs/"))).toBe(
    true,
  );
  expect(h.versions.size).toBe(0);
});
