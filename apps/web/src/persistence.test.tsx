import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { App } from "./App";
import {
  AdapterError,
  MemoryBaseCvAdapter,
  type BaseCvAdapter,
  type Snapshot,
} from "./base/adapter";
import {
  blankDraft,
  clone,
  fact,
  newOptionalEntry,
  newRole,
  type BaseDraft,
} from "./base/model";
import { HttpBaseCvAdapter } from "./base/http-adapter";
import { decodeDraft, encodeDraft } from "@resumora/contracts/editor/transport";
import { cvRoute } from "../../api/src/cv/routes";

afterEach(() => vi.useRealTimers());

function unloadPrevented() {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

it.each(["session-memory", "durable"] as const)(
  "%s unload protection follows draft persistence and cleans up across adapters",
  async (capability) => {
    window.location.hash = "#start";
    const storage = new MemoryBaseCvAdapter();
    const adapter: BaseCvAdapter = {
      capability,
      load: storage.load.bind(storage),
      history: storage.history.bind(storage),
      save: storage.save.bind(storage),
      restore: storage.restore.bind(storage),
    };
    const view = render(<App adapter={adapter} />);
    const manual = await screen.findByRole("button", {
      name: "Completează manual",
    });
    expect(unloadPrevented()).toBe(false);
    fireEvent.click(manual);
    expect(unloadPrevented()).toBe(true);
    fireEvent.change(screen.getByRole("textbox", { name: /Prenume/ }), {
      target: { value: "Ana" },
    });
    const savedText =
      capability === "durable"
        ? "Ciornă salvată în cont · v1"
        : "Ciornă salvată în sesiune · v1";
    await screen.findByText(savedText);
    expect((await storage.load())?.draft.name.value).toBe("Ana");
    expect(unloadPrevented()).toBe(capability === "session-memory");
    fireEvent.click(screen.getByRole("link", { name: "Acasă" }));
    await screen.findByRole("button", { name: "Redeschide versiunea salvată" });
    expect(unloadPrevented()).toBe(capability === "session-memory");
    view.unmount();
    expect(unloadPrevented()).toBe(false);

    window.location.hash = "#base";
    const reopened = render(<App adapter={adapter} />);
    await screen.findByText(savedText);
    expect(unloadPrevented()).toBe(capability === "session-memory");
    fireEvent.change(screen.getByRole("textbox", { name: /Prenume/ }), {
      target: { value: "Mira" },
    });
    expect(unloadPrevented()).toBe(true);
    fireEvent.click(
      screen.getByRole("button", { name: "Anulează ultima modificare" }),
    );
    expect(screen.getByDisplayValue("Ana")).toBeTruthy();
    expect(unloadPrevented()).toBe(capability === "session-memory");
    fireEvent.change(screen.getByRole("textbox", { name: /Prenume/ }), {
      target: { value: "Mira" },
    });
    expect(unloadPrevented()).toBe(true);
    reopened.rerender(<App adapter={new MemoryBaseCvAdapter()} />);
    await screen.findByRole("button", { name: "Completează manual" });
    expect(unloadPrevented()).toBe(false);
    reopened.unmount();
    expect(unloadPrevented()).toBe(false);
  },
);

it("adapter/account change clears prior CV and ignores late previous-account load replies", async () => {
  window.location.hash = "#base";
  const draft = blankDraft();
  draft.name = fact("Account A private");
  let finish!: (row: Snapshot) => void;
  const a: BaseCvAdapter = {
    capability: "durable",
    load: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
    history: async () => [],
    save: async () => {
      throw new Error("unexpected");
    },
    restore: async () => {
      throw new Error("unexpected");
    },
  };
  const view = render(<App adapter={a} />);
  const b = new MemoryBaseCvAdapter();
  view.rerender(<App adapter={b} />);
  await screen.findByRole("button", { name: "Completează manual" });
  await act(async () =>
    finish({
      id: "a",
      revision: 1,
      parentId: null,
      reason: "autosave",
      createdAt: new Date().toISOString(),
      draft,
    }),
  );
  expect(screen.queryByDisplayValue("Account A private")).toBeNull();
  expect(screen.queryByText("Account A private")).toBeNull();
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Completează manual" }),
    ).toBeTruthy(),
  );
});
it("retries failed initial cloud loads without requiring a draft to save", async () => {
  window.location.hash = "#home";
  let loads = 0;
  const adapter = new MemoryBaseCvAdapter();
  const load = adapter.load.bind(adapter);
  adapter.load = async () => {
    if (++loads === 1) throw new Error("offline");
    return load();
  };
  render(<App adapter={adapter} />);
  const retry = await screen.findByRole("button", { name: "Reîncearcă" });
  await act(async () => retry.click());
  await screen.findByRole("button", { name: /Creează CV-ul de bază/ });
  expect(loads).toBe(2);
  expect(screen.queryByRole("alert")).toBeNull();
});

