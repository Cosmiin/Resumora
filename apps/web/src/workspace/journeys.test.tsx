import { selfContainedJobDraft } from "@resumora/contracts/jobs/current-document";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import { App } from "../App";
import { MemoryBaseCvAdapter } from "../base/adapter";
import { maraReviewDraft } from "../base/fixture";
import { clone } from "../base/model";
import {
  WorkspaceProvider,
  WorkspaceRegistry,
  WorkspaceContext,
} from "./context";
import { JobAnswersPanel } from "../components/JobAnswersPanel";
import type {
  WorkspaceDraft,
  JobAnswers,
} from "@resumora/contracts/editor/workspace";
import type { AuthTransport } from "../auth/AuthShell";
const a = "11111111-1111-4111-8111-111111111111",
  b = "22222222-2222-4222-8222-222222222222";
async function startSkills() {
  const button = await screen.findByRole("button", {name:"Îmbunătățește competențele"});
  await waitFor(()=>expect(button.matches(":disabled")).toBe(false), {timeout:4000});
  fireEvent.click(button);
}
async function fixture() {
  const profile = maraReviewDraft(),
    adapter = new MemoryBaseCvAdapter();
  const snapshot = await adapter.save({
    draft: profile,
    expectedRevision: 0,
    requestId: crypto.randomUUID(),
    mode: "autosave",
  });
  const rows = new Map<string, WorkspaceDraft>(),
    calls: { path: string; body: any }[] = [],
    documents = new Map<string, any>();
  const jobs = [a, b].map((id, i) => ({
    id,
    state: "review",
    intake: {
      title: i ? "Second job" : "First job",
      text: "Required experience preparing weekly reports.",
    },
    requirements: [],
    createdAt: "2026-10-31T00:00:00Z",
  }));
  const transport: AuthTransport = vi.fn(async (path, init) => {
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ path, body });
    if (
      path === "/v1/document-languages" ||
      path.startsWith("/v1/document-languages?")
    )
      return Response.json({ source: null, versions: [] });
    if (path === "/v1/workspace-drafts")
      return Response.json([...rows.values()]);
    if (path.startsWith("/v1/workspace-drafts/")) {
      const [kind, id] = path.split("/").slice(-2),
        key = kind + ":" + id;
      if (body) {
        expect(body.expectedRevision).toBe(rows.get(key)?.revision ?? 0);
        rows.set(key, {
          id,
          kind: kind as WorkspaceDraft["kind"],
          revision: body.expectedRevision + 1,
          value: body.value,
          updatedAt: new Date().toISOString(),
        });
      }
      return Response.json(rows.get(key) ?? null, {
        headers: { "X-Profile-Generation": "0" },
      });
    }
    if (path === "/v1/jobs")
      return Response.json(jobs.map((j) => ({ ...j, title: j.intake.title })));
    const id = path.split("/")[3],
      job = jobs.find((j) => j.id === id);
    if (path.endsWith("/submit")) return Response.json(jobs[0]);
    if (path.includes("/workflow"))
      return Response.json({
        revision: 1,
        extracted: null,
        reviewed: null,
        operations: [],
        duplicates: [],
        aiEnabled: false,
        currentSnapshotId: snapshot.id,
        answersRevision: 0,
      });
    if (path.includes("/cv?")) {
      const key =
        id + ":" + new URL(path, "http://local").searchParams.get("locale");
      if (body) {
        const old = documents.get(key);
        documents.set(key, {
          ...old,
          id: crypto.randomUUID(),
          revision: old.revision + 1,
          draft: body.draft,
        });
      }
      return Response.json(documents.get(key) ?? null);
    }
    if (path.endsWith("/answers"))
      return Response.json({ revision: 0, answers: [] });
    if (job) return Response.json(job);
    throw Error("Unexpected fixture request " + path);
  });
  return { profile, adapter, snapshot, rows, calls, transport, documents };
}
async function route(hash: string) {
  await act(async () => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });
}
it("has two destinations, keeps enrichment scoped to one role in a modal, and redirects legacy Base links", async () => {
  const f = await fixture();
  window.location.hash = "#base";
  render(<App {...f} />);
  const nav = screen.getByRole("navigation", { name: "Navigare principală" });
  expect(
    within(nav)
      .getAllByRole("link")
      .map((l) => l.textContent),
  ).toEqual(["Profilul meu", "Joburile mele"]);
  await screen.findByRole("region", { name: f.profile.roles[0].title.value });
  expect(window.location.hash).toBe("#/profile");
  expect(document.querySelector("#section-experience[open]")).toBeNull();
  const card = screen.getByRole("region", {
    name: f.profile.roles[0].title.value,
  });
  fireEvent.click(
    within(card).getByRole("button", { name: "Îmbunătățește experiența" }),
  );
  await waitFor(() =>
    expect(window.location.hash).toContain(
      "/profile/enrich/" + f.profile.roles[0].id,
    ),
  );
  expect(document.querySelectorAll("dialog.experience-modal")).toHaveLength(1);
  await route("#/jobs");
  await screen.findByRole("heading", { name: "Joburile mele" });
  expect(document.querySelector("dialog.experience-modal")).toBeNull();
  await route("#/profile/enrich/" + f.profile.roles[0].id);
  await waitFor(() =>
    expect(document.querySelectorAll("dialog.experience-modal")).toHaveLength(
      1,
    ),
  );
});
it("restores acknowledged intake after refresh without submitting, fetching a URL or invoking AI", async () => {
  const f = await fixture();
  window.location.hash = `#/jobs/new/${a}`;
  let view = render(<App {...f} />);
  const input = await screen.findByRole("textbox", {
    name: "Textul anunțului",
  });
  await waitFor(() => expect(input).not.toHaveProperty("disabled", true));
  fireEvent.change(input, {
    target: { value: "Unfinished reporting vacancy" },
  });
  await waitFor(
    () =>
      expect(f.rows.get("intake:" + a)?.value.text).toBe(
        "Unfinished reporting vacancy",
      ),
    { timeout: 2000 },
  );
  view.unmount();
  view = render(<App {...f} />);
  await waitFor(() =>
    expect(
      screen.getByRole("textbox", { name: "Textul anunțului" }),
    ).toHaveProperty("value", "Unfinished reporting vacancy"),
  );
  expect(
    f.calls.filter(
      (c) => c.body && !c.path.startsWith("/v1/workspace-drafts/"),
    ),
  ).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: "Verifică jobul" }));
  await waitFor(() =>
    expect(f.calls.some((c) => c.path === `/v1/jobs/intakes/${a}/submit`)).toBe(
      true,
    ),
  );
});
it("opening a proposal workspace never creates an accepted CV or initializes a CV from Profile", async () => {
  const f = await fixture();
  window.location.hash = `#/jobs/${a}/cv/ro`;
  render(<App {...f} />);
  await screen.findByText("First job", { selector: "h1" });
  await screen.findByText(/Nu există încă un CV acceptat/);
  expect(f.calls.some((c) => c.path.endsWith("/cv/context"))).toBe(false);
  expect(
    f.calls.filter(
      (c) => c.body && !c.path.startsWith("/v1/workspace-drafts/"),
    ),
  ).toHaveLength(0);
});
it("keeps accepted job and language document identities independent during navigation", async () => {
  const f = await fixture();
  for (const [id, locale, name] of [
    [a, "ro", "First accepted"],
    [b, "en", "Second accepted"],
  ] as const) {
    // Stored job CVs already have their own source identities.
    const draft = selfContainedJobDraft(clone(f.profile));
    draft.name.value = name;
    draft.language = locale;
    f.documents.set(id + ":" + locale, {
      id: crypto.randomUUID(),
      documentId: crypto.randomUUID(),
      revision: 1,
      createdAt: new Date().toISOString(),
      draft,
      locale,
    });
  }
  window.location.hash = `#/jobs/${a}/cv/ro`;
  render(<App {...f} />);
  await screen.findByRole("heading", { name: "First accepted" });
  await route(`#/jobs/${b}/cv/en`);
  await screen.findByRole("heading", { name: "Second accepted" });
  expect(screen.queryByRole("heading", { name: "First accepted" })).toBeNull();
  await route(`#/jobs/${a}/cv/ro`);
  await screen.findByRole("heading", { name: "First accepted" });
  expect(screen.queryByRole("heading", { name: "Second accepted" })).toBeNull();
  expect(
    f.calls.filter(
      (c) => c.body && !c.path.startsWith("/v1/workspace-drafts/"),
    ),
  ).toHaveLength(0);
});
it("drafting a job answer restores independently from factual confirmation and leaves Profile unchanged", async () => {
  const f = await fixture(),
    answerId = crypto.randomUUID(),
    question = "What did you personally improve?",
    original = clone(f.profile),
    bundle: JobAnswers = {
      revision: 1,
      answers: [
        {
          id: answerId,
          requirementId: "reporting",
          targetId: f.profile.roles[0].id,
          questionText: question,
          text: "Confirmed report work",
          status: "confirmed",
          revision: 1,
        },
      ],
    };
  const transport: AuthTransport = async (path, init) =>
    path.endsWith("/answers") ? Response.json(bundle) : f.transport(path, init);
  const props = {
    jobId: a,
    profile: f.profile,
    snapshot: f.snapshot,
    ready: true,
    onProfileAccepted: vi.fn(),
  };
  let view = render(
    <WorkspaceProvider transport={transport}>
      <JobAnswersPanel {...props} />
    </WorkspaceProvider>,
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "Editează răspunsul" }),
  );
  const box = screen.getByRole("textbox", { name: "Răspunsul tău" });
  fireEvent.change(box, { target: { value: "Unconfirmed edit" } });
  await waitFor(
    () =>
      expect(
        (f.rows.get("job-answer:" + a)?.value.entries as any)?.[answerId]?.text,
      ).toBe("Unconfirmed edit"),
    { timeout: 2000 },
  );
  view.unmount();
  render(
    <WorkspaceProvider transport={transport}>
      <JobAnswersPanel {...props} />
    </WorkspaceProvider>,
  );
  await screen.findByDisplayValue("Unconfirmed edit");
  expect(f.profile).toEqual(original);
  expect(f.calls.some((c) => c.path.endsWith("/answers") && c.body)).toBe(
    false,
  );
});
it("retiring Profile drafts fences late responses without removing independent intake", async () => {
  const registry = new WorkspaceRegistry(),
    draft = registry.draft("job-answer", a, { entries: {}, focused: "" }),
    intake = registry.draft("intake", b, {
      text: "Keep advert",
      sourceUrl: "",
    });
  await draft.load();
  await intake.load();
  draft.set({ entries: { private: "obsolete" }, focused: "" });
  registry.clearProfile();
  expect(registry.controllers.has("job-answer:" + a)).toBe(false);
  expect(registry.controllers.has("intake:" + b)).toBe(true);
  expect(await draft.flush()).toBe(false);
  registry.dispose();
});

