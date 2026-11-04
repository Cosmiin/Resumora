import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { App } from "../test-editor-harness";
import { MemoryBaseCvAdapter } from "../base/adapter";
import {
  blankDraft,
  clone,
  fact,
  newOptionalEntry,
  newRole,
  type BaseDraft,
} from "../base/model";
import {
  addAnswerToCv,
  enrichmentTarget,
  removeAnswerFromCv,
  saveAnswer,
} from "../base/enrichment";
import { patchFact } from "../base/editing";
import { currentWording } from "../base/wording";
import type { IntelligenceClient } from "../base/intelligence";
import { careerContext } from "@resumora/contracts/intelligence/context";
import { decodeDraft, encodeDraft } from "@resumora/contracts/editor/transport";
import { Enrichment } from "./Enrichment";
import { DocumentPreview } from "./DocumentPreview";
import { LanguageContext } from "./ui";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function base() {
  const d = blankDraft(),
    r = newRole();
  d.language = "en";
  d.name = fact("Mara Ionescu");
  d.nameParts = { first: "Mara", last: "Ionescu" };
  r.title = fact("Coordinator");
  r.company = fact("Fictional company");
  r.context = fact("Prepared reports.");
  r.bullets = [fact("Uncited contribution.")];
  d.roles.push(r);
  return d;
}
function result(
  action: "questions" | "rewrite",
  d: BaseDraft,
  target = d.roles[0].id,
): any {
  return action === "questions"
    ? {
        schemaVersion: "career-question-plan/1",
        targetId: target,
        questions: [
          {
            id: "q",
            dimension: "tools",
            text: "Which tools did you use?",
            why: "Missing context",
            selectionMode: "single",
            options: [{ id: "x", label: "Spreadsheet" }],
          },
        ],
      }
    : {
        schemaVersion: "career-role-rewrite/1",
        targetId: target,
        text: "Prepared clear reports.",
        factIds: [careerContext(d, target).facts[0].id],
        warnings: [],
      };
}
const buttonName = (action: "questions" | "rewrite") =>
  action === "questions" ? "Improve" : "Propose experience rewrite";
afterEach(() => {
  vi.unstubAllGlobals();
  window.location.hash = "";
});

