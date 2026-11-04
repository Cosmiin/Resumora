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
import type { WorkspaceDraft } from "@resumora/contracts/editor/workspace";
import type { AuthTransport } from "../auth/AuthShell";
const a = "11111111-1111-4111-8111-111111111111",
  b = "22222222-2222-4222-8222-222222222222";
async function startSkills() {
  const button = await screen.findByRole("button", {
    name: "Îmbunătățește competențele",
  });
  await waitFor(() => expect(button.matches(":disabled")).toBe(false), {
    timeout: 4000,
  });
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
it("has one destination, keeps enrichment scoped to one role in a modal, and redirects legacy Base links", async () => {
  const f = await fixture();
  window.location.hash = "#base";
  render(<App {...f} />);
  const nav = screen.getByRole("navigation", { name: "Navigare principală" });
  expect(
    within(nav)
      .getAllByRole("link")
      .map((l) => l.textContent),
  ).toEqual(["Profilul meu"]);
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
  await route("#/profile");
  await screen.findByRole("heading", { name: "Profilul meu" });
  expect(document.querySelector("dialog.experience-modal")).toBeNull();
  await route("#/profile/enrich/" + f.profile.roles[0].id);
  await waitFor(() =>
    expect(document.querySelectorAll("dialog.experience-modal")).toHaveLength(
      1,
    ),
  );
});

it("retiring Profile drafts fences late responses without removing navigation recovery", async () => {
  const registry = new WorkspaceRegistry(),
    draft = registry.draft("import-review", a, { entries: {}, focused: "" }),
    resume = registry.draft("resume", b, {
      route: "#/profile",
    });
  await draft.load();
  await resume.load();
  draft.set({ entries: { private: "obsolete" }, focused: "" });
  registry.clearProfile();
  expect(registry.controllers.has("import-review:" + a)).toBe(false);
  expect(registry.controllers.has("resume:" + b)).toBe(true);
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
    value: { route: "#/profile/history" },
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
    value: { route: "#/profile/history" },
    updatedAt: new Date().toISOString(),
  });
  window.location.hash = "";
  render(<App {...f} />);
  await screen.findByRole("heading", { name: "Istoric în sesiune" });
  expect(window.location.hash).toBe("#/profile/history");
  expect(
    f.calls
      .filter((c) => c.body && c.path.includes("/resume/"))
      .every((c) => Object.keys(c.body.value).join(",") === "route"),
  ).toBe(true);
});

