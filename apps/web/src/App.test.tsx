import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { App } from "./App";
import { MemoryBaseCvAdapter } from "./base/adapter";
import { maraReviewDraft } from "./base/fixture";
import {
  allFacts,
  blankDraft,
  fact,
  newOptionalEntry,
  newRole,
} from "./base/model";
import { prepareDraft } from "./base/editing";
async function openManual(adapter = new MemoryBaseCvAdapter()) {
  window.location.hash = "#start";
  const user = userEvent.setup();
  render(<App adapter={adapter} />);
  await user.click(
    await screen.findByRole("button", { name: "Completează manual" }),
  );
  await waitFor(() =>
    expect(document.activeElement).toBe(
      screen.getByRole("textbox", { name: /Prenume/ }),
    ),
  );
  return { user, adapter };
}
const input = (name: RegExp | string) =>
  screen.getByRole("textbox", { name }) as HTMLInputElement;
async function openSection(
  user: ReturnType<typeof userEvent.setup>,
  name: string,
) {
  await user.click(screen.getByText(name, { selector: "summary" }));
}
it("fills seven required identity fields using only typing and Tab, immediately previews and coalesces session autosave", async () => {
  const { user, adapter } = await openManual();
  const save = vi.spyOn(adapter, "save");
  const values = [
    "Ana",
    "Popescu-Ionescu",
    "Analist",
    "ana@example.test",
    "0700000000",
    "Brașov",
    "https://linkedin.com/in/synthetic-ana",
  ];
  for (let i = 0; i < values.length; i++) {
    await user.keyboard(values[i]);
    if (i < values.length - 1) await user.tab();
  }
  expect(input("LinkedIn").value).toBe(values[6]);
  const preview = screen.getByRole("complementary", {
    name: "Previzualizare CV",
  });
  expect(within(preview).getByText("Ana Popescu-Ionescu")).toBeTruthy();
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.queryByText("Confirmă informațiile din secțiune")).toBeNull();
  await waitFor(
    async () =>
      expect((await adapter.load())?.draft.name.value).toBe(
        "Ana Popescu-Ionescu",
      ),
    { timeout: 2000 },
  );
  expect(save).toHaveBeenCalledTimes(1);
  expect(
    (await adapter.load())!.draft.contacts.find((c) => c.kind === "email")!
      .value.status,
  ).toBe("user_authored");
});
it("adds an optional contact with one click and focus, toggles field visibility with one click or Alt+V", async () => {
  const { user, adapter } = await openManual();
  await user.click(screen.getByRole("button", { name: "+ Website" }));
  const site = input("Website");
  expect(document.activeElement).toBe(site);
  await user.type(site, "https://example.test");
  await user.click(screen.getByRole("button", { name: "Ascunde: Website" }));
  expect(
    within(
      screen.getByRole("complementary", { name: "Previzualizare CV" }),
    ).queryByText("https://example.test"),
  ).toBeNull();
  site.focus();
  await user.keyboard("{Alt>}v{/Alt}");
  expect(
    within(
      screen.getByRole("complementary", { name: "Previzualizare CV" }),
    ).getByText("https://example.test"),
  ).toBeTruthy();
  await waitFor(
    async () =>
      expect(
        (await adapter.load())?.draft.contacts.some(
          (c) => c.platform === "website",
        ),
      ).toBe(true),
    { timeout: 2000 },
  );
});
it("adds skills with Enter, comma and paste; edits/cancels/removes and keyboard-reorders chips", async () => {
  const { user, adapter } = await openManual();
  await openSection(user, "Competențe tehnice");
  const chips = input("Competențe tehnice");
  expect(document.activeElement).toBe(chips);
  await user.keyboard("React{Enter}Node,SQL{Enter}");
  await user.paste("CSS, TypeScript, Git");
  expect(screen.getByRole("button", { name: "React" })).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "React" }));
  const edit = input("Editează competența");
  await user.clear(edit);
  await user.type(edit, "Discard{Escape}");
  expect(screen.queryByRole("button", { name: "Discard" })).toBeNull();
  await user.click(screen.getByRole("button", { name: "React" }));
  await user.clear(input("Editează competența"));
  await user.type(input("Editează competența"), "React 19{Enter}");
  screen.getByRole("button", { name: "Node" }).focus();
  await user.keyboard("{Alt>}{ArrowUp}{/Alt}");
  chips.focus();
  await user.keyboard("{Backspace}");
  await waitFor(
    async () =>
      expect(
        (await adapter.load())?.draft.technicalSkills.map((s) => s.value),
      ).toEqual(["Node", "React 19", "SQL", "CSS", "TypeScript"]),
    { timeout: 2000 },
  );
});
it("adds entries with autofocus, accepts partial typed dates and current toggles, and focuses a preview field in one click", async () => {
  const { user, adapter } = await openManual();
  await openSection(user, "Experiență profesională");
  await user.click(screen.getByRole("button", { name: "Adaugă experiență" }));
  const role = input(/^Rol/);
  await waitFor(() => expect(document.activeElement).toBe(role));
  await user.keyboard("Analist{Enter}Example Co{Enter}2020{Enter}02/2024");
  const ongoing = screen.getByRole("checkbox", { name: "Prezent / În curs" });
  await user.click(ongoing);
  expect(
    screen.queryByRole("textbox", { name: "Când s-a terminat?" }),
  ).toBeNull();
  const preview = screen.getByRole("complementary", {
    name: "Previzualizare CV",
  });
  await user.click(within(preview).getByRole("button", { name: "Example Co" }));
  await waitFor(() => expect(document.activeElement).toBe(input(/^Companie/)));
  await waitFor(
    async () =>
      expect((await adapter.load())?.draft.roles[0].start.value).toEqual({
        year: "2020",
        month: "",
      }),
    { timeout: 2000 },
  );
  expect((await adapter.load())?.draft.roles[0].end.value).toEqual({
    year: "2024",
    month: "2",
  });
  await openSection(user, "Studii");
  await user.click(screen.getByRole("button", { name: "Adaugă studii" }));
  await waitFor(() =>
    expect(document.activeElement).toBe(input(/^Instituție/)),
  );
  await user.keyboard(
    "Synthetic University{Enter}Diplomă{Enter}092015{Enter}2019",
  );
  await waitFor(
    async () =>
      expect((await adapter.load())?.draft.education[0].start.value).toEqual({
        year: "2015",
        month: "9",
      }),
    { timeout: 2000 },
  );
});
it("keyboard-reorders sections without changing facts and keeps source information hidden until requested", async () => {
  const { user, adapter } = await openManual();
  await user.type(input(/Prenume/), "Ana");
  await user.click(
    screen.getByText("Structura CV-ului", { selector: "summary" }),
  );
  const handle = screen.getByRole("button", {
    name: "Reordonează: Competențe tehnice",
  });
  handle.focus();
  await user.keyboard("{Alt>}{ArrowUp}{ArrowUp}{ArrowUp}{/Alt}");
  await waitFor(
    async () =>
      expect((await adapter.load())?.draft.presentation.order[0]).toBe(
        "technicalSkills",
      ),
    { timeout: 2000 },
  );
  expect((await adapter.load())!.draft.name.value).toBe("Ana");
  expect(document.querySelector(".section-info[open]")).toBeNull();
});
it("focuses missing fields on Ctrl+S without a truth checkbox, permits Back/Cancel, and keeps incomplete autosaves", async () => {
  const { user, adapter } = await openManual();
  await user.keyboard("Ana{Control>}s{/Control}");
  await waitFor(() =>
    expect(document.activeElement).toBe(input(/Nume de familie/)),
  );
  expect(screen.queryByRole("checkbox", { name: /exactitatea/ })).toBeNull();
  await waitFor(
    async () => expect((await adapter.load())?.draft.name.value).toBe("Ana"),
    { timeout: 2000 },
  );
  await user.click(screen.getByRole("link", { name: "Acasă" }));
  expect(
    await screen.findByRole("button", { name: "Redeschide versiunea salvată" }),
  ).toBeTruthy();
});
it("saves/reopens incomplete manual drafts and restores immutable history as a new version", async () => {
  const { user, adapter } = await openManual();
  await user.keyboard("Ana");
  await waitFor(async () => expect((await adapter.history()).length).toBe(1), {
    timeout: 2000,
  });
  const first = (await adapter.load())!;
  await user.clear(input(/Prenume/));
  await user.type(input(/Prenume/), "Mira");
  await waitFor(async () => expect((await adapter.history()).length).toBe(2), {
    timeout: 2000,
  });
  await user.click(screen.getByRole("link", { name: "Acasă" }));
  await user.click(
    screen.getByRole("button", { name: "Redeschide versiunea salvată" }),
  );
  expect(input(/Prenume/).value).toBe("Mira");
  await user.click(screen.getByRole("button", { name: "Istoric" }));
  await user.click(
    await screen.findByRole("button", { name: "Inspectează v1" }),
  );
  await user.click(screen.getByRole("button", { name: "Restaurează v1" }));
  await user.click(screen.getByRole("button", { name: "Păstrează ciorna" }));
  expect((await adapter.load())!.revision).toBe(2);
  await user.click(screen.getByRole("button", { name: "Restaurează v1" }));
  await user.click(
    screen.getByRole("button", { name: "Restaurează versiunea" }),
  );
  await waitFor(() => expect(input(/Prenume/).value).toBe("Ana"));
  expect((await adapter.history()).map((s) => s.revision)).toEqual([3, 2, 1]);
  expect((await adapter.history())[2]).toEqual(first);
});
it("preserves newer edits while an asynchronous save is in flight and retries errors", async () => {
  const adapter = new MemoryBaseCvAdapter(),
    real = adapter.save.bind(adapter);
  let release: () => void = () => {};
  vi.spyOn(adapter, "save").mockImplementationOnce(async (input) => {
    await new Promise<void>((r) => {
      release = r;
    });
    return real(input);
  });
  const { user } = await openManual(adapter);
  await user.keyboard("Ana");
  await waitFor(() => expect(screen.getByText("Se salvează…")).toBeTruthy(), {
    timeout: 2000,
  });
  await user.type(input(/Prenume/), " nou");
  await act(async () => release());
  expect(input(/Prenume/).value).toBe("Ana nou");
  await waitFor(
    async () =>
      expect((await adapter.load())?.draft.name.value).toBe("Ana nou"),
    { timeout: 2000 },
  );
});
it("keeps UI/CV language independent, preserves imported status and keeps generated reference prose out of live preview", async () => {
  window.location.hash = "#start";
  const adapter = new MemoryBaseCvAdapter(),
    user = userEvent.setup();
  render(<App adapter={adapter} />);
  await user.click(
    await screen.findByRole("button", { name: "Explorează exemplul Mara" }),
  );
  const preview = screen.getByRole("complementary", {
    name: "Previzualizare CV",
  });
  expect(preview.querySelector("article")!.lang).toBe("en");
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Limba interfeței" }),
    "en",
  );
  expect(preview.querySelector("article")!.lang).toBe("en");
  await user.selectOptions(
    screen.getByRole("combobox", { name: "CV language" }),
    "ro",
  );
  expect(preview.querySelector("article")!.lang).toBe("ro");
  await waitFor(
    async () => expect((await adapter.load())?.draft.language).toBe("ro"),
    { timeout: 2000 },
  );
  const saved = (await adapter.load())!;
  expect(
    allFacts(saved.draft).find((f) => f.sourceClaimId === "claim_resp_a")
      ?.status,
  ).toBe("extracted_unconfirmed");
  expect(preview.textContent).not.toContain(saved.draft.referenceProse[0].text);
});
it("enrichment autofocuses one question, saves and advances with one shortcut, supports unknown/skip and editable preview", async () => {
  const d = prepareDraft(blankDraft()),
    role = newRole();
  role.title = fact("Analist");
  role.company = fact("Synthetic Co");
  d.roles.push(role);
  const adapter = new MemoryBaseCvAdapter();
  await adapter.save({
    draft: d,
    expectedRevision: 0,
    mode: "autosave",
    requestId: "initial",
  });
  window.location.hash = "#enrich";
  const user = userEvent.setup();
  render(<App adapter={adapter} />);
  const answer = await screen.findByRole("textbox", {
    name: "Care erau responsabilitățile tale de zi cu zi?",
  });
  await waitFor(() => expect(document.activeElement).toBe(answer));
  await user.type(answer, "Am verificat fluxurile, fără procente inventate.");
  expect(
    within(
      screen.getByRole("complementary", { name: "Previzualizare CV" }),
    ).queryByText("Am verificat fluxurile, fără procente inventate."),
  ).toBeNull();
  await user.keyboard("{Control>}{Enter}{/Control}");
  expect(
    await screen.findByRole("textbox", {
      name: "Ce ai făcut tu, cu ce autonomie?",
    }),
  ).toBe(document.activeElement);
  await user.keyboard("{Control>}{Shift>}k{/Shift}{/Control}");
  expect(
    screen.getByRole("textbox", {
      name: "Ce instrumente ai folosit și pentru ce?",
    }),
  ).toBeTruthy();
  expect(
    within(
      screen.getByRole("complementary", { name: "Previzualizare CV" }),
    ).queryByText("Am verificat fluxurile, fără procente inventate."),
  ).toBeNull();
  await user.click(screen.getByRole("button", { name: "Adaugă în CV" }));
  await waitFor(
    async () =>
      expect((await adapter.load())?.draft.roles[0].bullets[0].value).toBe(
        "Am verificat fluxurile, fără procente inventate.",
      ),
    { timeout: 2000 },
  );
  expect(
    (await adapter.load())!.draft.answers.some((a) => a.status === "unknown"),
  ).toBe(true);
  expect(screen.queryByText("Revizuiește răspunsul")).toBeNull();
});
it("file picker/drop validate metadata only, reject multiple files, and unavailable routes preserve the draft", async () => {
  window.location.hash = "#start";
  const user = userEvent.setup(),
    adapter = new MemoryBaseCvAdapter();
  render(<App adapter={adapter} />);
  await user.click(
    await screen.findByRole("button", { name: "Alege un document" }),
  );
  const file = new File(["synthetic"], "cv.pdf", { type: "application/pdf" });
  const bytes = vi.spyOn(file, "arrayBuffer");
  fireEvent.drop(document.querySelector(".dropzone")!, {
    dataTransfer: { files: [file] },
  });
  expect(screen.getByText(/Selectat local/)).toBeTruthy();
  expect(bytes).not.toHaveBeenCalled();
  fireEvent.drop(document.querySelector(".dropzone")!, {
    dataTransfer: { files: [file, file] },
  });
  expect(screen.getByText(/Alege un singur fișier/)).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Continuă manual" }));
  await user.type(input(/Prenume/), "Ana");
  await user.click(screen.getByRole("link", { name: "Cont" }));
  expect(
    screen.getByText(/Contul și salvarea online nu sunt conectate/),
  ).toBeTruthy();
  await user.click(screen.getByRole("link", { name: "CV de bază" }));
  expect(input(/Prenume/).value).toBe("Ana");
});
it("edits all contributions in one rich field, safely preserves lists, and records separate self-assessed Native/CEFR languages", async () => {
  const { user, adapter } = await openManual();
  await openSection(user, "Experiență profesională");
  await user.click(screen.getByRole("button", { name: "Adaugă experiență" }));
  const rich = screen.getByRole("textbox", { name: "Contribuții" });
  rich.innerHTML =
    '<ul><li><strong>Reviewed</strong> workflows</li><li><em>Measured</em> nothing</li></ul><img src="https://bad.test/a" onerror="x()">';
  fireEvent.input(rich);
  const preview = screen.getByRole("complementary", {
    name: "Previzualizare CV",
  });
  expect(preview.querySelector("strong")?.textContent).toBe("Reviewed");
  expect(preview.querySelector("img")).toBeNull();
  await openSection(user, "Limbi");
  await user.click(screen.getByRole("button", { name: "Adaugă limbă" }));
  await waitFor(() => expect(document.activeElement).toBe(input("Limbă")));
  await user.keyboard("Română");
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Nivel autoevaluat" }),
    "Native",
  );
  await waitFor(
    async () =>
      expect(
        (await adapter.load())?.draft.optionalSections[0].entries[0].proficiency
          ?.value,
      ).toBe("Native"),
    { timeout: 2000 },
  );
  const snapshot = (await adapter.load())!;
  expect(snapshot.draft.roles[0].bullets.map((f) => f.value)).toEqual([
    "Reviewed workflows",
    "Measured nothing",
  ]);
  expect(
    snapshot.draft.presentation.contributionHtml?.[snapshot.draft.roles[0].id],
  ).toContain("<strong>");
});
it("applies section and skill drag payloads to actual ordering while ignoring another group", async () => {
  const { user, adapter } = await openManual();
  await openSection(user, "Competențe tehnice");
  const chips = input("Competențe tehnice");
  await user.type(chips, "React{Enter}SQL{Enter}");
  const rows = Array.from(document.querySelectorAll(".chip-input>.sortable"));
  fireEvent.drop(rows[0], {
    dataTransfer: {
      getData: () => JSON.stringify({ group: "Competențe tehnice", index: 1 }),
    },
  });
  await waitFor(
    async () =>
      expect(
        (await adapter.load())?.draft.technicalSkills.map((f) => f.value),
      ).toEqual(["SQL", "React"]),
    { timeout: 2000 },
  );
  fireEvent.drop(rows[0], {
    dataTransfer: {
      getData: () => JSON.stringify({ group: "foreign", index: 1 }),
    },
  });
  expect(
    (await adapter.load())?.draft.technicalSkills.map((f) => f.value),
  ).toEqual(["SQL", "React"]);
});
it("keeps the optional second title focused while typing, without remounting its field", async () => {
  const { user, adapter } = await openManual();
  await user.click(screen.getByRole("button", { name: "+ Al doilea titlu" }));
  const title = input("Al doilea titlu");
  await waitFor(() => expect(document.activeElement).toBe(title));
  await user.keyboard("Analist operațional");
  expect(document.activeElement).toBe(title);
  expect(title.value).toBe("Analist operațional");
  await waitFor(
    async () =>
      expect((await adapter.load())?.draft.titles[1].value).toBe(
        "Analist operațional",
      ),
    { timeout: 2000 },
  );
});