it("explicit resource URLs take precedence over account resume metadata", async () => {
  const f = await fixture(),
    id = "00000000-0000-4000-8000-000000000001";
  f.rows.set("resume:" + id, {
    id,
    kind: "resume",
    revision: 1,
    value: { route: `#/jobs/new/${b}` },
    updatedAt: new Date().toISOString(),
  });
  window.location.hash = "#/profile";
  render(<App {...f} />);
  await screen.findByRole("heading", { name: "Profilul meu" });
  expect(window.location.hash).toBe("#/profile");
  expect(
    f.calls.some(
      (c) => c.path === `/v1/workspace-drafts/resume/${id}` && !c.body,
    ),
  ).toBe(false);
});
it("an empty URL resumes the last owned workspace without document content in browser storage", async () => {
  const f = await fixture(),
    id = "00000000-0000-4000-8000-000000000001";
  f.rows.set("resume:" + id, {
    id,
    kind: "resume",
    revision: 1,
    value: { route: `#/jobs/new/${b}` },
    updatedAt: new Date().toISOString(),
  });
  window.location.hash = "";
  render(<App {...f} />);
  await screen.findByRole("heading", { name: "Adaugă un job" });
  expect(window.location.hash).toBe(`#/jobs/new/${b}`);
  expect(
    f.calls
      .filter((c) => c.body && c.path.includes("/resume/"))
      .every((c) => Object.keys(c.body.value).join(",") === "route"),
  ).toBe(true);
});
it("confirmation with a lost response replays the same answer body after workspace navigation", async () => {
  const f = await fixture(),
    answerId = crypto.randomUUID(),
    registry = new WorkspaceRegistry();
  let bundle: JobAnswers = {
      revision: 1,
      answers: [
        {
          id: answerId,
          requirementId: "reporting",
          targetId: f.profile.roles[0].id,
          questionText: "What improved?",
          text: "Original confirmation",
          status: "confirmed",
          revision: 1,
        },
      ],
    },
    lost = true;
  const submissions: any[] = [];
  registry.transport = async (path, init) => {
    if (path.endsWith("/answers")) {
      if (init?.body) {
        const body = JSON.parse(String(init.body));
        submissions.push(body);
        if (lost) {
          lost = false;
          bundle = { revision: 2, answers: [{ ...body.answer, revision: 2 }] };
          throw Error("Lost response");
        }
      }
      return Response.json(bundle);
    }
    return f.transport(path, init);
  };
  const panel = (
    <JobAnswersPanel
      jobId={a}
      profile={f.profile}
      snapshot={f.snapshot}
      ready
      onProfileAccepted={() => {}}
    />
  );
  const view = render(
    <WorkspaceContext value={registry}>{panel}</WorkspaceContext>,
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "Editează răspunsul" }),
  );
  fireEvent.change(screen.getByRole("textbox", { name: "Răspunsul tău" }), {
    target: { value: "New explicit confirmation" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Folosește acest răspuns" }),
  );
  await screen.findByRole("button", { name: "Reîncearcă aceeași confirmare" });
  view.rerender(
    <WorkspaceContext value={registry}>
      <p>Another workspace</p>
    </WorkspaceContext>,
  );
  view.rerender(<WorkspaceContext value={registry}>{panel}</WorkspaceContext>);
  await screen.findByText("New explicit confirmation", { selector: "p" });
  fireEvent.click(
    screen.getByRole("button", { name: "Reîncearcă aceeași confirmare" }),
  );
  await waitFor(() => expect(submissions).toHaveLength(2));
  expect(submissions[1]).toEqual(submissions[0]);
  registry.dispose();
});