it("keyboard skip navigation focuses the workspace without changing its resource URL", async () => {
  const f = await fixture();
  window.location.hash = "#/profile";
  render(<App {...f} />);
  await screen.findByRole("heading", { name: "Profilul meu" });
  fireEvent.click(screen.getByRole("link", { name: "Mergi la conținut" }));
  expect(document.activeElement).toBe(
    document.getElementById("workspace-main"),
  );
  expect(window.location.hash).toBe("#/profile");
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
      entry === "direct link"
        ? "#/profile/enrich/__improve_skills"
        : "#/profile";
    let view = render(<App {...f} />);
    if (entry !== "direct link") {
      await startSkills();
    }
    if (entry !== "direct link") {
      await screen.findByText(
        "Nu am putut finaliza îmbunătățirea. Competențele tale sunt păstrate.",
        {},
        { timeout: 4000 },
      );
    } else {
      await screen.findByRole("button", { name: "Îmbunătățește competențele" });
    }
    expect(window.location.hash).toBe("#/profile/enrich/__improve_skills");
    expect(screen.queryByText("Acest rol nu mai există în profil.")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();

    if (entry === "refresh") {
      await waitFor(
        () =>
          expect(
            screen
              .getByRole("button", { name: "Îmbunătățește competențele" })
              .matches(":disabled"),
          ).toBe(false),
        { timeout: 4000 },
      );
      view.unmount();
      view = render(<App {...f} />);
    } else {
      await route("#/profile");
      await route("#/profile/enrich/__improve_skills");
    }
    await waitFor(() =>
      expect(
        screen
          .getByRole("button", { name: "Îmbunătățește competențele" })
          .matches(":disabled"),
      ).toBe(false),
    );
    expect(
      screen.queryByText(
        "Nu am putut finaliza îmbunătățirea. Competențele tale sunt păstrate.",
      ),
    ).toBeNull();
    expect(window.location.hash).toBe("#/profile/enrich/__improve_skills");
    expect(screen.queryByText("Acest rol nu mai există în profil.")).toBeNull();
  },
);

it("still redirects enrichment for a missing role to the profile", async () => {
  const f = await fixture();
  window.location.hash = "#/profile/enrich/missing-role";
  render(<App {...f} />);
  await screen.findByText(
    "Acest rol nu mai există în profil.",
    {},
    { timeout: 4000 },
  );
  expect(window.location.hash).toBe("#/profile");
});

it("prevents changing skills while improvement is running and unlocks them on failure", async () => {
  Object.defineProperty(crypto, "subtle", {
    configurable: true,
    value: webcrypto.subtle,
  });
  const f = await fixture();
  const skill = f.profile.technicalSkills[0];
  expect(skill).toBeTruthy();
  let reject!: (error: Error) => void;
  const improveSkills = vi.fn(
    () =>
      new Promise((_resolve, fail) => {
        reject = fail;
      }),
  );
  window.location.hash = "#/profile";
  render(<App {...f} intelligence={{ improveSkills } as any} />);
  const edit = await screen.findByRole("button", {
    name: "Editează: Competență T1",
  });
  await startSkills();
  await waitFor(() => expect(improveSkills).toHaveBeenCalledTimes(1), {
    timeout: 4000,
  });
  expect(edit.matches(":disabled")).toBe(true);
  for (const control of screen
    .getAllByRole("button")
    .filter((b) =>
      /^(Editează:|Anulează ultima modificare)/.test(
        b.getAttribute("aria-label") ?? "",
      ),
    ))
    expect(control.matches(":disabled"), control.outerHTML).toBe(true);
  expect(
    screen
      .getByRole("button", { name: `Șterge competența: ${skill.value}` })
      .matches(":disabled"),
  ).toBe(true);
  expect(
    screen
      .getByRole("button", { name: "Adaugă o competență tehnică" })
      .matches(":disabled"),
  ).toBe(true);
  await act(async () => reject(Error("AI_DISABLED")));
  await waitFor(() => expect(edit.matches(":disabled")).toBe(false));
});

it("locks the whole profile through saving, blocks history navigation, then permits undo", async () => {
  Object.defineProperty(crypto, "subtle", {
    configurable: true,
    value: webcrypto.subtle,
  });
  const { getSkillInventory } =
    await import("@resumora/contracts/intelligence/skills-improvement");
  const f = await fixture();
  const before = f.profile.technicalSkills[0].value;
  const save = f.adapter.save.bind(f.adapter);
  let release!: () => void;
  let saving = false;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  vi.spyOn(f.adapter, "save").mockImplementation(async (input) => {
    if (
      input.draft.technicalSkills[0]?.value === "Improved skill" &&
      !input.draft.skillReview
    ) {
      saving = true;
      await gate;
    }
    return save(input);
  });
  const improveSkills = vi.fn(async (context: any) => {
    const inventory = getSkillInventory(f.profile);
    inventory.technicalSkills[0].value = "Improved skill";
    return {
      schemaVersion: "skills-improvement/1",
      fingerprint: context.fingerprint,
      inventory,
      removed: [],
    };
  });
  window.location.hash = "#/profile";
  render(<App {...f} intelligence={{ improveSkills } as any} />);
  await startSkills();
  await waitFor(() => expect(saving).toBe(true), { timeout: 4000 });
  for (const control of screen
    .getAllByRole("button")
    .filter((b) =>
      /^(Editează:|Anulează ultima modificare)/.test(
        b.getAttribute("aria-label") ?? "",
      ),
    )) {
    expect(control.matches(":disabled"), control.outerHTML).toBe(true);
    fireEvent.click(control);
  }
  expect(
    screen.getByRole("button", { name: "Editează: Competență T1" }).textContent,
  ).toContain(before);
  await route("#/profile/history");
  expect(window.location.hash).toBe("#/profile/enrich/__improve_skills");
  await act(async () => release());
  await screen.findByText("Competențe îmbunătățite și salvate.");
  expect(
    screen
      .getByRole("button", { name: "Editează: Competență T1" })
      .matches(":disabled"),
  ).toBe(false);
  fireEvent.click(
    screen.getByRole("button", { name: "Anulează îmbunătățirea" }),
  );
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Editează: Competență T1" })
        .textContent,
    ).toContain(before),
  );
  expect(improveSkills).toHaveBeenCalledTimes(1);
});

