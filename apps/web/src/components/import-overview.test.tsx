import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ImportDocument } from "./ImportDocument";
import { InitialImportReview } from "./InitialImportReview";
import { LanguageContext } from "./ui";
import { WorkspaceProvider } from "../workspace/context";
import type { AuthTransport } from "../auth/AuthShell";
import type { ImportReview } from "@resumora/contracts/intelligence/model";
import type { IntelligenceClient } from "../base/intelligence";
import { MemoryBaseCvAdapter } from "../base/adapter";
import { App } from "../App";
vi.mock("./OriginalSource", () => ({
  OriginalSource: ({
    candidate,
  }: {
    candidate?: { id: string; quote: string };
  }) => (
    <aside aria-label="Original CV" data-source-candidate={candidate?.id}>
      {candidate?.quote}
    </aside>
  ),
}));
function fixture() {
  const review: ImportReview = {
    id: crypto.randomUUID(),
    format: "docx",
    sourceHash: "a".repeat(64),
    parserVersion: "fixture",
    pages: null,
    admission: { kind: "cv", reason: "CV", pages: [] },
    confirmedIds: [],
    extraction: {
      schemaVersion: "cv-extraction/1",
      warnings: [],
      omittedPages: [],
      candidates: [
        ["name", "Synthetic Owner"],
        ["contacts.email", "owner@example.com"],
        ["contacts.website", "portfolio.example.com"],
        ["roles.0.title", "Systems Analyst"],
        ["roles.0.company", "Synthetic Systems"],
        ["roles.0.start", "01/2020"],
        ["roles.0.end", "01/2022"],
        ["professionalSkills.0", "Collaboration"],
        ["technicalSkills.0", "SQL"],
      ].map(([path, value], i) => ({
        id: "c" + i,
        path,
        value,
        quote: value,
        page: null,
        confidence: "high",
      })),
    },
  };
  const client: IntelligenceClient = {
    listImports: vi.fn(async () => [
      { id: review.id, state: "ready" as const, review },
    ]),
    importStatus: vi.fn(async () => ({
      id: review.id,
      state: "ready" as const,
      review,
    })),
    importDocument: vi.fn(),
    cancelImport: vi.fn(),
    questions: vi.fn(),
    rewrite: vi.fn(),
  };
  const rows = new Map<string, any>(),
    calls: { path: string; body: any }[] = [];
  let failSave = false,
    hold: Promise<void> | undefined;
  const transport: AuthTransport = vi.fn(async (path, init) => {
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ path, body });
    if (path.startsWith("/v1/document-languages"))
      return Response.json({ source: null, versions: [] });
    if (!path.startsWith("/v1/workspace-drafts/"))
      throw Error("Unexpected request " + path);
    if (body) {
      if (hold) await hold;
      if (failSave)
        return Response.json(
          { error: { code: "unavailable" } },
          { status: 503 },
        );
      expect(body.expectedRevision).toBe(rows.get(path)?.revision ?? 0);
      rows.set(path, {
        id: path.split("/").at(-1),
        kind: path.split("/").at(-2),
        revision: body.expectedRevision + 1,
        value: body.value,
        updatedAt: new Date().toISOString(),
      });
    }
    return Response.json(rows.get(path) ?? null, {
      headers: { "X-Profile-Generation": "0" },
    });
  });
  return {
    review,
    client,
    rows,
    calls,
    transport,
    setFailure: (v: boolean) => {
      failSave = v;
    },
    hold: (v: Promise<void> | undefined) => {
      hold = v;
    },
  };
}
const path = (id: string) => "/v1/workspace-drafts/import-review/" + id;
it("stages a high-confidence first import without publishing it, then creates Profile only after explicit confirmation", async () => {
  const f = fixture(),
    adapter = new MemoryBaseCvAdapter();
  window.location.hash = "#/profile/import/" + f.review.id;
  render(
    <App adapter={adapter} intelligence={f.client} transport={f.transport} />,
  );
  await screen.findByRole("heading", { name: "Verifică informațiile din CV" });
  expect(await adapter.load()).toBeNull();
  expect(screen.getByRole("heading", { name: "Systems Analyst" })).toBeTruthy();
  expect(screen.queryByRole("textbox", { name: "Email" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Editează: Email" }));
  fireEvent.change(screen.getByLabelText("Email", { exact: true }), {
    target: { value: "corrected@example.com" },
  });
  await waitFor(
    () =>
      expect(
        f.rows.get(path(f.review.id))?.value.draft.contacts[0].value.value,
      ).toBe("corrected@example.com"),
    { timeout: 2500 },
  );
  expect(await adapter.load()).toBeNull();
  fireEvent.click(
    screen.getByRole("button", { name: "Finalizează verificarea" }),
  );
  await waitFor(
    async () =>
      expect(
        (await adapter.load())?.draft.importReview?.confirmedIds,
      ).toHaveLength(f.review.extraction.candidates.length),
    { timeout: 2500 },
  );
  expect((await adapter.load())?.draft.contacts[0].value.value).toBe(
    "corrected@example.com",
  );
  expect(f.client.importDocument).not.toHaveBeenCalled();
});
it("restores acknowledged review edits after refresh without confirming or generating again", async () => {
  const f = fixture(),
    start = vi.fn(),
    cancel = vi.fn();
  const surface = () => (
    <LanguageContext value="en">
      <WorkspaceProvider transport={f.transport}>
        <InitialImportReview
          review={f.review}
          client={f.client}
          disabled={false}
          start={start}
          cancel={cancel}
        />
      </WorkspaceProvider>
    </LanguageContext>
  );
  const first = render(surface());
  await screen.findByRole("heading", { name: "Check your imported CV" });
  fireEvent.click(screen.getByRole("button", { name: "Edit: Email" }));
  fireEvent.change(screen.getByLabelText("Email", { exact: true }), {
    target: { value: "review-draft@example.com" },
  });
  await waitFor(
    () =>
      expect(
        f.rows.get(path(f.review.id))?.value.draft.contacts[0].value.value,
      ).toBe("review-draft@example.com"),
    { timeout: 2500 },
  );
  first.unmount();
  render(surface());
  expect(await screen.findByText("review-draft@example.com")).toBeTruthy();
  expect(start).not.toHaveBeenCalled();
  expect(
    f.rows.get(path(f.review.id)).value.draft.importReview.confirmedIds,
  ).toEqual([]);
  expect(f.client.importDocument).not.toHaveBeenCalled();
});
it("does not publish after a failed review save and retries the same resource before confirmation", async () => {
  const f = fixture(),
    start = vi.fn();
  f.setFailure(true);
  render(
    <LanguageContext value="en">
      <WorkspaceProvider transport={f.transport}>
        <InitialImportReview
          review={f.review}
          client={f.client}
          disabled={false}
          start={start}
          cancel={() => {}}
        />
      </WorkspaceProvider>
    </LanguageContext>,
  );
  const confirm = await screen.findByRole("button", {
    name: "Finish review",
  });
  fireEvent.click(confirm);
  await screen.findByRole("button", { name: "Retry the same save" });
  expect(start).not.toHaveBeenCalled();
  f.setFailure(false);
  fireEvent.click(screen.getByRole("button", { name: "Retry the same save" }));
  await waitFor(() => expect(f.rows.has(path(f.review.id))).toBe(true));
  fireEvent.click(screen.getByRole("button", { name: "Finish review" }));
  await waitFor(() => expect(start).toHaveBeenCalledTimes(1));
  const saves = f.calls.filter((c) => c.path === path(f.review.id) && c.body);
  expect(saves[0].body).toEqual(saves[1].body);
});
it("ignores a late review-save response after navigating away", async () => {
  const f = fixture(),
    start = vi.fn();
  let release!: () => void;
  f.hold(
    new Promise<void>((resolve) => {
      release = resolve;
    }),
  );
  const view = render(
    <LanguageContext value="en">
      <WorkspaceProvider transport={f.transport}>
        <InitialImportReview
          review={f.review}
          client={f.client}
          disabled={false}
          start={start}
          cancel={() => {}}
        />
      </WorkspaceProvider>
    </LanguageContext>,
  );
  fireEvent.click(
    await screen.findByRole("button", {
      name: "Finish review",
    }),
  );
  await waitFor(() =>
    expect(f.calls.some((c) => c.body && c.path === path(f.review.id))).toBe(
      true,
    ),
  );
  view.unmount();
  await act(async () => release());
  expect(start).not.toHaveBeenCalled();
});
it("ties source selection to the selected card while preserving the edited value across views", async () => {
  const f = fixture(),
    start = vi.fn();
  render(
    <LanguageContext value="en">
      <InitialImportReview
        review={f.review}
        client={f.client}
        disabled={false}
        start={start}
        cancel={() => {}}
      />
    </LanguageContext>,
  );
  const card = await screen.findByRole("region", { name: "Systems Analyst" });
  fireEvent.click(within(card).getByRole("button", { name: "Edit: Title" }));
  fireEvent.click(screen.getByRole("button", { name: "View original CV" }));
  expect(
    screen
      .getByRole("complementary", { name: "Original CV" })
      .getAttribute("data-source-candidate"),
  ).toBe("c3");
  fireEvent.click(screen.getByRole("button", { name: "Back to review" }));
  fireEvent.keyDown(screen.getByRole("textbox", { name: "Title" }), {
    key: "Enter",
  });
  expect(screen.getByRole("heading", { name: "Systems Analyst" })).toBeTruthy();
  expect(start).not.toHaveBeenCalled();
});

it("restores acknowledged skill classification and exclusions without applying the import", async () => {
  const f = fixture(),
    start = vi.fn();
  f.review.extraction.candidates.push({
    id: "unclear",
    path: "unclearSkills.0",
    value: "Advanced skills",
    quote: "Advanced skills",
    page: null,
    confidence: "high",
  });
  const surface = () => (
    <LanguageContext value="en">
      <WorkspaceProvider transport={f.transport}>
        <InitialImportReview
          review={f.review}
          client={f.client}
          disabled={false}
          start={start}
          cancel={() => {}}
        />
      </WorkspaceProvider>
    </LanguageContext>
  );
  const first = render(surface());
  await screen.findByText("Import details and skills");
  if (!(screen.getByText("Import details and skills").closest("details") as HTMLDetailsElement).open) fireEvent.click(screen.getByText("Import details and skills"));
  await screen.findByRole("button", { name: "Move: SQL" });
  fireEvent.click(screen.getByRole("button", { name: "Move: SQL" }));
  fireEvent.click(
    screen.getByRole("button", { name: "Move to professional skills" }),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Technical skills: Advanced skills" }),
  );
  await waitFor(
    () =>
      expect(
        f.rows.get(path(f.review.id))?.value.draft.importSkillChoices,
      ).toEqual({ c8: "professionalSkills", unclear: "technicalSkills" }),
    { timeout: 2500 },
  );
  first.unmount();
  render(surface());
  await screen.findByText("Import details and skills");
  if (!(screen.getByText("Import details and skills").closest("details") as HTMLDetailsElement).open) fireEvent.click(screen.getByText("Import details and skills"));
  const professional = await screen.findByRole("region", {
    name: "Professional skills",
  });
  expect(
    within(professional).getByRole("button", { name: "Move: SQL" }),
  ).toBeTruthy();
  expect(
    within(screen.getByRole("region", { name: "Technical skills" })).getByRole(
      "button",
      { name: "Move: Advanced skills" },
    ),
  ).toBeTruthy();
  expect(start).not.toHaveBeenCalled();
  expect(f.client.importDocument).not.toHaveBeenCalled();
  expect(
    f.rows.get(path(f.review.id)).value.draft.importReview.confirmedIds,
  ).toEqual([]);
});

it("keeps the original closed until requested and returns to the same in-place edit without publishing", async () => {
  const f = fixture(),
    start = vi.fn();
  render(
    <LanguageContext value="en">
      <InitialImportReview
        review={f.review}
        client={f.client}
        disabled={false}
        start={start}
        cancel={() => {}}
      />
    </LanguageContext>,
  );
  await screen.findByRole("heading", { name: "Check your imported CV" });
  expect(
    screen.queryByRole("complementary", { name: "Original CV" }),
  ).toBeNull();
  expect(document.querySelector(".import-source-pane")).toBeNull();
  const card = screen.getByRole("region", { name: "Name and contact" });
  fireEvent.click(within(card).getByRole("button", { name: "Edit: Email" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Email" }), {
    target: { value: "corrected@example.invalid" },
  });
  fireEvent.click(screen.getByRole("button", { name: "View original CV" }));
  expect(screen.getByRole("dialog", { name: "Original CV" })).toBeTruthy();
  const original = screen.getByRole("complementary", { name: "Original CV" });
  fireEvent.click(screen.getByRole("button", { name: "Back to review" }));
  expect(screen.queryByRole("dialog", { name: "Original CV" })).toBeNull();
  expect(
    (screen.getByRole("textbox", { name: "Email" }) as HTMLInputElement).value,
  ).toBe("corrected@example.invalid");
  fireEvent.click(screen.getByRole("button", { name: "View original CV" }));
  expect(screen.getByRole("complementary", { name: "Original CV" })).toBe(
    original,
  );
  fireEvent(
    screen.getByRole("dialog", { name: "Original CV" }),
    new Event("cancel", { bubbles: true, cancelable: true }),
  );
  expect(screen.queryByRole("dialog", { name: "Original CV" })).toBeNull();
  expect(start).not.toHaveBeenCalled();
  expect(f.client.importDocument).not.toHaveBeenCalled();
});

it("opens retained unclassified skills and blocks finishing until the user makes a decision",async()=>{
 const f=fixture(),start=vi.fn();f.review.extraction.candidates.push({id:'domain',path:'unclearSkills.0',value:'Workforce management',quote:'Workforce management',page:null,confidence:'medium',warning:'Category needs review'});
 render(<LanguageContext value="en"><WorkspaceProvider transport={f.transport}><InitialImportReview review={f.review} client={f.client} disabled={false} start={start} cancel={()=>{}} /></WorkspaceProvider></LanguageContext>);
 const finish=await screen.findByRole('button',{name:'Finish review'});expect((finish as HTMLButtonElement).disabled).toBe(true);expect(screen.getByRole('region',{name:'Choose a category'})).toBeTruthy();expect((screen.getByText('Import details and skills').closest('details') as HTMLDetailsElement).open).toBe(true);expect(start).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Professional skills: Workforce management'}));await waitFor(()=>expect((screen.getByRole('button',{name:'Finish review'}) as HTMLButtonElement).disabled).toBe(false),{timeout:2500});expect(start).not.toHaveBeenCalled();expect(f.client.importDocument).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Finish review'}));await waitFor(()=>expect(start).toHaveBeenCalledTimes(1),{timeout:2500});expect(start.mock.calls[0][0].professionalSkills.some((f:any)=>f.value==='Workforce management'&&f.status==='user_confirmed')).toBe(true);
});

it("autosaves a single field confirmation and restores it without publishing the profile", async () => {
  const f = fixture(), start = vi.fn();
  const surface = () => <LanguageContext value="en"><WorkspaceProvider transport={f.transport}><InitialImportReview review={f.review} client={f.client} disabled={false} start={start} cancel={() => {}} /></WorkspaceProvider></LanguageContext>;
  const first = render(surface());
  fireEvent.click(await screen.findByRole("button", { name: "Confirm: Website or profile" }));
  await waitFor(() => expect(f.rows.get(path(f.review.id))?.value.draft.importReview.confirmedIds).toEqual(["c2"]), { timeout: 3000 });
  expect(f.rows.get(path(f.review.id)).value.draft.importReview.extraction).toEqual(f.review.extraction);
  expect(start).not.toHaveBeenCalled();
  first.unmount();
  render(surface());
  await screen.findByRole("heading", { name: "Check your imported CV" });
  expect(screen.queryByRole("button", { name: "Confirm: Website or profile" })).toBeNull();
  expect(screen.queryByRole("button", { name: "1 detail to check" })).toBeNull();
  expect(start).not.toHaveBeenCalled();
});
