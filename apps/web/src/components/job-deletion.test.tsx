import {
  fireEvent,
  render,
  screen,
  waitFor,
  act,
} from "@testing-library/react";
import { it, expect, vi } from "vitest";
import { JobsWorkspace } from "./JobsWorkspace";
import { LanguageContext } from "./ui";
import { WorkspaceContext, WorkspaceRegistry } from "../workspace/context";
import { workspaceLocation } from "../base/routes";
import { DocumentController } from "../workspace/document-controller";
import { DeleteJobButton } from "./DeleteJobButton";
const first = "11111111-1111-4111-8111-111111111111",
  second = "22222222-2222-4222-8222-222222222222";
function fixture(remove: (body: any) => Promise<Response>) {
  let jobs = [
    { id: first, title: "First job" },
    { id: second, title: "Second job" },
  ].map((j) => ({ ...j, state: "draft", createdAt: "2026-11-03T00:00:00Z" }));
  const transport = vi.fn(async (path: string, init?: RequestInit) => {
    if (path === "/v1/jobs") return Response.json(jobs);
    if (path === "/v1/workspace-drafts") return Response.json([]);
    if (path === `/v1/jobs/${first}/delete`) {
      const response = await remove(JSON.parse(String(init?.body)));
      if (response.ok) jobs = jobs.filter((j) => j.id !== first);
      return response;
    }
    throw Error("Unexpected request " + path);
  });
  const registry = new WorkspaceRegistry(transport),
    onDeleted = vi.fn();
  function open() {
    return render(
      <LanguageContext value="en">
        <WorkspaceContext value={registry}>
          <JobsWorkspace
            location={workspaceLocation("#/jobs")}
            profile={null}
            snapshot={null}
            ready={false}
            navigate={vi.fn()}
            onDocument={vi.fn()}
            onProfileAccepted={vi.fn()}
            onJobDeleted={onDeleted}
          />
        </WorkspaceContext>
      </LanguageContext>,
    );
  }
  return { registry, transport, open, onDeleted };
}
it("cancelled deletion does not remove the saved job or send a command", async () => {
  const f = fixture(async () => Response.json({ jobId: first, deleted: true }));
  vi.spyOn(window, "confirm").mockReturnValue(false);
  f.open();
  fireEvent.click(
    await screen.findByRole("button", { name: "Delete job: First job" }),
  );
  expect(screen.getByRole("heading", { name: "First job" })).toBeTruthy();
  expect(
    f.transport.mock.calls.filter(([path]) => path.endsWith("/delete")),
  ).toHaveLength(0);
});
it("deletes only after acknowledgement, preserves the other job and stays deleted after reload", async () => {
  let finish!: (r: Response) => void;
  const f = fixture(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  vi.spyOn(window, "confirm").mockReturnValue(true);
  const view = f.open();
  fireEvent.click(
    await screen.findByRole("button", { name: "Delete job: First job" }),
  );
  expect(window.confirm).toHaveBeenCalledWith(
    expect.stringMatching(/First job[\s\S]*tailored CVs/),
  );
  expect(screen.getByRole("heading", { name: "First job" })).toBeTruthy();
  await act(async () => {
    finish(Response.json({ jobId: first, deleted: true }));
  });
  await waitFor(() =>
    expect(screen.queryByRole("heading", { name: "First job" })).toBeNull(),
  );
  expect(screen.getByRole("heading", { name: "Second job" })).toBeTruthy();
  expect(f.onDeleted).toHaveBeenCalledWith(first);
  view.unmount();
  f.open();
  await screen.findByRole("heading", { name: "Second job" });
  expect(screen.queryByRole("heading", { name: "First job" })).toBeNull();
});
it("a failed delete keeps the job and retries the same command without duplicate clicks", async () => {
  const bodies: any[] = [];
  let fail!: (response: Response) => void;
  const f = fixture(async (body) => {
    bodies.push(body);
    return bodies.length === 1
      ? new Promise<Response>((resolve) => {
          fail = resolve;
        })
      : Response.json({ jobId: first, deleted: true });
  });
  vi.spyOn(window, "confirm").mockReturnValue(true);
  f.open();
  const button = await screen.findByRole("button", {
    name: "Delete job: First job",
  });
  fireEvent.click(button);
  fireEvent.click(button);
  expect(bodies).toHaveLength(1);
  await act(async () => {
    fail(Response.json({ error: { code: "unavailable" } }, { status: 503 }));
  });
  await screen.findByRole("alert");
  expect(screen.getByRole("heading", { name: "First job" })).toBeTruthy();
  expect(bodies).toHaveLength(1);
  fireEvent.click(button);
  await waitFor(() =>
    expect(screen.queryByRole("heading", { name: "First job" })).toBeNull(),
  );
  expect(bodies).toHaveLength(2);
  expect(bodies[0]).toEqual(bodies[1]);
});
it("does not hide a job when a successful HTTP response acknowledges a different job", async () => {
  const f = fixture(async () =>
    Response.json({ jobId: second, deleted: true }),
  );
  vi.spyOn(window, "confirm").mockReturnValue(true);
  f.open();
  fireEvent.click(
    await screen.findByRole("button", { name: "Delete job: First job" }),
  );
  await screen.findByRole("alert");
  expect(screen.getByRole("heading", { name: "First job" })).toBeTruthy();
  expect(f.onDeleted).not.toHaveBeenCalled();
  expect(f.registry.deletedJobs.has(first)).toBe(false);
});
it("an older list response cannot put an acknowledged deleted job back", async () => {
  const f = fixture(async () => Response.json({ jobId: first, deleted: true })),
    original = f.registry.transport!;
  let lists = 0,
    drafts = 0,
    finish!: (r: Response) => void;
  f.registry.transport = async (path, init) => {
    if (path === "/v1/jobs" && ++lists === 2)
      return new Promise<Response>((resolve) => {
        finish = resolve;
      });
    if (path === "/v1/workspace-drafts" && drafts++ === 0)
      return Response.json({ error: { code: "unavailable" } }, { status: 503 });
    return original(path, init);
  };
  vi.spyOn(window, "confirm").mockReturnValue(true);
  f.open();
  await screen.findByRole("heading", { name: "First job" });
  fireEvent.click(await screen.findByRole("button", { name: "Retry loading" }));
  fireEvent.click(
    screen.getByRole("button", { name: "Delete job: First job" }),
  );
  await waitFor(() =>
    expect(screen.queryByRole("heading", { name: "First job" })).toBeNull(),
  );
  await act(async () => {
    finish(
      Response.json([
        {
          id: first,
          title: "First job",
          state: "draft",
          createdAt: "2026-11-03T00:00:00Z",
        },
        {
          id: second,
          title: "Second job",
          state: "draft",
          createdAt: "2026-11-03T00:00:00Z",
        },
      ]),
    );
  });
  expect(screen.queryByRole("heading", { name: "First job" })).toBeNull();
  expect(screen.getByRole("heading", { name: "Second job" })).toBeTruthy();
});
it("retiring a deleted job disposes only its cached documents and work", () => {
  const registry = new WorkspaceRegistry(),
    profile = new DocumentController(),
    a = new DocumentController(),
    b = new DocumentController();
  registry.documents.set("profile", profile);
  registry.documents.set(`job:${first}:en`, a);
  registry.documents.set(`job:${second}:en`, b);
  const firstReview = registry.draft("job-review", first, {}),
    otherReview = registry.draft("job-review", second, {});
  registry.receipt(`job-answer-command:${first}`).current = { pending: true };
  registry.receipt(`job-answer-command:${second}`).current = { pending: true };
  registry.forgetJob(first);
  expect(registry.documents.get("profile")).toBe(profile);
  expect(registry.documents.get(`job:${second}:en`)).toBe(b);
  expect(registry.documents.has(`job:${first}:en`)).toBe(false);
  expect(registry.controllers.has(firstReview.key)).toBe(false);
  expect(registry.controllers.has(otherReview.key)).toBe(true);
  expect(registry.deletedJobs.has(first)).toBe(true);
  expect(registry.commands.has(`job-answer-command:${first}`)).toBe(false);
  expect(registry.commands.has(`job-answer-command:${second}`)).toBe(true);
});
it("a deletion response from a previous account cannot update the replacement account UI", async () => {
  let finish!: (r: Response) => void;
  const onDeleted = vi.fn(),
    oldTransport = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    ),
    nextTransport = vi.fn();
  vi.spyOn(window, "confirm").mockReturnValue(true);
  const view = render(
    <LanguageContext value="en">
      <DeleteJobButton
        jobId={first}
        title="First job"
        transport={oldTransport}
        onDeleted={onDeleted}
      />
    </LanguageContext>,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Delete job: First job" }),
  );
  view.rerender(
    <LanguageContext value="en">
      <DeleteJobButton
        jobId={first}
        title="First job"
        transport={nextTransport}
        onDeleted={onDeleted}
      />
    </LanguageContext>,
  );
  await act(async () => {
    finish(Response.json({ jobId: first, deleted: true }));
  });
  expect(onDeleted).not.toHaveBeenCalled();
});