it("a direct Improve skills route completes language detection and waits for a click", async () => {
  Object.defineProperty(crypto, "subtle", {
    configurable: true,
    value: webcrypto.subtle,
  });
  const f = await fixture();
  const needsLanguage = clone(f.profile);
  delete needsLanguage.contentLanguage;
  delete needsLanguage.translation;
  needsLanguage.summary.text =
    "I coordinate a team of specialists and develop solutions to improve service quality and operational reporting for our clients. ".repeat(
      3,
    );
  await f.adapter.save({
    draft: needsLanguage,
    expectedRevision: f.snapshot.revision,
    requestId: crypto.randomUUID(),
    mode: "autosave",
  });

  let detected!: (v: any) => void;
  const detectLanguage = vi.fn(
    () =>
      new Promise((resolve) => {
        detected = resolve;
      }),
  );
  const improveSkills = vi.fn(async () => {
    throw Error("AI_DISABLED");
  });
  window.location.hash = "#/profile/enrich/__improve_skills";
  render(
    <App {...f} intelligence={{ detectLanguage, improveSkills } as any} />,
  );
  await waitFor(() => expect(detectLanguage).toHaveBeenCalledTimes(1), {
    timeout: 4000,
  });
  expect(improveSkills).not.toHaveBeenCalled();
  await act(async () =>
    detected({
      locale: "ro",
      confidence: "high",
      source: "narrative",
      policyVersion: "cv-language/1",
    }),
  );
  await waitFor(() =>
    expect(
      screen
        .getByRole("button", { name: "Îmbunătățește competențele" })
        .matches(":disabled"),
    ).toBe(false),
  );
  expect(improveSkills).not.toHaveBeenCalled();
  await startSkills();
  await waitFor(() => expect(improveSkills).toHaveBeenCalledTimes(1), {
    timeout: 4000,
  });
  await waitFor(() =>
    expect(
      screen
        .getByRole("button", { name: "Editează: Competență T1" })
        .matches(":disabled"),
    ).toBe(false),
  );
});

it.each(["success", "failure"])(
  "refresh after skills %s never starts another improvement",
  async (outcome) => {
    Object.defineProperty(crypto, "subtle", {
      configurable: true,
      value: webcrypto.subtle,
    });
    const { getSkillInventory } =
      await import("@resumora/contracts/intelligence/skills-improvement");
    const f = await fixture();
    const improveSkills = vi.fn(async (context: any) => {
      if (outcome === "failure") throw Error("AI_DISABLED");
      return {
        schemaVersion: "skills-improvement/1",
        fingerprint: context.fingerprint,
        inventory: getSkillInventory(f.profile),
        removed: [],
      };
    });
    window.location.hash = "#/profile";
    let view = render(<App {...f} intelligence={{ improveSkills } as any} />);
    await startSkills();
    await screen.findByText(
      outcome === "success"
        ? "Competențe îmbunătățite și salvate."
        : "Nu am putut finaliza îmbunătățirea. Competențele tale sunt păstrate.",
      {},
      { timeout: 4000 },
    );
    await waitFor(() =>
      expect(
        screen
          .getByRole("button", { name: "Îmbunătățește competențele" })
          .matches(":disabled"),
      ).toBe(false),
    );
    expect(improveSkills).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 2; i++) {
      expect(window.location.hash).toBe("#/profile/enrich/__improve_skills");
      view.unmount();
      view = render(<App {...f} intelligence={{ improveSkills } as any} />);
      await waitFor(() =>
        expect(
          screen
            .getByRole("button", { name: "Îmbunătățește competențele" })
            .matches(":disabled"),
        ).toBe(false),
      );
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 150));
      });
      expect(improveSkills).toHaveBeenCalledTimes(1);
    }
    await startSkills();
    await waitFor(() => expect(improveSkills).toHaveBeenCalledTimes(2));
  },
);