it("autofocuses enrichment after navigation and preserves the requested field when returning from its preview", async () => {
  const d = prepareDraft(blankDraft()),
    r = newRole();
  r.title = fact("Analist");
  r.company = fact("Synthetic Co");
  d.roles.push(r);
  const adapter = new MemoryBaseCvAdapter();
  await adapter.save({
    draft: d,
    mode: "autosave",
    expectedRevision: 0,
    requestId: "initial",
  });
  window.location.hash = "#base";
  const user = userEvent.setup();
  render(<App adapter={adapter} />);
  await screen.findByRole("textbox", { name: /Prenume/ });
  await user.click(screen.getByRole("link", { name: "Îmbunătățește" }));
  const answer = await screen.findByRole("textbox", {
    name: "Care erau responsabilitățile tale de zi cu zi?",
  });
  await waitFor(() => expect(document.activeElement).toBe(answer));
  await user.keyboard("Exact text{Control>}{Enter}{/Control}");
  await waitFor(() =>
    expect(document.activeElement).toBe(
      screen.getByRole("textbox", { name: "Ce ai făcut tu, cu ce autonomie?" }),
    ),
  );
  await user.click(
    within(
      screen.getByRole("complementary", { name: "Previzualizare CV" }),
    ).getByRole("button", { name: "Synthetic Co" }),
  );
  await waitFor(() => expect(document.activeElement).toBe(input(/^Companie/)));
});