for (const action of ["questions", "rewrite"] as const) {
  it(`${action} cannot overwrite or autosave over edits made after leaving enrichment`, async () => {
    vi.stubGlobal("fetch", () => {
      throw new Error("NETWORK_DENIED");
    });
    const d = base(),
      pending = deferred<any>(),
      adapter = new MemoryBaseCvAdapter();
    await adapter.save({
      draft: d,
      expectedRevision: 0,
      requestId: "initial",
      mode: "autosave",
    });
    const client: IntelligenceClient = {
      questions: vi.fn(async () =>
        action === "questions" ? pending.promise : result("questions", d),
      ),
      rewrite: vi.fn(() => pending.promise),
      importDocument: vi.fn(),
      listImports: vi.fn(),
      importStatus: vi.fn(),
      cancelImport: vi.fn(),
    };
    window.location.hash = "#enrich";
    render(<App adapter={adapter} intelligence={client} />);
    await screen.findByRole("button", {
      name: "Îmbunătățește",
    });
    fireEvent.change(screen.getByLabelText("Limba interfeței"), {
      target: { value: "en" },
    });
    if (action === "rewrite") {
      fireEvent.click(screen.getByRole("button", { name: "Improve" }));
      fireEvent.click(await screen.findByLabelText("Spreadsheet"));
      fireEvent.click(
        screen.getByRole("button", { name: /Save and create description/ }),
      );
      await waitFor(() => expect(client.rewrite).toHaveBeenCalledTimes(1), {
        timeout: 2500,
      });
    } else
      fireEvent.click(screen.getByRole("button", { name: buttonName(action) }));
    expect(client[action]).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Editor" }));
    const firstName = await screen.findByRole("textbox", {
      name: "First name",
    });
    fireEvent.change(firstName, { target: { value: "Newer edit" } });
    await act(async () => pending.resolve(result(action, d)));
    expect(screen.getByDisplayValue("Newer edit")).toBeTruthy();
    await waitFor(
      async () => {
        const saved = (await adapter.load())!.draft;
        expect(saved.nameParts?.first).toBe("Newer edit");
        if (action === "questions") expect(saved.questionPlans).toBeUndefined();
        else expect(saved.questionPlans?.[0].targetId).toBe(d.roles[0].id);
        expect(saved.roleRewriteReviews).toBeUndefined();
      },
      { timeout: 2500 },
    );
  });

  it(`${action} ignores success after component unmount even without an App callback`, async () => {
    const d = base(),
      pending = deferred<any>(),
      change = vi.fn();
    const view = render(
      <LanguageContext value="en">
        <Enrichment
          draft={d}
          change={change}
          goEdit={() => {}}
          asOf={{ year: "2026", month: "10" }}
          prepareQuestions={
            action === "questions" ? () => pending.promise : undefined
          }
          rewriteRole={() => pending.promise}
        />
      </LanguageContext>,
    );
    fireEvent.click(screen.getByRole("button", { name: buttonName(action) }));
    view.unmount();
    await act(async () => pending.resolve(result(action, d)));
    expect(change).not.toHaveBeenCalled();
  });

  for (const outcome of ["resolve", "reject"] as const) {
    it(`${action} fences a superseded target's ${outcome} and busy state`, async () => {
      const d = base(),
        second = newRole(),
        old = deferred<any>(),
        current = deferred<any>(),
        change = vi.fn();
      second.title = fact("Another role");
      second.context = fact("Prepared schedules.");
      d.roles.push(second);
      let calls = 0;
      const request = vi.fn(() =>
        calls++ === 0 ? old.promise : current.promise,
      );
      render(
        <LanguageContext value="en">
          <Enrichment
            draft={d}
            change={change}
            goEdit={() => {}}
            asOf={{ year: "2026", month: "10" }}
            prepareQuestions={action === "questions" ? request : undefined}
            rewriteRole={request}
          />
        </LanguageContext>,
      );
      fireEvent.click(screen.getByRole("button", { name: buttonName(action) }));
      fireEvent.change(screen.getByLabelText("Role or experience"), {
        target: { value: second.id },
      });
      fireEvent.click(screen.getByRole("button", { name: buttonName(action) }));
      await act(async () => {
        if (outcome === "resolve") old.resolve(result(action, d));
        else old.reject(new Error("late failure"));
      });
      expect(change).not.toHaveBeenCalled();
      expect(
        screen.queryByText(/AI questions are unavailable|Proposal unavailable/),
      ).toBeNull();
      expect(
        screen.getByRole<HTMLButtonElement>("button", {
          name: action === "questions" ? "Preparing questions…" : "Preparing…",
        }).disabled,
      ).toBe(true);
      await act(async () => current.resolve(result(action, d, second.id)));
      expect(change).toHaveBeenCalledTimes(1);
      const next = change.mock.calls[0][0] as BaseDraft;
      expect(
        action === "questions"
          ? next.questionPlans![0].targetId
          : next.roleRewriteReviews![0].proposal.targetId,
      ).toBe(second.id);
    });
  }
}