it("keyboard skip navigation focuses the workspace without changing its resource URL", async () => {
  const f = await fixture();
  window.location.hash = "#/jobs";
  render(<App {...f} />);
  await screen.findByRole("heading", { name: "Joburile mele" });
  fireEvent.click(screen.getByRole("link", { name: "Mergi la conținut" }));
  expect(document.activeElement).toBe(
    document.getElementById("workspace-main"),
  );
  expect(window.location.hash).toBe("#/jobs");
});

it("reviews selected job Q&A before atomic Profile integration and keeps independent job CVs untouched", async () => {
  const f = await fixture(),
    answer = {
      id: crypto.randomUUID(),
      requirementId: "reporting",
      targetId: f.profile.roles[0].id,
      questionText: "What reporting work did you personally improve?",
      text: "Simplified the weekly reporting process.",
      status: "confirmed" as const,
      revision: 1,
    };
  let operation: any = null,
    accepted = false;
  const currentCv = clone(f.profile);
  f.documents.set(b + ":en", {
    id: crypto.randomUUID(),
    documentId: crypto.randomUUID(),
    revision: 1,
    createdAt: new Date().toISOString(),
    locale: "en",
    draft: currentCv,
  });
  const { withJobAnswers } =
      await import("@resumora/contracts/editor/workspace"),
    { acceptWording } = await import("@resumora/contracts/editor/wording"),
    { careerContext } =
      await import("@resumora/contracts/intelligence/context"),
    { encodeDraft } = await import("@resumora/contracts/editor/transport");
  const transport: AuthTransport = async (path, init) => {
    if (path === `/v1/jobs/${a}/answers`)
      return Response.json({
        revision: 1,
        answers: [answer],
        integrations: operation ? [operation] : [],
      });
    if (path === `/v1/jobs/${a}/profile-integrations`) {
      const input = JSON.parse(String(init?.body)),
        source = (await f.adapter.load())!,
        candidate = withJobAnswers(source.draft, a, [answer]),
        text =
          "Automated internal workflows and simplified the weekly reporting process.",
        draft = acceptWording(candidate, answer.targetId, {
          scope: "experience",
          origin: "ai_generated",
          text,
          sources: careerContext(candidate, answer.targetId).facts,
        });
      operation = {
        id: input.operationId,
        kind: "integration",
        state: "ready",
        input: { ...input, jobId: a },
        result: { draft: encodeDraft(draft), proposal: { text } },
        createdAt: new Date().toISOString(),
      };
      return Response.json(operation);
    }
    if (path.endsWith("/accept")) {
      accepted = true;
      const { decodeDraft } =
        await import("@resumora/contracts/editor/transport");
      const source = (await f.adapter.load())!;
      return Response.json(
        await f.adapter.save({
          draft: decodeDraft(operation.result.draft),
          expectedRevision: source.revision,
          requestId: crypto.randomUUID(),
          mode: "autosave",
        }),
      );
    }
    return f.transport(path, init);
  };
  window.location.hash = `#/jobs/${a}?panel=answers`;
  render(<App {...f} transport={transport} />);
  fireEvent.click(
    await screen.findByRole("checkbox", { name: answer.questionText }),
  );
  fireEvent.change(screen.getByRole("combobox", { name: "Rolul din profil" }), {
    target: { value: answer.targetId },
  });
  const propose = screen.getByRole("button", {
    name: "Propune îmbunătățirea rolului",
  });
  await waitFor(
    () => expect((propose as HTMLButtonElement).disabled).toBe(false),
    { timeout: 2000 },
  );
  fireEvent.click(propose);
  await screen.findByRole("region", { name: "Verifică integrarea în profil" });
  expect(accepted).toBe(false);
  expect(
    (await f.adapter.load())!.draft.answers.some((a) => a.text === answer.text),
  ).toBe(false);
  fireEvent.click(
    screen.getByRole("button", {
      name: "Integrează întrebările, răspunsurile și textul în profil",
    }),
  );
  await screen.findByText(/Întrebările, răspunsurile și formularea aprobată/);
  const saved = (await f.adapter.load())!;
  expect(saved.draft.answers.find((a) => a.text === answer.text)).toMatchObject(
    {
      questionText: answer.questionText,
      origin: { jobId: a, answerId: answer.id, answerRevision: 1 },
    },
  );
  expect(saved.draft.roles[0].id).toBe(answer.targetId);
  expect(f.documents.get(b + ":en").draft).toEqual(currentCv);
  await route("#/profile");
  await waitFor(() =>
    expect(document.querySelector("#profile-experience")).toBeTruthy(),
  );
  const role = await screen.findByRole("region", {
    name: f.profile.roles[0].title.value,
  });
  expect(within(role).getByText(operation.result.proposal.text)).toBeTruthy();
});