function httpStore() {
  const storage = new MemoryBaseCvAdapter();
  const wire = (row: Snapshot) => ({
    ...row,
    draft: decodeDraft(encodeDraft(row.draft)),
  });
  const transport = vi.fn(
    async (path: string, init?: RequestInit): Promise<Response> => {
      try {
        if (path.endsWith("/history"))
          return Response.json((await storage.history()).map(wire));
        if (init?.method !== "POST") {
          const row = await storage.load();
          return Response.json(row ? wire(row) : null);
        }
        const input = JSON.parse(init.body as string);
        const row = path.endsWith("/restore")
          ? await storage.restore(input)
          : await storage.save(input);
        return Response.json(wire(row));
      } catch (error) {
        if (error instanceof AdapterError)
          return Response.json(
            { error: { code: error.code } },
            {
              status:
                error.code === "validation"
                  ? 422
                  : error.code === "missing"
                    ? 404
                    : 409,
            },
          );
        throw error;
      }
    },
  );
  return {
    storage,
    transport,
    adapter: new HttpBaseCvAdapter(transport),
    writes: () =>
      transport.mock.calls.filter(([, init]) => init?.method === "POST"),
  };
}

function namedDraft(name: string): BaseDraft {
  const draft = blankDraft();
  draft.name = fact(name);
  draft.nameParts = { first: name, last: "" };
  return draft;
}

async function seed(storage: MemoryBaseCvAdapter, draft: BaseDraft) {
  return storage.save({
    draft,
    mode: "autosave",
    expectedRevision: (await storage.load())?.revision ?? 0,
    requestId: crypto.randomUUID(),
  });
}

async function tick(ms = 700) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

it("saves corrected enrichment after the API rejects an oversized autosave", async () => {
  const { adapter, storage, transport, writes } = httpStore();
  const draft = namedDraft("Ana");
  draft.roles.push(newRole());
  await seed(storage, draft);
  window.location.hash = "#enrich";
  render(<App adapter={adapter} />);
  const answer = await screen.findByRole("textbox", {
    name: "Care erau responsabilitățile tale de zi cu zi?",
  });
  const write = vi.fn(async () => {
    throw new Error("gateway must not be called");
  });
  transport.mockImplementationOnce((path, init) =>
    cvRoute(new Request(`https://resumora.invalid${path}`, init), {
      loadDraft: async () => null,
      draftHistory: async () => [],
      saveDraft: write,
      restoreDraft: write,
    }),
  );
  vi.useFakeTimers();
  fireEvent.change(answer, { target: { value: "x".repeat(1048577) } });
  await tick();
  expect(screen.getByRole("alert")).toBeTruthy();
  expect(write).not.toHaveBeenCalled();
  expect((await storage.load())?.revision).toBe(1);
  fireEvent.change(answer, { target: { value: "Corrected context" } });
  await tick();
  expect(screen.queryByRole("alert")).toBeNull();
  expect((await storage.load())?.draft.answers[0].text).toBe(
    "Corrected context",
  );
  const rejected = JSON.parse(writes()[0][1]!.body as string);
  const corrected = JSON.parse(writes()[1][1]!.body as string);
  expect(corrected.requestId).not.toBe(rejected.requestId);
  expect(corrected.expectedRevision).toBe(1);
  expect(writes()).toHaveLength(2);
});