const mutations = [
  "add bullet",
  "edit bullet",
  "remove bullet",
  "edit context",
  "add answer",
  "edit answer",
  "remove answer",
  "unconfirm answer",
  "copy answer",
  "remove copy",
  "remove copied answer",
] as const;
it.each([
  "role",
  "projects",
  "certifications",
  "volunteering",
  "custom",
] as const)(
  "%s whole-experience wording invalidates on every evidence-set change",
  async (kind) => {
    let accepted = base();
    if (kind !== "role") {
      const entry = newOptionalEntry();
      entry.title = fact("Extra experience");
      entry.details = accepted.roles[0].context;
      entry.bullets = accepted.roles[0].bullets;
      accepted.roles = [];
      accepted.optionalSections.push({
        id: "extra",
        kind,
        label: "Extra",
        entries: [entry],
      });
      accepted.presentation.order.push("extra");
    }
    const target =
      kind === "role"
        ? accepted.roles[0].id
        : accepted.optionalSections.at(-1)!.entries[0].id;
    const field = enrichmentTarget(accepted, target)!.field;
    for (const [id, text] of [
      ["answer", "Confirmed answer."],
      ["copied", "Copied answer."],
    ]) {
      accepted = saveAnswer(
        accepted,
        {
          id,
          targetId: target,
          question: "tools",
          questionText: "Tools used?",
          text,
          status: "draft",
        },
        field.id,
      );
    }
    accepted = addAnswerToCv(accepted, "copied", field.id);
    // Import, career and main presentation extensions must coexist in one persisted envelope.
    accepted.presentation.templateVersionId = "template_folio_2_1_0";
    accepted.presentation.photo = {
      assetId: "11111111-1111-4111-8111-111111111111",
      crop: { version: 1, centerX: 0.5, centerY: 0.5, zoom: 1 },
      shape: "circle",
      visible: true,
    };
    accepted.questionPlans = [result("questions", accepted, target)];
    accepted.importReview = {
      id: "synthetic-import",
      sourceHash: "a".repeat(64),
      format: "pdf",
      parserVersion: "synthetic",
      pages: 1,
      admission: { kind: "cv", reason: "CV", pages: [1] },
      extraction: {
        schemaVersion: "cv-extraction/1",
        candidates: [
          {
            id: "name",
            path: "name",
            value: "Mara Ionescu",
            page: 1,
            quote: "Mara Ionescu",
            confidence: "high",
          },
        ],
        warnings: [],
        omittedPages: [],
      },
      confirmedIds: ["name"],
    };
    const original = clone(accepted);
    const view = render(
      <LanguageContext value="en">
        <Enrichment
          draft={accepted}
          change={(next) => {
            accepted = next;
            view.rerender(surface(next));
          }}
          goEdit={() => {}}
          asOf={{ year: "2026", month: "10" }}
          rewriteRole={async () => result("rewrite", accepted, target)}
        />
      </LanguageContext>,
    );
    function surface(draft: BaseDraft) {
      return (
        <LanguageContext value="en">
          <Enrichment
            draft={draft}
            change={(next) => {
              accepted = next;
              view.rerender(surface(next));
            }}
            goEdit={() => {}}
            asOf={{ year: "2026", month: "10" }}
            rewriteRole={async () => result("rewrite", draft, target)}
          />
        </LanguageContext>
      );
    }
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", { name: "Propose experience rewrite" }),
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Accept rewrite" }));
    accepted = decodeDraft(encodeDraft(accepted));
    expect(currentWording(accepted, target)).toBe("Prepared clear reports.");
    expect(accepted.roles).toEqual(original.roles);
    expect(accepted.optionalSections).toEqual(original.optionalSections);
    expect(accepted.answers).toEqual(original.answers);
    expect(accepted.importReview).toEqual(original.importReview);
    expect(accepted.questionPlans).toEqual(original.questionPlans);
    expect(accepted.presentation.templateVersionId).toBe(
      original.presentation.templateVersionId,
    );
    expect(accepted.presentation.photo).toEqual(original.presentation.photo);
    const future = clone(accepted);
    future.presentation.templateVersionId = "template_future_9_0_0";
    expect(decodeDraft(encodeDraft(future))).toEqual(future);
    view.unmount();
    for (const mutation of mutations) {
      let next = clone(accepted);
      const dest = enrichmentTarget(next, target)!;
      if (mutation === "add bullet")
        dest.entry.bullets!.push(fact("New visible contribution."));
      if (mutation === "edit bullet")
        next = patchFact(next, dest.entry.bullets![0], "Changed contribution.");
      if (mutation === "remove bullet") dest.entry.bullets!.shift();
      if (mutation === "edit context")
        next = patchFact(next, dest.field, "Changed context.");
      if (mutation === "add answer" || mutation === "edit answer")
        next = saveAnswer(
          next,
          {
            id: mutation === "add answer" ? "new-answer" : "answer",
            targetId: target,
            question: "tools",
            questionText: "Tools used?",
            text: "New answer.",
            status: "draft",
          },
          dest.field.id,
        );
      if (mutation === "remove answer")
        next.answers = next.answers.filter((a) => a.id !== "answer");
      if (mutation === "remove copied answer")
        next.answers = next.answers.filter((a) => a.id !== "copied");
      if (mutation === "unconfirm answer")
        next.answers.find((a) => a.id === "answer")!.status = "draft";
      if (mutation === "copy answer")
        next = addAnswerToCv(next, "answer", dest.field.id);
      if (mutation === "remove copy") next = removeAnswerFromCv(next, "copied");
      for (const editable of [false, true]) {
        const rendered = render(
          <LanguageContext value="en">
            <DocumentPreview
              draft={next}
              asOf={{ year: "2026", month: "10" }}
              {...(editable ? { onTextEdit: () => {} } : {})}
            />
          </LanguageContext>,
        );
        const preview = screen.getByRole("complementary", {
          name: "CV preview",
        });
        expect(preview.textContent, `${kind}: ${mutation}`).not.toContain(
          "Prepared clear reports.",
        );
        expect(preview.textContent).toContain(
          mutation === "edit context"
            ? "Changed context."
            : "Prepared reports.",
        );
        if (mutation === "add bullet")
          expect(preview.textContent).toContain("New visible contribution.");
        if (mutation === "edit bullet")
          expect(preview.textContent).toContain("Changed contribution.");
        if (mutation === "copy answer")
          expect(preview.textContent).toContain("Confirmed answer.");
        rendered.unmount();
      }
    }
    const unrelated = clone(accepted);
    unrelated.name.value = "Unrelated name";
    unrelated.presentation.hiddenFields = [unrelated.name.fieldId];
    expect(currentWording(unrelated, target)).toBe("Prepared clear reports.");
    const preview = render(
      <LanguageContext value="en">
        <DocumentPreview
          draft={unrelated}
          asOf={{ year: "2026", month: "10" }}
        />
      </LanguageContext>,
    );
    expect(
      within(
        screen.getByRole("complementary", { name: "CV preview" }),
      ).getByText("Prepared clear reports."),
    ).toBeTruthy();
    preview.unmount();
  },
);

