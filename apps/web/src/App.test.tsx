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
  confirmSection,
  coreSections,
  fact,
  type BaseDraft,
} from "./base/model";
async function openManual() {
  window.location.hash = "#start";
  const adapter = new MemoryBaseCvAdapter(),
    user = userEvent.setup();
  render(<App adapter={adapter} />);
  await user.click(
    await screen.findByRole("button", { name: "Completează manual" }),
  );
  return { adapter, user };
}
async function confirmIdentity(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    within(screen.getByRole("region", { name: "Despre tine" })).getByRole(
      "button",
      { name: "Confirmă informațiile din secțiune" },
    ),
  );
}
async function save(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    screen.getByRole("checkbox", {
      name: "Am verificat informațiile introduse și confirm exactitatea lor.",
    }),
  );
  await user.click(screen.getByRole("button", { name: "Salvează în sesiune" }));
}
it("manual edits validate, confirm, save, reopen and restore without mutating earlier snapshots", async () => {
  const { user, adapter } = await openManual();
  const name = screen.getByRole("textbox", { name: /Nume complet/ });
  expect((name as HTMLInputElement).value).toBe("");
  expect(
    (
      screen.getByRole("textbox", {
        name: "Al doilea titlu de poziționare",
      }) as HTMLInputElement
    ).value,
  ).toBe("");
  await user.click(screen.getByRole("button", { name: "Salvează în sesiune" }));
  await waitFor(() => expect(document.activeElement).toBe(name));
  expect(screen.getByRole("alert").textContent).toContain(
    "Mai sunt informații de verificat",
  );
  await user.type(name, "Ana Fictivă");
  await confirmIdentity(user);
  await save(user);
  await screen.findByText("CV de bază v1 salvat în memoria acestei pagini.");
  const first = (await adapter.load())!;
  await user.click(screen.getByRole("button", { name: "Editează" }));
  await user.clear(screen.getByRole("textbox", { name: /Nume complet/ }));
  await user.type(
    screen.getByRole("textbox", { name: /Nume complet/ }),
    "Ana Revizuită",
  );
  // An edit resets confirmation and the save acknowledgment.
  expect(screen.getByText(/1 de confirmat/)).toBeTruthy();
  await confirmIdentity(user);
  await save(user);
  await screen.findByText("CV de bază v2 salvat în memoria acestei pagini.");
  await user.click(screen.getByRole("link", { name: "Acasă" }));
  await user.click(
    screen.getByRole("button", { name: "Redeschide versiunea salvată" }),
  );
  await screen.findByText(
    "Ultima versiune salvată în această sesiune a fost redeschisă.",
  );
  expect(
    (screen.getByRole("textbox", { name: /Nume complet/ }) as HTMLInputElement)
      .value,
  ).toBe("Ana Revizuită");
  await user.type(
    screen.getByRole("textbox", { name: /Nume complet/ }),
    " draft",
  );
  await user.click(screen.getByRole("link", { name: "Acasă" }));
  await user.click(
    screen.getByRole("button", { name: "Redeschide versiunea salvată" }),
  );
  expect(screen.getByRole("dialog")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Păstrează ciorna" }));
  await user.click(screen.getByRole("link", { name: "CV de bază" }));
  expect(
    (screen.getByRole("textbox", { name: /Nume complet/ }) as HTMLInputElement)
      .value,
  ).toBe("Ana Revizuită draft");
  await user.click(screen.getByRole("button", { name: "Istoric" }));
  await user.click(
    await screen.findByRole("button", { name: "Inspectează v1" }),
  );
  expect(screen.getByRole("heading", { name: "Inspectezi v1" })).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Restaurează v1" }));
  await user.click(
    screen.getByRole("button", { name: "Confirmă restaurarea" }),
  );
  await screen.findByText(
    "Restaurat ca v3. Versiunile anterioare sunt păstrate în această sesiune.",
  );
  expect(
    (screen.getByRole("textbox", { name: /Nume complet/ }) as HTMLInputElement)
      .value,
  ).toBe("Ana Fictivă");
  expect((await adapter.history())[2]).toEqual(first);
});
it("keeps UI and CV languages independent, preserves partial dates and changes presentation without changing facts", async () => {
  window.location.hash = "#start";
  const user = userEvent.setup(),
    adapter = new MemoryBaseCvAdapter();
  render(<App adapter={adapter} />);
  await user.click(
    await screen.findByRole("button", { name: "Explorează exemplul Mara" }),
  );
  const cv = screen.getByRole("complementary", { name: "Previzualizare CV" });
  expect(cv.querySelector("article")!.lang).toBe("en");
  expect(
    within(cv).getByRole("heading", { name: "Professional experience" }),
  ).toBeTruthy();
  expect(
    within(cv).queryByText(
      "Automated internal workflows using Power Automate and SQL",
    ),
  ).toBeNull();
  const experience = screen.getByRole("region", {
    name: "Experiență profesională",
  });
  await user.click(
    within(experience).getByRole("button", {
      name: "Confirmă informațiile din secțiune",
    }),
  );
  expect(
    within(cv).getByText(
      "Automated internal workflows using Power Automate and SQL",
    ),
  ).toBeTruthy();
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Limba interfeței" }),
    "en",
  );
  expect(
    screen.getByRole("heading", { level: 1, name: "Base CV" }),
  ).toBeTruthy();
  expect(cv.querySelector("article")!.lang).toBe("en");
  await user.selectOptions(
    screen.getByRole("combobox", { name: "CV language" }),
    "ro",
  );
  expect(cv.querySelector("article")!.lang).toBe("ro");
  expect(
    within(cv).getByRole("heading", { name: "Experiență profesională" }),
  ).toBeTruthy();
  expect(
    within(cv).getByText(
      "Automated internal workflows using Power Automate and SQL",
    ),
  ).toBeTruthy();
  const months = screen.getAllByRole("combobox", {
    name: "Role start · Month",
  });
  expect((months[2] as HTMLSelectElement).value).toBe("");
  await user.click(
    screen.getByRole("button", { name: "Move section up: Technical skills" }),
  );
  const previewSections = Array.from(cv.querySelectorAll("article h3")).map(
    (el) => el.textContent,
  );
  expect(previewSections.indexOf("Competențe tehnice")).toBeLessThan(
    previewSections.indexOf("Competențe profesionale"),
  );
  await user.click(
    screen.getByRole("button", { name: "Visibility: Technical skills" }),
  );
  expect(
    within(cv).queryByRole("heading", { name: "Competențe tehnice" }),
  ).toBeNull();
  expect(
    (
      screen.getByRole("textbox", {
        name: "Technical skills 1",
      }) as HTMLInputElement
    ).value,
  ).toBe("SQL");
  const technical = screen.getByRole("region", { name: "Technical skills" });
  const professional = screen.getByRole("region", {
    name: "Professional skills",
  });
  await user.click(
    within(technical).getByRole("button", { name: "Add a skill" }),
  );
  await user.type(
    within(technical).getByRole("textbox", { name: "Technical skills 3" }),
    "REST APIs (synthetic)",
  );
  await user.click(
    within(technical).getByRole("button", { name: "Move down: SQL" }),
  );
  expect(
    within(technical)
      .getAllByRole("textbox")
      .map((el) => (el as HTMLInputElement).value),
  ).toEqual(["Power Automate", "SQL", "REST APIs (synthetic)"]);
  expect(within(professional).getAllByRole("textbox")).toHaveLength(1);
  await user.click(screen.getByRole("button", { name: "Add a role" }));
  expect(screen.getAllByRole("textbox", { name: /Job title/ })).toHaveLength(4);
  await user.click(screen.getByRole("button", { name: "Remove: New role" }));
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Section type" }),
    "projects",
  );
  await user.click(screen.getByRole("button", { name: "Add section" }));
  const projects = screen.getByRole("region", { name: "Projects" });
  await user.click(within(projects).getByRole("button", { name: "Add entry" }));
  await user.type(
    within(projects).getByRole("textbox", { name: /Name/ }),
    "Synthetic project",
  );
  await user.click(
    within(projects).getByRole("button", { name: "Confirm section facts" }),
  );
  expect(
    within(cv).getByRole("heading", { name: "Synthetic project" }),
  ).toBeTruthy();
});
it("preserves invalid email/date input and focuses actionable errors, with safe optional contact removal", async () => {
  const { user } = await openManual();
  await user.type(
    screen.getByRole("textbox", { name: /Nume complet/ }),
    "Test",
  );
  await user.click(screen.getByRole("button", { name: "Adaugă un contact" }));
  const email = screen.getByRole("textbox", { name: "Email" });
  await user.type(email, "invalid");
  await confirmIdentity(user);
  await save(user);
  await waitFor(() => expect(document.activeElement).toBe(email));
  expect((email as HTMLInputElement).value).toBe("invalid");
  expect(
    screen.getAllByText("Introdu o adresă de email validă.").length,
  ).toBeGreaterThan(0);
  await user.click(screen.getByRole("button", { name: "Elimină: Email" }));
  await user.click(screen.getByRole("button", { name: "Adaugă un rol" }));
  await user.type(screen.getByRole("textbox", { name: /Funcție/ }), "Analist");
  await user.type(
    screen.getByRole("textbox", { name: /Angajator/ }),
    "Synthetic",
  );
  await user.type(
    screen.getByRole("textbox", { name: "Început rol · An" }),
    "2024",
  );
  await user.type(
    screen.getByRole("textbox", { name: "Sfârșit rol · An" }),
    "2023",
  );
  const role = screen.getByRole("region", { name: "Experiență profesională" });
  await user.click(
    within(role).getByRole("button", {
      name: "Confirmă informațiile din secțiune",
    }),
  );
  await save(user);
  expect(
    screen.getAllByText("Sfârșitul nu poate preceda începutul.").length,
  ).toBeGreaterThan(0);
  expect(
    (
      screen.getByRole("textbox", {
        name: "Sfârșit rol · An",
      }) as HTMLInputElement
    ).value,
  ).toBe("2023");
});
it("enrichment requires review and explicit confirmation, preserves exact answer and supports scoped undo and skip", async () => {
  const d = maraReviewDraft(),
    adapter = new MemoryBaseCvAdapter();
  await adapter.save({
    draft: coreSections.reduce((v, s) => confirmSection(v, s), d),
    expectedRevision: 0,
    acknowledged: true,
    requestId: "initial",
  });
  const initial = (await adapter.load())!;
  window.location.hash = "#enrich";
  const user = userEvent.setup();
  render(<App adapter={adapter} />);
  const answer = await screen.findByRole("textbox", { name: "Răspunsul tău" });
  await user.type(
    answer,
    "The team reviewed exceptions in one place; no time saving was measured.",
  );
  await user.click(
    screen.getByRole("button", { name: "Revizuiește răspunsul" }),
  );
  const apply = screen.getByRole("button", {
    name: "Confirmă și aplică în ciornă",
  });
  expect((apply as HTMLButtonElement).disabled).toBe(true);
  await user.click(
    screen.getByRole("checkbox", {
      name: "Aceste informații sunt adevărate și descriu munca mea.",
    }),
  );
  await user.click(apply);
  expect(screen.getByText("Răspuns confirmat în ciornă")).toBeTruthy();
  expect(await adapter.load()).toEqual(initial);
  await user.click(
    screen.getByRole("button", { name: "Anulează ultima modificare" }),
  );
  expect(screen.getByText("Pasul 2 · Confirmă")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Editează răspunsul" }));
  await user.click(screen.getByRole("button", { name: "Nu știu" }));
  expect(screen.getByText("Omis · nu adaugă informații")).toBeTruthy();
  expect(await adapter.load()).toEqual(initial);
});
it("checks file metadata without reading or sending, and unavailable routes preserve the draft", async () => {
  window.location.hash = "#start";
  const user = userEvent.setup(),
    send = vi.spyOn(window, "fetch");
  render(<App adapter={new MemoryBaseCvAdapter()} />);
  await user.click(
    await screen.findByRole("button", { name: "Alege un document" }),
  );
  const input = screen.getByLabelText("Selectează PDF sau DOCX");
  const file = new File(["Synthetic bytes, never parsed"], "synthetic.pdf", {
    type: "application/pdf",
  });
  fireEvent.change(input, { target: { files: [file] } });
  expect(
    screen.getByText(/Selectat local. Nu a fost încărcat sau extras/),
  ).toBeTruthy();
  fireEvent.change(input, {
    target: { files: [new File(["x"], "wrong.txt")] },
  });
  expect(screen.getByText(/Selectează un PDF\/DOCX nevid/)).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Continuă manual" }));
  await user.type(
    screen.getByRole("textbox", { name: /Nume complet/ }),
    "Draft preserved",
  );
  await user.click(screen.getByRole("link", { name: "Joburi" }));
  expect(
    screen.getByText(
      /Capturarea joburilor, adaptarea, scorurile și exportul nu sunt conectate/,
    ),
  ).toBeTruthy();
  await user.click(screen.getByRole("link", { name: "Cont" }));
  expect(
    screen.getByText(/Autentificarea și baza de date nu sunt conectate/),
  ).toBeTruthy();
  await user.click(screen.getByRole("link", { name: "CV de bază" }));
  expect(
    (screen.getByRole("textbox", { name: /Nume complet/ }) as HTMLInputElement)
      .value,
  ).toBe("Draft preserved");
  expect(send).not.toHaveBeenCalled();
});
it("shows adapter failure with a preserved editable draft and a working retry", async () => {
  const adapter = new MemoryBaseCvAdapter(),
    d = blankDraft();
  d.name = fact("Test");
  const ready: BaseDraft = confirmSection(d, "identity");
  await adapter.save({
    draft: ready,
    expectedRevision: 0,
    acknowledged: true,
    requestId: "init",
  });
  const saveMethod = vi
    .spyOn(adapter, "save")
    .mockRejectedValueOnce(new Error("temporary"));
  window.location.hash = "#base";
  const user = userEvent.setup();
  render(<App adapter={adapter} />);
  await screen.findByRole("textbox", { name: /Nume complet/ });
  await save(user);
  expect(screen.getByRole("alert").textContent).toContain(
    "Acțiunea nu a reușit",
  );
  expect(
    (screen.getByRole("textbox", { name: /Nume complet/ }) as HTMLInputElement)
      .value,
  ).toBe("Test");
  await user.click(screen.getByRole("button", { name: "Reîncearcă" }));
  await screen.findByText("Conținut neschimbat. Nu s-a creat o versiune nouă.");
  expect(saveMethod).toHaveBeenCalledTimes(2);
});

it("keeps user-authored summary approval separate from fact confirmation", async () => {
  const { user, adapter } = await openManual();
  await user.type(
    screen.getByRole("textbox", { name: /Nume complet/ }),
    "Persoană Sintetică",
  );
  await confirmIdentity(user);
  const summary = screen.getByRole("textbox", {
    name: "Profil în cuvintele tale",
  });
  await user.type(summary, "Am lucrat la proiectul descris în CV.");
  await save(user);
  await waitFor(() => expect(document.activeElement).toBe(summary));
  expect(await adapter.load()).toBeNull();
  await user.click(
    screen.getByRole("checkbox", {
      name: "Aprob acest text propriu pentru CV.",
    }),
  );
  // Content approval resets the final acknowledgment; approve the save separately.
  await save(user);
  await screen.findByText("CV de bază v1 salvat în memoria acestei pagini.");
  expect((await adapter.load())!.draft.summary).toMatchObject({
    origin: "user_authored",
    approval: "approved",
    claimIds: [],
  });
});

it("preserves edits made while an asynchronous adapter save is still pending", async () => {
  window.location.hash = "#start";
  const adapter = new MemoryBaseCvAdapter(),
    originalSave = adapter.save.bind(adapter);
  let release!: (value: Awaited<ReturnType<typeof adapter.save>>) => void;
  vi.spyOn(adapter, "save").mockImplementationOnce(async (input) => {
    const result = await originalSave(input);
    return new Promise((resolve) => {
      release = resolve;
    }).then(() => result);
  });
  const user = userEvent.setup();
  render(<App adapter={adapter} />);
  await user.click(
    await screen.findByRole("button", { name: "Completează manual" }),
  );
  await user.type(
    screen.getByRole("textbox", { name: /Nume complet/ }),
    "Saved content",
  );
  await confirmIdentity(user);
  await save(user);
  const name = screen.getByRole("textbox", { name: /Nume complet/ });
  await user.type(name, " plus newer draft");
  await act(async () => release((await adapter.load())!));
  await screen.findByText(
    "Versiunea v1 a fost salvată. Modificările mai noi rămân în ciornă, nesalvate.",
  );
  expect((name as HTMLInputElement).value).toBe(
    "Saved content plus newer draft",
  );
  expect((await adapter.load())!.draft.name.value).toBe("Saved content");
});