it("autosaves an incomplete draft corrected before the oversized request returns 413", async () => {
  const { adapter, storage, transport, writes } = httpStore();
  const draft = namedDraft("Ana");
  draft.roles.push(newRole());
  await seed(storage, draft);
  window.location.hash = "#enrich";
  render(<App adapter={adapter} />);
  const answer = await screen.findByRole("textbox", {
    name: "Care erau responsabilitățile tale de zi cu zi?",
  });
  const write = vi.fn(async () => {
    throw new Error("gateway must not be called");
  });
  let deliver!: () => void;
  const responseGate = new Promise<void>((resolve) => {
    deliver = resolve;
  });
  let rejection!: Response;
  transport.mockImplementationOnce(async (path, init) => {
    rejection = await cvRoute(
      new Request(`https://resumora.invalid${path}`, init),
      {
        loadDraft: async () => null,
        draftHistory: async () => [],
        saveDraft: write,
        restoreDraft: write,
      },
    );
    await responseGate;
    return rejection;
  });
  vi.useFakeTimers();
  fireEvent.change(answer, { target: { value: "x".repeat(1048577) } });
  await tick();
  expect(rejection.status).toBe(413);
  expect(screen.getByText(/^Se salvează…/)).toBeTruthy();
  fireEvent.change(answer, { target: { value: "Corrected while pending" } });
  await tick();
  expect(writes()).toHaveLength(1);
  await act(async () => deliver());
  expect(screen.queryByRole("alert")).toBeNull();
  await tick();
  expect((await storage.load())?.draft.answers[0].text).toBe(
    "Corrected while pending",
  );
  expect((await storage.history()).map((row) => row.revision)).toEqual([2, 1]);
  expect(write).not.toHaveBeenCalled();
  const rejected = JSON.parse(writes()[0][1]!.body as string);
  const corrected = JSON.parse(writes()[1][1]!.body as string);
  expect(corrected).toMatchObject({ mode: "autosave", expectedRevision: 1 });
  expect(corrected.requestId).not.toBe(rejected.requestId);
  await tick(2000);
  expect(writes()).toHaveLength(2);
});

it.each(["save", "restore"] as const)(
  "keeps an unknown %s after Undo and denied replays until exact recovery",
  async (kind) => {
    const { adapter, storage, transport, writes } = httpStore();
    await seed(storage, namedDraft("Ana"));
    if (kind === "restore") await seed(storage, namedDraft("Mira"));
    window.location.hash = "#base";
    render(<App adapter={adapter} />);
    await screen.findByRole("textbox", { name: /Prenume/ });
    vi.useFakeTimers();
    fireEvent.change(screen.getByRole("textbox", { name: /Prenume/ }), {
      target: { value: "Temporary" },
    });
    if (kind === "restore") {
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Istoric" }));
      });
      fireEvent.click(screen.getByRole("button", { name: "Restaurează v1" }));
    }
    const send = transport.getMockImplementation()!;
    transport.mockImplementationOnce(async (...args) => {
      await send(...args);
      throw new Error("response lost after commit");
    });
    if (kind === "restore") {
      await act(async () => {
        fireEvent.click(
          screen.getByRole("button", { name: "Restaurează versiunea" }),
        );
      });
      fireEvent.click(screen.getByRole("link", { name: "CV de bază" }));
      await tick(10);
    } else {
      await tick();
    }
    fireEvent.click(
      screen.getByRole("button", { name: "Anulează ultima modificare" }),
    );
    const original = kind === "save" ? "Ana" : "Mira";
    expect(screen.getByDisplayValue(original)).toBeTruthy();
    expect(unloadPrevented()).toBe(true);
    for (const [status, code] of [
      [401, "unauthorized"],
      [403, "forbidden"],
      [404, "missing"],
      [409, "conflict"],
    ] as const) {
      const count = writes().length;
      transport.mockImplementationOnce(async () =>
        Response.json({ error: { code } }, { status }),
      );
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Reîncearcă" }));
      });
      expect(writes()[count]).toEqual(writes()[0]);
      expect(screen.getByDisplayValue(original)).toBeTruthy();
      expect(unloadPrevented()).toBe(true);
      expect(screen.getByRole("button", { name: "Reîncearcă" })).toBeTruthy();
      fireEvent.keyDown(window, { key: "s", ctrlKey: true });
      fireEvent.click(screen.getByRole("button", { name: /Salvează acum/ }));
      await tick(2000);
      expect(writes()).toHaveLength(count + 1);
    }
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Reîncearcă" }));
    });
    expect(writes().at(-1)).toEqual(writes()[0]);
    expect(screen.getByDisplayValue(original)).toBeTruthy();
    expect(unloadPrevented()).toBe(true);
    await tick();
    expect((await storage.load())?.draft.name.value).toBe(original);
    expect(unloadPrevented()).toBe(false);
  },
);

