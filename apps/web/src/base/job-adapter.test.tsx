import {
  render,
  screen,
  waitFor,
  fireEvent,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../App";
import { Editor } from "../components/Editor";
import { currentWording } from "./wording";
import { DocumentPreview } from "../components/DocumentPreview";
import { careerContext } from "@resumora/contracts/intelligence/context";
import { MemoryBaseCvAdapter } from "./adapter";
import { prepareDraft } from "./editing";
import { expect, it, vi } from "vitest";
import { HttpJobCvAdapter } from "./job-adapter";
import { jobDocumentsRoute } from "../../../api/src/jobs/documents";
import { decodeDraft, encodeDraft } from "@resumora/contracts/editor/transport";
import {
  blankDraft,
  fact,
  newRole,
  newOptionalEntry,
  editFact,
  localId,
} from "./model";
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
  const pins = new Map(
    jobs.map((id) => [
      id,
      { id, versionId: null as string | null, fingerprint: "a".repeat(64) },
    ]),
  );
  const versions = new Map<string, JobEditorVersion[]>();
  const requests = new Map<string, JobEditorVersion>();
  const context = (id: string) => ({
    job: pins.get(id)!,
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
      if (
        rows.length !== input.expectedRevision ||
        JSON.stringify(input.payload.job) !== JSON.stringify(context(id).job)
      )
        throw { status: 409, code: "VERSION_CONFLICT" };
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
  return { source, jobs, versions, transport, gateway, snapshotId, pins };
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

it("saves contact visibility through presentation in both directions, including contacts hidden in Base", async () => {
  const h = jobHarness();
  h.source.contacts[0].value.value = "owner@example.invalid";
  h.source.contacts[1].value.value = "0700000000";
  h.source.contacts[1].visible = false;
  const original = structuredClone(h.source);
  const adapter = new HttpJobCvAdapter(h.transport, h.jobs[0]);
  await adapter.load();
  let draft = adapter.initialDraft();
  const view = render(
    <Editor
      jobMode
      draft={draft}
      issues={[]}
      change={(next) => {
        draft = next;
      }}
    />,
  );
  expect(draft.presentation.hiddenFields).toContain(
    h.source.contacts[1].value.fieldId,
  );
  for (const label of [
    "Ascunde: owner@example.invalid",
    "Arată: owner@example.invalid",
    "Arată: 0700000000",
    "Ascunde: 0700000000",
  ]) {
    const revision = h.versions.get(h.jobs[0])?.length ?? 0;
    fireEvent.click(screen.getByRole("button", { name: label }));
    const saved = await adapter.save({
      draft,
      expectedRevision: revision,
      requestId: crypto.randomUUID(),
    });
    expect(adapter.matchesDraft(saved.draft, draft)).toBe(true);
    expect(saved.draft.presentation.hiddenFields).toEqual(
      draft.presentation.hiddenFields,
    );
    const preview = render(
      <DocumentPreview
        draft={saved.draft}
        asOf={{ year: "2026", month: "10" }}
      />,
    );
    const cv = within(
      screen.getByRole("complementary", { name: "Previzualizare CV" }),
    );
    for (const contact of saved.draft.contacts.filter((c) => c.value.value)) {
      expect(!!cv.queryByText(contact.value.value)).toBe(
        !saved.draft.presentation.hiddenFields?.includes(contact.value.fieldId),
      );
    }
    preview.unmount();
    const history = await adapter.history();
    expect(history[0].draft.presentation.hiddenFields).toEqual(
      draft.presentation.hiddenFields,
    );
    draft = saved.draft;
    view.rerender(
      <Editor
        jobMode
        draft={draft}
        issues={[]}
        change={(next) => {
          draft = next;
        }}
      />,
    );
  }
  expect(h.source).toEqual(original);
});

it.each([
  ["professionalSkills", "Competențe profesionale", "Leadership"],
  ["technicalSkills", "Competențe tehnice", "SQL"],
] as const)(
  "keeps pending and edited %s controls intact across autosaves",
  async (group, label, initial) => {
    const h = jobHarness();
    const adapter = new HttpJobCvAdapter(h.transport, h.jobs[0]);
    render(<App adapter={adapter} />);
    await waitFor(() => expect(h.versions.get(h.jobs[0])?.length).toBe(1), {
      timeout: 3000,
    });
    const user = userEvent.setup();
    await user.click(screen.getByText(label, { selector: "summary" }));
    const pending = screen.getByRole("textbox", {
      name: label,
    }) as HTMLInputElement;
    await user.type(pending, "New");
    await waitFor(() => expect(h.versions.get(h.jobs[0])?.length).toBe(2), {
      timeout: 3000,
    });
    expect(pending.value).toBe("New");
    expect(document.activeElement).toBe(pending);
    await user.type(pending, " skill{Enter}");
    await waitFor(() => expect(h.versions.get(h.jobs[0])?.length).toBe(3), {
      timeout: 3000,
    });
    expect(
      screen.getByRole("button", { name: "New skill", exact: true }),
    ).toBeTruthy();
    await user.click(
      screen.getByRole("button", { name: initial, exact: true }),
    );
    const editing = screen.getByRole("textbox", {
      name: "Editează competența",
    }) as HTMLInputElement;
    await user.type(editing, " extended");
    await waitFor(() => expect(h.versions.get(h.jobs[0])?.length).toBe(4), {
      timeout: 3000,
    });
    expect(document.activeElement).toBe(editing);
    expect(editing.value).toBe(`${initial} extended`);
    await user.type(editing, " again{Enter}");
    await waitFor(() => expect(h.versions.get(h.jobs[0])?.length).toBe(5), {
      timeout: 3000,
    });
    const saved = (await adapter.load())!;
    expect(saved.draft[group].map((f) => f.value)).toEqual([
      `${initial} extended again`,
      ...(group === "professionalSkills" ? ["Planning"] : []),
      "New skill",
    ]);
    expect(screen.queryByText("Modificări în ciornă…")).toBeNull();
  },
  15000,
);

it("recognizes an applied expired write with client summary and skill identities", async () => {
  const h = jobHarness();
  let expire = false;
  const transport = async (path: string, init?: RequestInit) => {
    const response = await h.transport(path, init);
    return expire && path.endsWith("/save")
      ? Response.json({ error: { code: "expired" } }, { status: 410 })
      : response;
  };
  const adapter = new HttpJobCvAdapter(transport, h.jobs[0]);
  await adapter.load();
  const draft = adapter.initialDraft();
  draft.professionalSkills.push(fact("Coaching"));
  draft.technicalSkills[0] = editFact(draft.technicalSkills[0], "PostgreSQL");
  await adapter.save({
    draft,
    expectedRevision: 0,
    requestId: crypto.randomUUID(),
  });
  const view = render(<App adapter={adapter} />);
  await screen.findByRole("region", { name: "Job CV context" });
  await waitFor(() =>
    expect(screen.queryByText("Deschidem sesiunea…")).toBeNull(),
  );
  fireEvent.click(
    screen.getByText("Rezumat profesional", { selector: "summary" }),
  );
  expire = true;
  fireEvent.change(
    screen.getByRole("textbox", {
      name: "Rezumat profesional în cuvintele tale",
    }),
    { target: { value: "Updated summary" } },
  );
  await screen.findByRole(
    "button",
    { name: "Verifică starea salvată" },
    { timeout: 3000 },
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Verifică starea salvată" }),
  );
  await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  expect(screen.getByDisplayValue("Updated summary")).toBeTruthy();
  expect(h.versions.get(h.jobs[0])).toHaveLength(2);
  expect(screen.queryByText("Modificări în ciornă…")).toBeNull();
  view.unmount();
  draft.summary = {
    ...draft.summary,
    id: localId(),
    text: "Another summary",
    approval: "approved",
  };
  draft.professionalSkills.push(fact("Mentoring"));
  const input = { draft, expectedRevision: 2, requestId: crypto.randomUUID() };
  await expect(adapter.save(input)).rejects.toMatchObject({ code: "expired" });
  expect(adapter.matchesDraft((await adapter.load())!.draft, draft)).toBe(true);
});

it.each(["role-bullet", "role-contributions", "optional-bullet"])(
  "uses only visible %s evidence for job wording",
  async (mode) => {
    const h = jobHarness();
    const entry = newOptionalEntry();
    entry.title.value = "Source project";
    entry.details.value = "Confirmed project context";
    const target = mode.startsWith("role") ? h.source.roles[0] : entry;
    const hidden = fact("Irrelevant hidden evidence");
    target.bullets = [hidden];
    if (target === entry) {
      h.source.optionalSections.push({
        id: "projects",
        kind: "projects",
        label: "Projects",
        entries: [entry],
      });
      h.source.presentation.order.push("projects");
    }
    h.source.answers = [
      {
        ...h.source.answers[0],
        targetId: target.id,
        cvFieldId: hidden.fieldId,
      },
      { ...h.source.answers[0], id: "visible-answer", targetId: target.id },
    ];
    const adapter = new HttpJobCvAdapter(h.transport, h.jobs[0]);
    await adapter.load();
    let draft = adapter.initialDraft();
    const context = "context" in target ? target.context : target.details;
    draft.presentation.approvedWording = {
      [target.id]: {
        text: "Wording based on visible evidence",
        sources: [context, hidden].map((f) => ({
          id: f.id,
          text: f.value,
          sourceId: f.sourceId,
        })),
      },
    };
    await adapter.save({
      draft,
      expectedRevision: 0,
      requestId: crypto.randomUUID(),
    });
    draft.presentation.hiddenFields = [
      mode === "role-contributions"
        ? `${target.id}-contributions`
        : hidden.fieldId,
    ];
    const view = render(
      <Editor
        jobMode
        draft={draft}
        issues={[]}
        change={(next) => {
          draft = next;
        }}
      />,
    );
    fireEvent.click(
      screen.getByText(
        target === entry ? "Projects" : "Experiență profesională",
        { selector: "summary" },
      ),
    );
    const wordingField = () =>
      within(
        screen
          .getByText(
            target === entry ? "Projects" : "Experiență profesională",
            { selector: "summary" },
          )
          .closest("details")!,
      ).getByRole("textbox", { name: "Formulare pentru acest job" });
    fireEvent.change(wordingField(), { target: { value: "Interim wording" } });
    view.rerender(
      <Editor
        jobMode
        draft={draft}
        issues={[]}
        change={(next) => {
          draft = next;
        }}
      />,
    );
    fireEvent.change(wordingField(), {
      target: { value: "Wording based on visible evidence" },
    });
    const sources = draft.presentation.approvedWording![target.id].sources;
    expect(sources.map((s) => s.id)).not.toContain(hidden.id);
    expect(sources.map((s) => s.id)).not.toContain("selected-answer");
    expect(sources.map((s) => s.id)).toContain("visible-answer");
    const saved = await adapter.save({
      draft,
      expectedRevision: 1,
      requestId: crypto.randomUUID(),
    });
    expect(currentWording(saved.draft, target.id)).toBe(
      "Wording based on visible evidence",
    );
    expect(saved.draft.presentation.approvedWording![target.id].scope).toBe(
      "experience",
    );
    expect(decodeDraft(encodeDraft(saved.draft))).toEqual(saved.draft);
    const reopened = new HttpJobCvAdapter(h.transport, h.jobs[0]);
    expect(currentWording((await reopened.load())!.draft, target.id)).toBe(
      "Wording based on visible evidence",
    );
    expect(currentWording((await reopened.history())[0].draft, target.id)).toBe(
      "Wording based on visible evidence",
    );
  },
);

it("refreshes vacancy pins on reopen while preserving pinned Base and historical restore conflicts", async () => {
  const h = jobHarness();
  const adapter = new HttpJobCvAdapter(h.transport, h.jobs[0]);
  await adapter.load();
  const first = await adapter.save({
    draft: adapter.initialDraft(),
    expectedRevision: 0,
    requestId: crypto.randomUUID(),
  });
  const oldPin = structuredClone(h.pins.get(h.jobs[0])!);
  const pin = {
    id: h.jobs[0],
    versionId: crypto.randomUUID(),
    fingerprint: "b".repeat(64),
  };
  h.pins.set(h.jobs[0], pin);
  const nextSnapshotId = crypto.randomUUID();
  const nextSource = structuredClone(h.source);
  nextSource.roles[0].title.value = "New Base title";
  const loadSnapshot = h.gateway.loadSnapshot;
  h.gateway.jobEditorContext = async (id) => ({
    job: h.pins.get(id)!,
    source: { snapshotId: nextSnapshotId, revision: 8 },
  });
  h.gateway.loadSnapshot = async (id) =>
    id === nextSnapshotId
      ? {
          id,
          revision: 8,
          parentId: null,
          reason: "save",
          createdAt: "2026-10-29T00:00:00Z",
          payload: encodeDraft(nextSource),
        }
      : loadSnapshot(id);
  await adapter.load();
  const draft = structuredClone(first.draft);
  draft.summary.text = "Summary after vacancy review";
  const saved = await adapter.save({
    draft,
    expectedRevision: 1,
    requestId: crypto.randomUUID(),
  });
  expect(saved.revision).toBe(2);
  expect(h.versions.get(h.jobs[0])![1].payload.job).toEqual(pin);
  expect(h.versions.get(h.jobs[0])![0].payload.job).toEqual(oldPin);
  expect(h.versions.get(h.jobs[0])![1].payload.source).toEqual({
    snapshotId: h.snapshotId,
    revision: 7,
  });
  expect(saved.draft.roles).toEqual(h.source.roles);
  await expect(
    adapter.restore({
      snapshotId: first.id,
      expectedRevision: 2,
      requestId: crypto.randomUUID(),
    }),
  ).rejects.toMatchObject({ code: "conflict" });
  const reopened = new HttpJobCvAdapter(h.transport, h.jobs[0]);
  expect(await reopened.load()).toEqual(saved);
  expect(
    (
      await reopened.restore({
        snapshotId: saved.id,
        expectedRevision: 2,
        requestId: crypto.randomUUID(),
      })
    ).revision,
  ).toBe(3);
});

it("allows returning to Base after a failed job context load without showing Base creation", async () => {
  const h = jobHarness();
  const base = new MemoryBaseCvAdapter();
  await base.save({
    draft: prepareDraft(h.source),
    expectedRevision: 0,
    requestId: crypto.randomUUID(),
    mode: "autosave",
  });
  const transport = async (path: string, init?: RequestInit) => {
    if (path === "/v1/jobs")
      return Response.json([
        {
          id: h.jobs[0],
          title: "Vacancy",
          state: "draft",
          createdAt: "2026-10-29",
        },
      ]);
    if (path === `/v1/jobs/${h.jobs[0]}`)
      return Response.json({
        id: h.jobs[0],
        state: "draft",
        snapshotRevision: 7,
        intake: { text: "Vacancy", title: "Vacancy" },
        requirements: [],
      });
    if (path.endsWith("/context")) return Response.json({}, { status: 503 });
    return h.transport(path, init);
  };
  window.location.hash = "jobs";
  render(<App adapter={base} transport={transport} />);
  fireEvent.click(await screen.findByRole("button", { name: /Vacancy ·/ }));
  fireEvent.click(
    await screen.findByRole("button", {
      name: "Deschide CV-ul pentru acest job",
    }),
  );
  await screen.findByRole("alert");
  expect(
    screen.queryByRole("button", { name: "Completează manual" }),
  ).toBeNull();
  const back = screen.getByRole("button", {
    name: "Înapoi la CV-ul de bază",
  }) as HTMLButtonElement;
  expect(back.disabled).toBe(false);
  fireEvent.click(back);
  await screen.findByRole("textbox", { name: /Prenume/ });
  expect(screen.queryByRole("region", { name: "Job CV context" })).toBeNull();
});

it.each([
  "role",
  "projects",
  "certifications",
  "volunteering",
  "custom",
] as const)(
  "round-trips whole %s wording without duplicate contributions or changes to Base",
  async (kind) => {
    for (const inherited of ["none", "paragraph", "experience"] as const) {
      const h = jobHarness();
      const entry = newOptionalEntry();
      entry.title.value = "Source entry";
      const role = h.source.roles[0];
      const target = kind === "role" ? role : entry;
      const context = kind === "role" ? role.context : entry.details;
      context.value = "Built tools";
      target.bullets = [fact("Reduced downtime")];
      if (kind !== "role") {
        h.source.optionalSections.push({
          id: "extra",
          kind,
          label: "Extra",
          entries: [entry],
        });
        h.source.presentation.order.push("extra");
      }
      h.source.answers = h.source.answers.map((a) => ({
        ...a,
        targetId: target.id,
      }));
      const approved =
        inherited === "experience"
          ? "Built improved tools\nReduced downtime"
          : "Built improved tools";
      if (inherited !== "none")
        h.source.presentation.approvedWording = {
          [target.id]: {
            text: approved,
            ...(inherited === "experience"
              ? { scope: "experience" as const }
              : {}),
            sources: [
              {
                id: context.id,
                text: context.value,
                sourceId: context.sourceId,
              },
            ],
          },
        };
      if (inherited === "experience")
        h.source.roleRewriteReviews = [
          {
            id: "original-review",
            status: "accepted",
            input: careerContext(h.source, target.id),
            proposal: {
              schemaVersion: "career-role-rewrite/1",
              targetId: target.id,
              text: approved,
              factIds: [context.id],
              warnings: [],
            },
          },
        ];
      const source = structuredClone(h.source);
      const adapter = new HttpJobCvAdapter(h.transport, h.jobs[0]);
      await adapter.load();
      let draft = adapter.initialDraft();
      const view = render(
        <Editor
          jobMode
          draft={draft}
          issues={[]}
          change={(next) => {
            draft = next;
          }}
        />,
      );
      const panel = screen.getByText(
        kind === "role" ? "Experiență profesională" : "Extra",
        { selector: "summary" },
      );
      fireEvent.click(panel);
      const input = within(panel.closest("details")!).getByRole("textbox", {
        name: "Formulare pentru acest job",
      }) as HTMLTextAreaElement;
      expect(input.value).toContain("Reduced downtime");
      expect(input.value).toContain(
        inherited === "none" ? "Built tools" : "Built improved tools",
      );
      const text = input.value.replace("Built", "Developed");
      fireEvent.change(input, { target: { value: "" } });
      view.rerender(
        <Editor
          jobMode
          draft={draft}
          issues={[]}
          change={(next) => {
            draft = next;
          }}
        />,
      );
      expect(input.value).toBe("");
      fireEvent.change(input, { target: { value: text } });
      view.unmount();
      expect(draft.presentation.approvedWording![target.id]).toMatchObject({
        scope: "experience",
        origin: "user_authored",
        text,
      });
      const first = await adapter.save({
        draft,
        expectedRevision: 0,
        requestId: crypto.randomUUID(),
      });
      expect(h.versions.get(h.jobs[0])![0].payload.wording[0]).toMatchObject({
        scope: "experience",
        origin: "user_authored",
      });
      draft = structuredClone(first.draft);
      draft.presentation.approvedWording![target.id].text =
        "Second description";
      await adapter.save({
        draft,
        expectedRevision: 1,
        requestId: crypto.randomUUID(),
      });
      const reopened = new HttpJobCvAdapter(h.transport, h.jobs[0]);
      expect(currentWording((await reopened.load())!.draft, target.id)).toBe(
        "Second description",
      );
      const historical = (await reopened.history()).find(
        (s) => s.id === first.id,
      )!;
      const restored = await reopened.restore({
        snapshotId: first.id,
        expectedRevision: 2,
        requestId: crypto.randomUUID(),
      });
      for (const saved of [first, historical, restored]) {
        expect(saved.draft.roles).toEqual(source.roles);
        expect(saved.draft.optionalSections).toEqual(source.optionalSections);
        expect(saved.draft.answers).toEqual(source.answers);
        expect(saved.draft.roleRewriteReviews).toEqual(
          source.roleRewriteReviews,
        );
        expect(decodeDraft(encodeDraft(saved.draft))).toEqual(saved.draft);
        expect(currentWording(saved.draft, target.id)).toBe(text);
        const preview = render(
          <DocumentPreview
            draft={saved.draft}
            asOf={{ year: "2026", month: "10" }}
          />,
        );
        const cv = screen.getByRole("complementary", {
          name: "Previzualizare CV",
        });
        expect(cv.textContent?.split("Reduced downtime")).toHaveLength(2);
        expect(cv.textContent).toContain(text);
        preview.unmount();
      }
      const hidden = structuredClone(restored.draft);
      hidden.presentation.hiddenFields = [target.bullets![0].fieldId];
      expect(currentWording(hidden, target.id)).toBeNull();
      expect(h.source).toEqual(source);
      expect(h.versions.has(h.jobs[1])).toBe(false);
      expect(
        h.transport.mock.calls.every(([path]) =>
          path.startsWith(`/v1/jobs/${h.jobs[0]}/cv`),
        ),
      ).toBe(true);
    }
  },
);

it.each(["save", "restore"] as const)(
  "recovers a stale job %s through confirmed reopen from editor and history",
  async (operation) => {
    const h = jobHarness();
    const original = structuredClone(h.source);
    const firstTab = new HttpJobCvAdapter(h.transport, h.jobs[0]);
    await firstTab.load();
    const first = await firstTab.save({
      draft: firstTab.initialDraft(),
      expectedRevision: 0,
      requestId: crypto.randomUUID(),
    });
    const secondTab = new HttpJobCvAdapter(h.transport, h.jobs[0]);
    const load = vi.spyOn(secondTab, "load");
    render(<App adapter={secondTab} />);
    await waitFor(() =>
      expect(screen.queryByText("Deschidem sesiunea…")).toBeNull(),
    );
    await screen.findByRole("region", { name: "Job CV context" });
    fireEvent.click(
      screen.getByText("Rezumat profesional", { selector: "summary" }),
    );
    const summary = screen.getByRole("textbox", {
      name: "Rezumat profesional în cuvintele tale",
    });
    const remote = structuredClone(first.draft);
    remote.summary.text = "Saved by another tab";
    const current = await firstTab.save({
      draft: remote,
      expectedRevision: 1,
      requestId: crypto.randomUUID(),
    });
    if (operation === "save") {
      fireEvent.change(summary, { target: { value: "Retained local draft" } });
      fireEvent.click(screen.getByRole("button", { name: /Salvează acum/ }));
    } else {
      fireEvent.click(screen.getByRole("button", { name: "Istoric" }));
      fireEvent.click(
        await screen.findByRole("button", { name: "Restaurează v2" }),
      );
      fireEvent.click(
        screen.getByRole("button", { name: "Restaurează versiunea" }),
      );
    }
    const conflict = await screen.findByRole("alert");
    expect(conflict.textContent).toContain("Sesiunea s-a schimbat");
    expect(
      (
        screen.getByRole("button", {
          name: "Înapoi la CV-ul de bază",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    fireEvent.click(
      within(conflict).getByRole("button", {
        name: "Redeschide versiunea salvată",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Păstrează ciorna" }));
    expect(load).toHaveBeenCalledTimes(1);
    expect(h.versions.get(h.jobs[0])).toHaveLength(2);
    if (operation === "save") {
      expect(screen.getByDisplayValue("Retained local draft")).toBeTruthy();
      fireEvent.click(
        within(conflict).getByRole("button", { name: "Istoric" }),
      );
      fireEvent.click(
        await screen.findByRole("button", { name: "Inspectează v2" }),
      );
      expect(
        screen.getByRole("region", { name: "Inspectezi v2" }).textContent,
      ).toContain("Saved by another tab");
    }
    const pin = {
      id: h.jobs[0],
      versionId: crypto.randomUUID(),
      fingerprint: "b".repeat(64),
    };
    h.pins.set(h.jobs[0], pin);
    fireEvent.click(
      screen.getByRole("button", { name: "Redeschide versiunea salvată" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Înlocuiește ciorna" }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(load).toHaveBeenCalledTimes(2);
    expect(screen.getByDisplayValue("Saved by another tab")).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: "Înapoi la CV-ul de bază",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
    fireEvent.click(
      screen.getByText("Rezumat profesional", { selector: "summary" }),
    );
    fireEvent.change(
      screen.getByRole("textbox", {
        name: "Rezumat profesional în cuvintele tale",
      }),
      { target: { value: "Accepted after reopen" } },
    );
    fireEvent.click(screen.getByRole("button", { name: /Salvează acum/ }));
    await waitFor(() => expect(h.versions.get(h.jobs[0])).toHaveLength(3));
    const saved = h.versions.get(h.jobs[0])![2];
    expect(saved.parentId).toBe(current.id);
    expect(saved.payload.job).toEqual(pin);
    expect(saved.payload.presentation.summaryText).toBe(
      "Accepted after reopen",
    );
    expect(h.source).toEqual(original);
    expect(h.versions.has(h.jobs[1])).toBe(false);
  },
);

it.each(["role", "projects"] as const)(
  "edits whole %s wording containing a job-local bullet without citing that bullet",
  async (kind) => {
    const h = jobHarness();
    const entry = newOptionalEntry();
    entry.title.value = "Source project";
    entry.details.value = "Built tools";
    const target = kind === "role" ? h.source.roles[0] : entry;
    if (kind === "projects") {
      h.source.optionalSections.push({
        id: "projects",
        kind,
        label: "Projects",
        entries: [entry],
      });
      h.source.presentation.order.push("projects");
    }
    const original = structuredClone(h.source);
    const initial = new HttpJobCvAdapter(h.transport, h.jobs[0]);
    await initial.load();
    const first = await initial.save({
      draft: initial.initialDraft(),
      expectedRevision: 0,
      requestId: crypto.randomUUID(),
    });
    const payload = structuredClone(h.versions.get(h.jobs[0])![0].payload);
    const addition = {
      id: "job_local_bullet",
      targetId: target.id,
      kind: "bullet" as const,
      text: "Reduced downtime for this job",
      scope: "job-only" as const,
      origin: "user_authored" as const,
    };
    payload.localAdditions.push(addition);
    const added = await h.transport(`/v1/jobs/${h.jobs[0]}/cv/save`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requestId: crypto.randomUUID(),
        documentId: h.versions.get(h.jobs[0])![0].documentId,
        expectedRevision: first.revision,
        payload,
      }),
    });
    expect(added.status).toBe(200);
    const adapter = new HttpJobCvAdapter(h.transport, h.jobs[0]);
    let draft = (await adapter.load())!.draft;
    const view = render(
      <Editor
        jobMode
        draft={draft}
        issues={[]}
        change={(next) => {
          draft = next;
        }}
      />,
    );
    const panel = screen.getByText(
      kind === "role" ? "Experiență profesională" : "Projects",
      { selector: "summary" },
    );
    fireEvent.click(panel);
    const input = within(panel.closest("details")!).getByRole("textbox", {
      name: "Formulare pentru acest job",
    }) as HTMLTextAreaElement;
    expect(input.value).toContain(addition.text);
    const text = `${input.value}\nAccepted wording`;
    fireEvent.change(input, { target: { value: text } });
    view.unmount();
    const wording = draft.presentation.approvedWording![target.id];
    expect(wording.scope).toBe("experience");
    expect(wording.sources.length).toBeGreaterThan(0);
    expect(
      wording.sources.some(
        (s) => s.id === addition.id || s.sourceId === "job_local_manual",
      ),
    ).toBe(false);
    const saved = await adapter.save({
      draft,
      expectedRevision: 2,
      requestId: crypto.randomUUID(),
    });
    const persisted = h.versions.get(h.jobs[0])![2].payload;
    expect(persisted.localAdditions).toContainEqual(addition);
    expect(
      persisted.wording.find((w) => w.targetId === target.id)!.valueIds,
    ).not.toContain(addition.id);
    const reopened = new HttpJobCvAdapter(h.transport, h.jobs[0]);
    const loaded = (await reopened.load())!;
    const historical = (await reopened.history()).find(
      (s) => s.id === saved.id,
    )!;
    const restored = await reopened.restore({
      snapshotId: saved.id,
      expectedRevision: 3,
      requestId: crypto.randomUUID(),
    });
    for (const snapshot of [loaded, historical, restored]) {
      expect(currentWording(snapshot.draft, target.id)).toBe(text);
      expect(
        snapshot.draft.presentation.approvedWording![target.id].scope,
      ).toBe("experience");
      const preview = render(
        <DocumentPreview
          draft={snapshot.draft}
          asOf={{ year: "2026", month: "10" }}
        />,
      );
      expect(
        screen
          .getByRole("complementary", { name: "Previzualizare CV" })
          .textContent?.split(addition.text),
      ).toHaveLength(2);
      preview.unmount();
    }
    expect(h.source).toEqual(original);
    expect(h.versions.has(h.jobs[1])).toBe(false);
  },
);
