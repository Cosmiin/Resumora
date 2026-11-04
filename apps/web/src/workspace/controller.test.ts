import { expect, it, vi } from "vitest";
import { SaveController } from "./controller";
import { workspaceLocation } from "../base/routes";
const deferred = <T>() => {
  let resolve!: (value: T) => void, reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
it("retains an immutable unknown write and newer edits, replaying before the next generation", async () => {
  const first = deferred<{
      value: { text: string };
      revision: number;
      head: null;
    }>(),
    calls: { value: { text: string }; revision: number; id: string }[] = [];
  const controller = new SaveController(
    "intake",
    { text: "" },
    {
      load: async () => null,
      save: async (value, revision, id) => {
        calls.push({ value, revision, id });
        if (calls.length === 1) return first.promise;
        return { value, revision: revision + 1, head: null };
      },
    },
    () => {},
    false,
  );
  await controller.load();
  controller.set({ text: "first" });
  const saving = controller.flush();
  await Promise.resolve();
  await Promise.resolve();
  controller.set({ text: "newer" });
  first.reject(Error("network"));
  await saving;
  expect(controller.state.value.text).toBe("newer");
  expect(controller.state.error).toBe("network");
  await controller.retry();
  expect(calls[1]).toEqual(calls[0]);
  expect(controller.state.dirty).toBe(true);
  await controller.flush();
  expect(calls[2].value.text).toBe("newer");
  expect(calls[2].revision).toBe(1);
  expect(calls[2].id).not.toBe(calls[0].id);
  expect(controller.state.dirty).toBe(false);
});
it("a disposed account cannot receive late load data", async () => {
  const read = deferred<{
    value: { text: string };
    revision: number;
    head: null;
  }>();
  const c = new SaveController(
    "private",
    { text: "" },
    { load: () => read.promise, save: vi.fn() },
  );
  const loading = c.load();
  c.dispose();
  read.resolve({ value: { text: "other account" }, revision: 4, head: null });
  await loading;
  expect(c.state.value.text).toBe("");
});
it("does not claim a failed initial load is saved or overwrite it with an empty default", async () => {
  const save = vi.fn();
  const c = new SaveController(
    "private",
    { text: "" },
    {
      load: async () => {
        throw Error("unavailable");
      },
      save,
    },
  );
  await c.load();
  expect(c.state.ready).toBe(false);
  c.set({ text: "cannot edit unloaded data" });
  expect(await c.flush()).toBe(false);
  expect(save).not.toHaveBeenCalled();
});
it("restores revisioned saved draft data without publishing or starting AI", async () => {
  const save = vi.fn();
  const c = new SaveController(
    "review",
    { text: "" },
    {
      load: async () => ({
        value: { text: "acknowledged" },
        revision: 7,
        head: null,
      }),
      save,
    },
  );
  await c.load();
  expect(c.state.value.text).toBe("acknowledged");
  expect(c.state.revision).toBe(7);
  expect(c.state.dirty).toBe(false);
  expect(save).not.toHaveBeenCalled();
});
it("parses explicit job/language identity and redirects old links without confusing resources", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  expect(
    workspaceLocation(`#/jobs/${id}/cv/en?panel=appearance`),
  ).toMatchObject({
    destination: "jobs",
    view: "job",
    jobId: id,
    locale: "en",
    panel: "appearance",
  });
  expect(workspaceLocation("#base")).toMatchObject({
    view: "profile",
    canonical: "#/profile",
  });
  expect(workspaceLocation("#enrich")).toMatchObject({ view: "enrich" });
  expect(workspaceLocation("#/jobs/foreign")).toMatchObject({
    view: "missing",
  });
  expect(workspaceLocation("#/profile/enrich/dev_role")).toMatchObject({
    targetId: "dev_role",
  });
});