it.each([
  ["save", false],
  ["save", true],
  ["restore", false],
  ["restore", true],
] as const)(
  "reconciles an expired %s through reads, with newer edits: %s",
  async (kind, newer) => {
    const { adapter, storage, transport, writes } = httpStore();
    await seed(storage, namedDraft("Ana"));
    if (kind === "restore") await seed(storage, namedDraft("Mira"));
    window.location.hash = kind === "save" ? "#base" : "#history";
    render(<App adapter={adapter} />);
    if (kind === "restore")
      fireEvent.click(
        await screen.findByRole("button", { name: "Restaurează v1" }),
      );
    else await screen.findByDisplayValue("Ana");
    const send = transport.getMockImplementation()!;
    transport.mockImplementationOnce(async (...args) => {
      await send(...args);
      throw new Error("committed response lost");
    });
    if (kind === "restore") {
      await act(async () => {
        fireEvent.click(
          screen.getByRole("button", { name: "Restaurează versiunea" }),
        );
      });
      fireEvent.click(screen.getByRole("link", { name: "CV de bază" }));
      await screen.findByRole("textbox", { name: /Prenume/ });
      vi.useFakeTimers();
    } else {
      vi.useFakeTimers();
      fireEvent.change(screen.getByRole("textbox", { name: /Prenume/ }), {
        target: { value: "Mira" },
      });
      await tick();
    }
    if (newer)
      fireEvent.change(screen.getByRole("textbox", { name: /Prenume/ }), {
        target: { value: "Newer" },
      });
    transport.mockImplementationOnce(async () =>
      Response.json({ error: { code: "unavailable" } }, { status: 410 }),
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Reîncearcă" }));
    });
    expect(writes()[1]).toEqual(writes()[0]);
    expect(screen.queryByRole("button", { name: "Reîncearcă" })).toBeNull();
    expect(unloadPrevented()).toBe(true);
    await tick(2000);
    expect(writes()).toHaveLength(2);
    transport.mockImplementationOnce(async () => {
      throw new Error("read failed");
    });
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Verifică starea salvată" }),
      );
    });
    expect(screen.getByDisplayValue(newer ? "Newer" : "Mira")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Verifică starea salvată" }),
    ).toBeTruthy();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    transport.mockImplementationOnce(async (...args) => {
      const response = await send(...args);
      await gate;
      return response;
    });
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Verifică starea salvată" }),
      );
    });
    if (newer)
      fireEvent.change(screen.getByRole("textbox", { name: /Prenume/ }), {
        target: { value: "Newest" },
      });
    await act(async () => release());
    const expected = newer ? "Newest" : kind === "save" ? "Mira" : "Ana";
    expect(screen.getByDisplayValue(expected)).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(writes()).toHaveLength(2);
    await tick();
    expect(writes()).toHaveLength(newer ? 3 : 2);
    if (newer)
      expect(JSON.parse(writes()[2][1]!.body as string)).toMatchObject({
        expectedRevision: kind === "save" ? 2 : 3,
      });
    expect((await storage.load())?.draft.name.value).toBe(expected);
    expect(unloadPrevented()).toBe(false);
  },
);

it("preserves CAS conflicts when an expired write has a different remote head", async () => {
  const { adapter, storage, transport, writes } = httpStore();
  await seed(storage, namedDraft("Ana"));
  window.location.hash = "#base";
  render(<App adapter={adapter} />);
  await screen.findByDisplayValue("Ana");
  transport.mockImplementationOnce(async () =>
    Response.json({ error: { code: "unavailable" } }, { status: 410 }),
  );
  vi.useFakeTimers();
  fireEvent.change(screen.getByRole("textbox", { name: /Prenume/ }), {
    target: { value: "Local" },
  });
  await tick();
  await seed(storage, namedDraft("Remote"));
  await act(async () => {
    fireEvent.click(
      screen.getByRole("button", { name: "Verifică starea salvată" }),
    );
  });
  expect(screen.getByRole("alert").textContent).toContain(
    "Sesiunea s-a schimbat",
  );
  expect(screen.getByDisplayValue("Local")).toBeTruthy();
  await tick(2000);
  expect(writes()).toHaveLength(1);
  expect((await storage.load())?.draft.name.value).toBe("Remote");
  fireEvent.click(
    screen.getByRole("button", { name: "Anulează ultima modificare" }),
  );
  expect(screen.getByDisplayValue("Ana")).toBeTruthy();
  expect(unloadPrevented()).toBe(true);
});