it.each([
  "role",
  "projects",
  "certifications",
  "volunteering",
  "custom",
] as const)(
  "%s accepted wording survives more than twenty later proposals for another experience",
  async (kind) => {
    const initial = base();
    if (kind !== "role") {
      const entry = newOptionalEntry();
      entry.title = fact("Accepted experience");
      entry.details = initial.roles[0].context;
      entry.bullets = initial.roles[0].bullets;
      initial.roles = [];
      initial.optionalSections.push({
        id: "accepted-section",
        kind,
        label: "Extra",
        entries: [entry],
      });
      initial.presentation.order.push("accepted-section");
    }
    const target =
      kind === "role"
        ? initial.roles[0].id
        : initial.optionalSections.at(-1)!.entries[0].id;
    const other = newRole();
    other.title = fact("Other experience");
    other.context = fact("Prepared schedules.");
    initial.roles.push(other);
    let latest = saveAnswer(
      initial,
      {
        id: "independent-answer",
        targetId: target,
        question: "tools",
        questionText: "Tools?",
        text: "Spreadsheet.",
        status: "draft",
      },
      enrichmentTarget(initial, target)!.field.id,
    );
    const original = clone(latest);
    function Surface() {
      const [draft, setDraft] = useState(latest);
      latest = draft;
      return (
        <LanguageContext value="en">
          <Enrichment
            draft={draft}
            change={setDraft}
            goEdit={() => {}}
            asOf={{ year: "2026", month: "10" }}
            rewriteRole={async (id) => result("rewrite", draft, id)}
          />
        </LanguageContext>
      );
    }
    const view = render(<Surface />);
    fireEvent.change(screen.getByLabelText("Role or experience"), {
      target: { value: target },
    });
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", { name: "Propose experience rewrite" }),
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Accept rewrite" }));
    const acceptedId = latest.roleRewriteReviews!.find(
      (r) => r.status === "accepted",
    )!.id;
    fireEvent.change(screen.getByLabelText("Role or experience"), {
      target: { value: other.id },
    });
    for (let i = 0; i < 25; i++) {
      await act(async () =>
        fireEvent.click(
          screen.getByRole("button", { name: "Propose experience rewrite" }),
        ),
      );
      expect(currentWording(latest, target)).toBe("Prepared clear reports.");
    }
    expect(
      latest.roleRewriteReviews!.some(
        (r) => r.id === acceptedId && r.status === "accepted",
      ),
    ).toBe(true);
    expect(latest.roleRewriteReviews!.length).toBeLessThanOrEqual(21);
    expect(
      new TextEncoder().encode(JSON.stringify(encodeDraft(latest))).byteLength,
    ).toBeLessThan(1048576);
    expect(latest.roles).toEqual(original.roles);
    expect(latest.optionalSections).toEqual(original.optionalSections);
    expect(latest.answers).toEqual(original.answers);
    expect(latest.sources).toEqual(original.sources);
    expect(latest.presentation.order).toEqual(original.presentation.order);
    expect(latest.presentation.hidden).toEqual(original.presentation.hidden);
    const persisted = decodeDraft(encodeDraft(latest));
    expect(currentWording(persisted, target)).toBe("Prepared clear reports.");
    view.unmount();
    render(
      <LanguageContext value="en">
        <DocumentPreview
          draft={persisted}
          asOf={{ year: "2026", month: "10" }}
        />
      </LanguageContext>,
    );
    const preview = screen.getByRole("complementary", { name: "CV preview" });
    expect(
      within(preview).getAllByText("Prepared clear reports."),
    ).toHaveLength(1);
    expect(preview.textContent).not.toContain("Uncited contribution.");
  },
);