it("keeps saved jobs available if unfinished draft discovery fails and retries without submitting", async () => {
  const f = await fixture();
  let failDrafts = true;
  const original = f.transport;
  const transport: AuthTransport = vi.fn(async (path, init) => {
    if (path === "/v1/workspace-drafts" && failDrafts)
      return Response.json({ error: { code: "unavailable" } }, { status: 503 });
    return original(path, init);
  });
  window.location.hash = "#/jobs";
  render(<App {...f} transport={transport} />);
  await screen.findByRole("heading", { name: "First job" });
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    expect.stringContaining("anunțurile începute"),
  );
  failDrafts = false;
  fireEvent.click(
    screen.getByRole("button", { name: "Reîncearcă încărcarea" }),
  );
  await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  expect(
    f.calls.some((c) => c.body && !c.path.startsWith("/v1/workspace-drafts/")),
  ).toBe(false);
});

it("shows saved jobs while the optional draft request is still pending", async () => {
  const f = await fixture(),
    original = f.transport;
  const transport: AuthTransport = vi.fn((path, init) =>
    path === "/v1/workspace-drafts"
      ? new Promise<Response>(() => {})
      : original(path, init),
  );
  window.location.hash = "#/jobs";
  render(<App {...f} transport={transport} />);
  await screen.findByRole("heading", { name: "First job" });
  expect(screen.queryByText("Încărcăm joburile…")).toBeNull();
});
it.each(["click", "direct link", "refresh"])(
  "keeps Improve skills open without a missing-role error after %s",
  async (entry) => {
    Object.defineProperty(crypto, "subtle", {
      configurable: true,
      value: webcrypto.subtle,
    });
    const f = await fixture();
    window.location.hash =
      entry === "direct link" ? "#/profile/enrich/__improve_skills" : "#/profile";
    let view = render(<App {...f} />);
    if (entry !== "direct link") {
      await startSkills();
    }
    if (entry !== "direct link") {
      await screen.findByText(
        "Nu am putut finaliza îmbunătățirea. Competențele tale sunt păstrate.",
        {}, { timeout: 4000 },
      );
    } else {
      await screen.findByRole("button", {name: "Îmbunătățește competențele"});
    }
    expect(window.location.hash).toBe("#/profile/enrich/__improve_skills");
    expect(screen.queryByText("Acest rol nu mai există în profil.")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();

    if (entry === "refresh") {
      await waitFor(() => expect(screen.getByRole("button", {name: "Îmbunătățește competențele"}).matches(":disabled")).toBe(false), {timeout:4000});
      view.unmount();
      view = render(<App {...f} />);
    } else {
      await route("#/profile");
      await route("#/profile/enrich/__improve_skills");
    }
    await waitFor(() => expect(screen.getByRole("button", {name: "Îmbunătățește competențele"}).matches(":disabled")).toBe(false));
    expect(screen.queryByText("Nu am putut finaliza îmbunătățirea. Competențele tale sunt păstrate.")).toBeNull();
    expect(window.location.hash).toBe("#/profile/enrich/__improve_skills");
    expect(screen.queryByText("Acest rol nu mai există în profil.")).toBeNull();
  },
);

it("still redirects enrichment for a missing role to the profile", async () => {
  const f = await fixture();
  window.location.hash = "#/profile/enrich/missing-role";
  render(<App {...f} />);
  await screen.findByText("Acest rol nu mai există în profil.", {}, {timeout:4000});
  expect(window.location.hash).toBe("#/profile");
});

it("prevents changing skills while improvement is running and unlocks them on failure", async () => {
  Object.defineProperty(crypto, "subtle", { configurable: true, value: webcrypto.subtle });
  const f = await fixture();
  const skill = f.profile.technicalSkills[0];
  expect(skill).toBeTruthy();
  let reject!: (error: Error) => void;
  const improveSkills = vi.fn(() => new Promise((_resolve, fail) => { reject = fail; }));
  window.location.hash = "#/profile";
  render(<App {...f} intelligence={{ improveSkills } as any} />);
  const edit = await screen.findByRole("button", { name: "Editează: Competență T1" });
  await startSkills();
  await waitFor(() => expect(improveSkills).toHaveBeenCalledTimes(1), { timeout: 4000 });
  expect(edit.matches(":disabled")).toBe(true);
  for (const control of screen.getAllByRole("button").filter(b => /^(Editează:|Anulează ultima modificare)/.test(b.getAttribute("aria-label") ?? ""))) expect(control.matches(":disabled"), control.outerHTML).toBe(true);
  expect(screen.getByRole("button", { name: `Șterge competența: ${skill.value}` }).matches(":disabled")).toBe(true);
  expect(screen.getByRole("button", { name: "Adaugă o competență tehnică" }).matches(":disabled")).toBe(true);
  await act(async () => reject(Error("AI_DISABLED")));
  await waitFor(() => expect(edit.matches(":disabled")).toBe(false));
});


it("locks the whole profile through saving, blocks history navigation, then permits undo", async () => {
  Object.defineProperty(crypto, "subtle", { configurable: true, value: webcrypto.subtle });
  const {getSkillInventory} = await import("@resumora/contracts/intelligence/skills-improvement");
  const f = await fixture();
  const before = f.profile.technicalSkills[0].value;
  const save = f.adapter.save.bind(f.adapter);
  let release!: () => void;
  let saving = false;
  const gate = new Promise<void>(resolve => { release = resolve; });
  vi.spyOn(f.adapter, "save").mockImplementation(async input => {
    if (input.draft.technicalSkills[0]?.value === "Improved skill" && !input.draft.skillReview) {
      saving = true;
      await gate;
    }
    return save(input);
  });
  const improveSkills = vi.fn(async (context: any) => {
    const inventory = getSkillInventory(f.profile);
    inventory.technicalSkills[0].value = "Improved skill";
    return {schemaVersion:"skills-improvement/1", fingerprint:context.fingerprint, inventory, removed:[]};
  });
  window.location.hash = "#/profile";
  render(<App {...f} intelligence={{improveSkills} as any} />);
  await startSkills();
  await waitFor(() => expect(saving).toBe(true), {timeout:4000});
  for (const control of screen.getAllByRole("button").filter(b => /^(Editează:|Anulează ultima modificare)/.test(b.getAttribute("aria-label") ?? ""))) {
    expect(control.matches(":disabled"), control.outerHTML).toBe(true);
    fireEvent.click(control);
  }
  expect(screen.getByRole("button", {name:"Editează: Competență T1"}).textContent).toContain(before);
  await route("#/profile/history");
  expect(window.location.hash).toBe("#/profile/enrich/__improve_skills");
  await act(async () => release());
  await screen.findByText("Competențe îmbunătățite și salvate.");
  expect(screen.getByRole("button", {name:"Editează: Competență T1"}).matches(":disabled")).toBe(false);
  fireEvent.click(screen.getByRole("button", {name:"Anulează îmbunătățirea"}));
  await waitFor(() => expect(screen.getByRole("button", {name:"Editează: Competență T1"}).textContent).toContain(before));
  expect(improveSkills).toHaveBeenCalledTimes(1);
});

it("a direct Improve skills route completes language detection and waits for a click", async () => {
  Object.defineProperty(crypto, "subtle", {configurable:true,value:webcrypto.subtle});
  const f=await fixture();
  const needsLanguage = clone(f.profile);
  delete needsLanguage.contentLanguage;
  delete needsLanguage.translation;
  needsLanguage.summary.text = "I coordinate a team of specialists and develop solutions to improve service quality and operational reporting for our clients. ".repeat(3);
  await f.adapter.save({draft:needsLanguage, expectedRevision:f.snapshot.revision, requestId:crypto.randomUUID(), mode:"autosave"});

  let detected!: (v:any)=>void;
  const detectLanguage=vi.fn(()=>new Promise(resolve=>{detected=resolve;}));
  const improveSkills=vi.fn(async()=>{throw Error("AI_DISABLED");});
  window.location.hash="#/profile/enrich/__improve_skills";
  render(<App {...f} intelligence={{detectLanguage,improveSkills} as any}/>);
  await waitFor(()=>expect(detectLanguage).toHaveBeenCalledTimes(1), {timeout:4000});
  expect(improveSkills).not.toHaveBeenCalled();
  await act(async()=>detected({locale:"ro",confidence:"high",source:"narrative",policyVersion:"cv-language/1"}));
  await waitFor(() => expect(screen.getByRole("button", {name: "Îmbunătățește competențele"}).matches(":disabled")).toBe(false));
  expect(improveSkills).not.toHaveBeenCalled();
  await startSkills();
  await waitFor(()=>expect(improveSkills).toHaveBeenCalledTimes(1), {timeout:4000});
  await waitFor(()=>expect(screen.getByRole("button",{name:"Editează: Competență T1"}).matches(":disabled")).toBe(false));
});

it.each(["success", "failure"])("refresh after skills %s never starts another improvement", async (outcome) => {
  Object.defineProperty(crypto, "subtle", { configurable: true, value: webcrypto.subtle });
  const { getSkillInventory } = await import("@resumora/contracts/intelligence/skills-improvement");
  const f = await fixture();
  const improveSkills = vi.fn(async (context: any) => {
    if (outcome === "failure") throw Error("AI_DISABLED");
    return { schemaVersion: "skills-improvement/1", fingerprint: context.fingerprint,
      inventory: getSkillInventory(f.profile), removed: [] };
  });
  window.location.hash = "#/profile";
  let view = render(<App {...f} intelligence={{ improveSkills } as any} />);
  await startSkills();
  await screen.findByText(outcome === "success"
    ? "Competențe îmbunătățite și salvate."
    : "Nu am putut finaliza îmbunătățirea. Competențele tale sunt păstrate.", {}, { timeout: 4000 });
  await waitFor(() => expect(screen.getByRole("button", {name: "Îmbunătățește competențele"}).matches(":disabled")).toBe(false));
  expect(improveSkills).toHaveBeenCalledTimes(1);
  for (let i = 0; i < 2; i++) {
    expect(window.location.hash).toBe("#/profile/enrich/__improve_skills");
    view.unmount();
    view = render(<App {...f} intelligence={{ improveSkills } as any} />);
    await waitFor(() => expect(screen.getByRole("button", {name: "Îmbunătățește competențele"}).matches(":disabled")).toBe(false));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 150)); });
    expect(improveSkills).toHaveBeenCalledTimes(1);
  }
  await startSkills();
  await waitFor(() => expect(improveSkills).toHaveBeenCalledTimes(2));
});