it("releases an expired intent after confirming the server head is unchanged", async () => {
  const { adapter, storage, transport, writes } = httpStore();
  await seed(storage, namedDraft("Ana"));
  window.location.hash = "#base";
  render(<App adapter={adapter} />);
  await screen.findByDisplayValue("Ana");
  transport.mockImplementationOnce(async () =>
    Response.json({ error: { code: "unavailable" } }, { status: 410 }),
  );
  vi.useFakeTimers();
  fireEvent.change(screen.getByRole("textbox", { name: /Prenume/ }), {
    target: { value: "Local" },
  });
  await tick();
  expect((await storage.load())?.revision).toBe(1);
  await act(async () => {
    fireEvent.click(
      screen.getByRole("button", { name: "Verifică starea salvată" }),
    );
  });
  expect(writes()).toHaveLength(1);
  await tick();
  expect((await storage.load())?.draft.name.value).toBe("Local");
  const expired = JSON.parse(writes()[0][1]!.body as string);
  const fresh = JSON.parse(writes()[1][1]!.body as string);
  expect(fresh.requestId).not.toBe(expired.requestId);
  expect(fresh.expectedRevision).toBe(1);
  expect(unloadPrevented()).toBe(false);
});

it.each([false, true])(
  "retries history without reopening a loaded draft, dirty: %s",
  async (dirty) => {
    const { adapter, storage, transport, writes } = httpStore();
    await seed(storage, namedDraft("Ana"));
    window.location.hash = "#base";
    render(<App adapter={adapter} />);
    await screen.findByDisplayValue("Ana");
    vi.useFakeTimers();
    if (dirty)
      fireEvent.change(screen.getByRole("textbox", { name: /Prenume/ }), {
        target: { value: "Local" },
      });
    transport.mockImplementationOnce(async () =>
      Response.json({ error: { code: "unavailable" } }, { status: 503 }),
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Istoric" }));
    });
    expect(
      screen.getByRole("button", { name: "Reîncearcă istoricul" }),
    ).toBeTruthy();
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Reîncearcă istoricul" }),
      );
    });
    expect(transport.mock.calls.map(([path]) => path)).toEqual([
      "/v1/base-cv",
      "/v1/base-cv/history",
      "/v1/base-cv/history",
    ]);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(window.location.hash).toBe("#history");
    expect(writes()).toHaveLength(0);
    fireEvent.click(screen.getByRole("link", { name: "CV de bază" }));
    await tick(10);
    expect(screen.getByDisplayValue(dirty ? "Local" : "Ana")).toBeTruthy();
  },
);

it.each(["session-memory", "durable"] as const)(
  "describes %s enrichment storage in Romanian and English",
  async (capability) => {
    const store = httpStore();
    const adapter = capability === "durable" ? store.adapter : store.storage;
    const draft = namedDraft("Ana");
    draft.roles.push(newRole());
    await seed(store.storage, draft);
    window.location.hash = "#enrich";
    render(<App adapter={adapter} />);
    const answer = await screen.findByRole("textbox", {
      name: "Care erau responsabilitățile tale de zi cu zi?",
    });
    expect(
      screen.getByText(
        capability === "durable"
          ? /Contextul se salvează automat în contul tău/
          : /Contextul rămâne în memoria paginii/,
      ),
    ).toBeTruthy();
    fireEvent.change(
      screen.getByRole("combobox", { name: "Limba interfeței" }),
      { target: { value: "en" } },
    );
    expect(
      screen.getByText(
        capability === "durable"
          ? /Context autosaves to your account/
          : /Context stays in page memory/,
      ),
    ).toBeTruthy();
    vi.useFakeTimers();
    fireEvent.change(answer, { target: { value: "Exact context" } });
    await tick();
    expect((await store.storage.load())?.draft.answers[0].text).toBe(
      "Exact context",
    );
    expect(store.writes()).toHaveLength(capability === "durable" ? 1 : 0);
  },
);

it("settles a decoded HTTP save without repeated autosaves or a durable unload warning", async () => {
  const { adapter, writes } = httpStore();
  window.location.hash = "#start";
  render(<App adapter={adapter} />);
  const manual = await screen.findByRole("button", {
    name: "Completează manual",
  });
  vi.useFakeTimers();
  fireEvent.click(manual);
  fireEvent.change(screen.getByRole("textbox", { name: /Prenume/ }), {
    target: { value: "Ana" },
  });
  await tick();
  expect(screen.getByText("Ciornă salvată în cont · v1")).toBeTruthy();
  expect(unloadPrevented()).toBe(false);
  await tick(2000);
  expect(writes()).toHaveLength(1);
});

it.each([false, true])(
  "replays a committed autosave after response loss, with newer edits: %s",
  async (newer) => {
    const { adapter, storage, transport, writes } = httpStore();
    window.location.hash = "#start";
    render(<App adapter={adapter} />);
    const manual = await screen.findByRole("button", {
      name: "Completează manual",
    });
    const send = transport.getMockImplementation()!;
    transport.mockImplementationOnce(async (...args) => {
      await send(...args);
      throw new Error("response lost after commit");
    });
    vi.useFakeTimers();
    fireEvent.click(manual);
    fireEvent.change(screen.getByRole("textbox", { name: /Prenume/ }), {
      target: { value: "Ana" },
    });
    await tick();
    expect(screen.getByRole("alert")).toBeTruthy();
    expect((await storage.load())?.draft.name.value).toBe("Ana");
    const submitted = writes()[0][1]!.body;
    expect(JSON.parse(submitted as string)).toMatchObject({
      mode: "autosave",
      expectedRevision: 0,
    });
    if (newer)
      fireEvent.change(screen.getByRole("textbox", { name: /Prenume/ }), {
        target: { value: "Mira" },
      });
    fireEvent.keyDown(window, { key: "s", ctrlKey: true });
    fireEvent.click(screen.getByRole("button", { name: /Salvează acum/ }));
    await tick(2000);
    expect(writes()).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Reîncearcă" })).toBeTruthy();
    transport.mockImplementationOnce(async (...args) => {
      await send(...args);
      throw new Error("replay response also lost");
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Reîncearcă" }));
    });
    expect(writes()[1][1]!.body).toBe(submitted);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Reîncearcă" }));
    });
    expect(writes()[2][1]!.body).toBe(submitted);
    expect(await storage.history()).toHaveLength(1);
    expect(screen.getByDisplayValue(newer ? "Mira" : "Ana")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(unloadPrevented()).toBe(newer);
    await tick();
    expect((await storage.load())?.draft.name.value).toBe(
      newer ? "Mira" : "Ana",
    );
    expect(writes()).toHaveLength(newer ? 4 : 3);
    if (newer) {
      const next = JSON.parse(writes()[3][1]!.body as string);
      expect(next.expectedRevision).toBe(1);
      expect(next.requestId).not.toBe(
        JSON.parse(submitted as string).requestId,
      );
    }
    expect(unloadPrevented()).toBe(false);
  },
);

it.each([false, true])(
  "replays a committed restore after response loss, with newer edits: %s",
  async (newer) => {
    const { adapter, storage, transport, writes } = httpStore();
    const first = await seed(storage, namedDraft("Ana"));
    await seed(storage, namedDraft("Mira"));
    window.location.hash = "#history";
    render(<App adapter={adapter} />);
    const restore = await screen.findByRole("button", {
      name: "Restaurează v1",
    });
    fireEvent.click(restore);
    const send = transport.getMockImplementation()!;
    transport.mockImplementationOnce(async (...args) => {
      await send(...args);
      throw new Error("restore response lost after commit");
    });
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Restaurează versiunea" }),
      );
    });
    expect(screen.getByRole("button", { name: "Reîncearcă" })).toBeTruthy();
    expect((await storage.load())?.restoredFrom).toBe(first.id);
    const submitted = writes()[0][1]!.body;
    expect(writes()[0][0]).toBe("/v1/base-cv/restore");
    expect(JSON.parse(submitted as string)).toMatchObject({
      snapshotId: first.id,
      expectedRevision: 2,
    });
    fireEvent.click(screen.getByRole("link", { name: "CV de bază" }));
    await screen.findByRole("textbox", { name: /Prenume/ });
    vi.useFakeTimers();
    if (newer)
      fireEvent.change(screen.getByRole("textbox", { name: /Prenume/ }), {
        target: { value: "Newer" },
      });
    fireEvent.keyDown(window, { key: "s", ctrlKey: true });
    await tick(2000);
    expect(writes()).toHaveLength(1);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Reîncearcă" }));
    });
    expect(writes()[1]).toEqual(writes()[0]);
    expect(screen.getByDisplayValue(newer ? "Newer" : "Ana")).toBeTruthy();
    expect((await storage.history()).map((row) => row.revision)).toEqual([
      3, 2, 1,
    ]);
    expect(unloadPrevented()).toBe(newer);
    await tick();
    expect((await storage.load())?.draft.name.value).toBe(
      newer ? "Newer" : "Ana",
    );
    expect(writes()).toHaveLength(newer ? 3 : 2);
    expect(unloadPrevented()).toBe(false);
  },
);

it("replays the exact explicit checkpoint instead of submitting a new save", async () => {
  const { adapter, storage, transport, writes } = httpStore();
  const draft = namedDraft("Ana");
  draft.nameParts!.last = "Example";
  draft.name = fact("Ana Example");
  draft.titles[0] = fact("Analist");
  draft.contacts.forEach((contact) => {
    contact.value = fact(
      contact.kind === "email"
        ? "test@example.test"
        : contact.platform === "linkedin"
          ? "https://linkedin.com/in/synthetic"
          : "Synthetic contact",
    );
  });
  const language = newOptionalEntry();
  language.title = fact("Română");
  language.proficiency = fact("Native");
  draft.optionalSections[0].entries.push(language);
  await seed(storage, draft);
  window.location.hash = "#base";
  render(<App adapter={adapter} />);
  await screen.findByDisplayValue("Ana");
  const send = transport.getMockImplementation()!;
  transport.mockImplementationOnce(async (...args) => {
    await send(...args);
    throw new Error("checkpoint response lost");
  });
  vi.useFakeTimers();
  fireEvent.change(screen.getByRole("textbox", { name: /Prenume/ }), {
    target: { value: "Mira" },
  });
  await act(async () => {
    fireEvent.keyDown(window, { key: "s", ctrlKey: true });
  });
  expect(screen.getByRole("button", { name: "Reîncearcă" })).toBeTruthy();
  expect(JSON.parse(writes()[0][1]!.body as string).mode).toBe("checkpoint");
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Reîncearcă" }));
  });
  expect(writes()[1]).toEqual(writes()[0]);
  expect((await storage.history()).map((row) => row.revision)).toEqual([2, 1]);
  expect(screen.queryByRole("alert")).toBeNull();
  expect(unloadPrevented()).toBe(false);
});

it("retains a stale draft on conflict and permits recovery through explicit reopen", async () => {
  const { adapter, storage, writes } = httpStore();
  const first = await seed(storage, namedDraft("Ana"));
  window.location.hash = "#base";
  render(<App adapter={adapter} />);
  await screen.findByDisplayValue("Ana");
  const remote = clone(first.draft);
  remote.name = fact("Remote");
  remote.nameParts = { first: "Remote", last: "" };
  await seed(storage, remote);
  vi.useFakeTimers();
  fireEvent.change(screen.getByRole("textbox", { name: /Prenume/ }), {
    target: { value: "Local" },
  });
  await tick();
  expect(screen.getByRole("alert").textContent).toContain(
    "Sesiunea s-a schimbat",
  );
  expect(screen.getByDisplayValue("Local")).toBeTruthy();
  expect((await storage.load())?.draft.name.value).toBe("Remote");
  await tick(2000);
  expect(writes()).toHaveLength(1);
  fireEvent.click(screen.getByRole("link", { name: "Acasă" }));
  await tick(10);
  fireEvent.click(
    screen.getByRole("button", { name: "Redeschide versiunea salvată" }),
  );
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Înlocuiește ciorna" }));
  });
  expect(screen.getByDisplayValue("Remote")).toBeTruthy();
  expect(screen.queryByRole("alert")).toBeNull();
  expect(unloadPrevented()).toBe(false);
});
