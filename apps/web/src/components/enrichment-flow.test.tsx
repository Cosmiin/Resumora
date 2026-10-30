import { StrictMode, useState } from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { App } from "../App";
import { MemoryBaseCvAdapter } from "../base/adapter";
import {
  blankDraft,
  clone,
  fact,
  newRole,
  type BaseDraft,
} from "../base/model";
import { saveAnswer } from "../base/enrichment";
import { careerContext } from "@resumora/contracts/intelligence/context";
import { Enrichment } from "./Enrichment";
import { RoleRewrite } from "./RoleRewrite";
import { LanguageContext } from "./ui";
import type { IntelligenceClient } from "../base/intelligence";

function fixture() {
  const d = blankDraft(),
    r = newRole();
  d.language = "en";
  r.title = fact("Operations coordinator");
  r.context = fact("Prepared weekly reports.");
  d.roles.push(r);
  return d;
}
function plan(d: BaseDraft) {
  return {
    schemaVersion: "career-question-plan/1" as const,
    targetId: d.roles[0].id,
    questions: [
      {
        id: "question",
        dimension: "ownership" as const,
        text: "How did you prepare reports?",
        why: "Your personal contribution is missing.",
        selectionMode: "multiple" as const,
        options: [
          { id: "merge", label: "Consolidated team reports" },
          { id: "check", label: "Checked source records" },
        ],
      },
    ],
  };
}
function client(
  d: BaseDraft,
  rewrite = vi.fn(async () => ({
    schemaVersion: "career-role-rewrite/1" as const,
    targetId: d.roles[0].id,
    text: "Prepared weekly reports and consolidated team reports.",
    factIds: [d.roles[0].context.id],
    warnings: [],
  })),
): IntelligenceClient {
  return {
    questions: vi.fn(async () => plan(d)),
    rewrite,
    importDocument: vi.fn(),
    listImports: vi.fn(),
    importStatus: vi.fn(),
    cancelImport: vi.fn(),
  };
}
afterEach(() => {
  window.location.hash = "";
  vi.unstubAllGlobals();
});
async function open(
  adapter: MemoryBaseCvAdapter,
  ai: IntelligenceClient,
  d: BaseDraft,
) {
  await adapter.save({
    draft: d,
    expectedRevision: 0,
    requestId: "initial",
    mode: "autosave",
  });
  window.location.hash = "#enrich";
  render(
    <StrictMode>
      <App adapter={adapter} intelligence={ai} />
    </StrictMode>,
  );
  await screen.findByRole("button", { name: "Îmbunătățește" });
  fireEvent.change(screen.getByLabelText("Limba interfeței"), {
    target: { value: "en" },
  });
}

it("one Improve cycle persists context before one whole-role proposal, with no calls while choosing or typing and no silent acceptance", async () => {
  vi.stubGlobal("fetch", () => {
    throw new Error("NETWORK_DENIED");
  });
  const d = fixture(),
    adapter = new MemoryBaseCvAdapter();
  const rewrite = vi.fn(async () => {
    const saved = (await adapter.load())!.draft;
    expect(saved.answers[0].status).toBe("confirmed");
    expect(saved.answers[0].selectedOptionIds).toEqual(["merge"]);
    expect(saved.roles).toEqual(d.roles);
    return {
      schemaVersion: "career-role-rewrite/1" as const,
      targetId: d.roles[0].id,
      text: "Prepared weekly reports and consolidated team reports.",
      factIds: careerContext(saved, d.roles[0].id).facts.map((f) => f.id),
      warnings: [],
    };
  });
  const ai = client(d, rewrite);
  await open(adapter, ai, d);
  expect(
    screen.queryByRole("textbox", { name: "How did you prepare reports?" }),
  ).toBeNull();
  expect(
    screen.queryByRole("button", { name: "Propose experience rewrite" }),
  ).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Improve" }));
  fireEvent.click(await screen.findByLabelText("Consolidated team reports"));
  fireEvent.change(screen.getByLabelText("How did you prepare reports?"), {
    target: { value: "I checked the inputs." },
  });
  expect(ai.questions).toHaveBeenCalledTimes(1);
  expect(rewrite).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole("button", { name: /Save and create description/ }),
  );
  await screen.findByLabelText(
    "Proposal — review before acceptance",
    {},
    { timeout: 3000 },
  );
  expect(rewrite).toHaveBeenCalledTimes(1);
  expect(
    screen.getByRole<HTMLButtonElement>("button", { name: "Accept rewrite" })
      .disabled,
  ).toBe(false);
  await waitFor(
    async () => {
      const saved = (await adapter.load())!.draft;
      expect(saved.roleRewriteReviews?.[0].status).toBe("pending");
      expect(saved.presentation.approvedWording).toBeUndefined();
      expect(saved.roles).toEqual(d.roles);
    },
    { timeout: 3000 },
  );
});

it("uncertain save holds automatic generation until the existing save retry reconciles", async () => {
  const d = fixture(),
    adapter = new MemoryBaseCvAdapter(),
    ai = client(d);
  await open(adapter, ai, d);
  fireEvent.click(screen.getByRole("button", { name: "Improve" }));
  fireEvent.click(await screen.findByLabelText("Consolidated team reports"));
  const save = adapter.save.bind(adapter);
  let uncertain = true;
  vi.spyOn(adapter, "save").mockImplementation(async (input) => {
    const result = await save(input);
    if (
      uncertain &&
      input.draft.answers.some((a) => a.status === "confirmed")
    ) {
      uncertain = false;
      throw new Error("Lost response after commit");
    }
    return result;
  });
  fireEvent.click(
    screen.getByRole("button", { name: /Save and create description/ }),
  );
  await screen.findByRole("button", { name: "Retry" }, { timeout: 3000 });
  expect(ai.rewrite).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  await waitFor(() => expect(ai.rewrite).toHaveBeenCalledTimes(1), {
    timeout: 3000,
  });
});

it("changing evidence while waiting cancels automatic generation; retries remain deliberate", async () => {
  const d = fixture(),
    ai = client(d);
  let latest = d,
    ready = false;
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
          prepareQuestions={async () => plan(d)}
          rewriteRole={() =>
            ai.rewrite({
              snapshotId: "synthetic",
              revision: 1,
              targetId: d.roles[0].id,
              operationId: "synthetic",
            })
          }
          durable
          ready={ready}
        />
      </LanguageContext>
    );
  }
  ready = true;
  const view = render(<Surface />);
  fireEvent.click(screen.getByRole("button", { name: "Improve" }));
  fireEvent.click(await screen.findByLabelText("Consolidated team reports"));
  ready = false;
  view.rerender(<Surface />);
  fireEvent.click(
    screen.getByRole("button", { name: /Save and create description/ }),
  );
  expect(ai.rewrite).not.toHaveBeenCalled();
  latest.roles[0].context = fact("Different evidence.");
  ready = true;
  await act(async () => view.rerender(<Surface />));
  expect(ai.rewrite).not.toHaveBeenCalled();
  expect(screen.getByText(/Context changed. Review your answers/)).toBeTruthy();
});

it("failed questions and automatic rewrite retry only on a deliberate click and retain saved answers", async () => {
  const d = fixture();
  const questions = vi
    .fn()
    .mockRejectedValueOnce(new Error("Unavailable"))
    .mockResolvedValue(plan(d));
  const rewrite = vi
    .fn()
    .mockRejectedValueOnce(new Error("Unavailable"))
    .mockResolvedValue({
      schemaVersion: "career-role-rewrite/1",
      targetId: d.roles[0].id,
      text: "Prepared weekly reports.",
      factIds: [d.roles[0].context.id],
      warnings: [],
    });
  let latest = d;
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
          prepareQuestions={questions}
          rewriteRole={rewrite}
        />
      </LanguageContext>
    );
  }
  render(<Surface />);
  fireEvent.click(screen.getByRole("button", { name: "Improve" }));
  await screen.findByText(/We cannot confirm the question request/);
  expect(questions).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Improve" }));
  fireEvent.click(await screen.findByLabelText("Consolidated team reports"));
  fireEvent.click(
    screen.getByRole("button", { name: /Save and create description/ }),
  );
  await screen.findByText(/Proposal unavailable/);
  expect(rewrite).toHaveBeenCalledTimes(1);
  expect(latest.answers[0].status).toBe("confirmed");
  expect(latest.roles).toEqual(d.roles);
  fireEvent.click(
    screen.getByRole("button", { name: "Propose experience rewrite" }),
  );
  await screen.findByLabelText("Proposal — review before acceptance");
  expect(rewrite).toHaveBeenCalledTimes(2);
  expect(questions).toHaveBeenCalledTimes(2);
  expect(latest.answers[0].status).toBe("confirmed");
});

it.each(["manual", "pruned", "completed"] as const)(
  "edits a saved %s answer through its editor, preview and keyboard without replacing its provenance or role facts",
  async (kind) => {
    const original = fixture(),
      batch = plan(original),
      question = batch.questions[0],
      role = original.roles[0];
    const initial = saveAnswer(
      original,
      {
        id: "saved-answer",
        targetId: role.id,
        question: "ownership",
        questionText: question.text,
        text: "Original personal contribution.",
        status: "draft",
        ...(kind === "manual"
          ? {}
          : {
              plannedQuestionId: question.id,
              options: question.options,
              selectedOptionIds: ["merge"],
              selectionMode: question.selectionMode,
            }),
      },
      role.context.id,
    );
    if (kind === "completed") initial.questionPlans = [batch];
    const oldSource = initial.sources.at(-1)!;
    const ai = client(initial);
    let latest = initial;
    function Surface() {
      const [draft, setDraft] = useState(initial);
      latest = draft;
      return (
        <LanguageContext value="en">
          <Enrichment
            draft={draft}
            change={setDraft}
            goEdit={() => {}}
            asOf={{ year: "2026", month: "10" }}
            prepareQuestions={async () => batch}
            rewriteRole={() =>
              ai.rewrite({
                snapshotId: "synthetic",
                revision: 1,
                targetId: role.id,
                operationId: "synthetic",
              })
            }
          />
        </LanguageContext>
      );
    }
    render(<Surface />);
    expect(
      screen.getByRole("button", { name: "Propose experience rewrite" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Edit answer" }));
    const editor = screen.getByRole<HTMLTextAreaElement>("textbox", {
      name: question.text,
    });
    expect(editor.value).toBe("Original personal contribution.");
    const preview = screen.getByRole("textbox", { name: "Answer preview" });
    expect(preview.textContent).toBe(editor.value);
    if (kind !== "manual") {
      expect(
        screen.getByRole<HTMLInputElement>("checkbox", {
          name: "Consolidated team reports",
        }).checked,
      ).toBe(true);
    }
    fireEvent.change(editor, {
      target: { value: "Updated personal contribution." },
    });
    expect(preview.textContent).toBe("Updated personal contribution.");
    fireEvent.input(preview, {
      target: { innerHTML: "Final personal contribution." },
    });
    expect(editor.value).toBe("Final personal contribution.");
    fireEvent.keyDown(editor, { key: "Enter", ctrlKey: true });
    expect(latest.answers).toHaveLength(1);
    expect(latest.answers[0]).toMatchObject({
      id: "saved-answer",
      status: "confirmed",
      text: "Final personal contribution.",
    });
    expect(latest.answers[0].sourceId).not.toBe(oldSource.id);
    expect(latest.sources).toContainEqual(oldSource);
    expect(latest.sources.at(-1)?.text).toContain(
      "Final personal contribution.",
    );
    expect(latest.roles).toEqual(initial.roles);
    await act(async () => {});
    expect(ai.rewrite).not.toHaveBeenCalled();
  },
);

it("allows a saved manual fallback answer to be rewritten after durable save", async () => {
  const d = fixture(),
    adapter = new MemoryBaseCvAdapter(),
    ai = client(d);
  vi.mocked(ai.questions).mockRejectedValue(new Error("Unavailable"));
  vi.mocked(ai.rewrite).mockImplementation(async () => {
    const persisted = (await adapter.load())!.draft;
    expect(persisted.answers[0].status).toBe("confirmed");
    expect(
      persisted.sources.find((s) => s.id === persisted.answers[0].sourceId)
        ?.text,
    ).toBe("I checked source records each week.");
    expect(persisted.roles).toEqual(d.roles);
    return {
      schemaVersion: "career-role-rewrite/1",
      targetId: d.roles[0].id,
      text: "Prepared weekly reports and checked source records.",
      factIds: careerContext(persisted, d.roles[0].id).facts.map((f) => f.id),
      warnings: [],
    };
  });
  await open(adapter, ai, d);
  fireEvent.click(screen.getByRole("button", { name: "Improve" }));
  fireEvent.click(
    await screen.findByRole("button", {
      name: "Continue with manual questions",
    }),
  );
  fireEvent.change(
    screen.getByRole("textbox", {
      name: "What were your day-to-day responsibilities?",
    }),
    {
      target: { value: "I checked source records each week." },
    },
  );
  fireEvent.click(screen.getByRole("button", { name: /Save and next/ }));
  const rewrite = screen.getByRole<HTMLButtonElement>("button", {
    name: "Propose experience rewrite",
  });
  expect(rewrite.disabled).toBe(true);
  expect(ai.rewrite).not.toHaveBeenCalled();
  await waitFor(() => expect(rewrite.disabled).toBe(false), { timeout: 3000 });
  expect(ai.rewrite).not.toHaveBeenCalled();
  fireEvent.click(rewrite);
  await screen.findByLabelText("Proposal — review before acceptance");
  expect(ai.questions).toHaveBeenCalledTimes(1);
  expect(ai.rewrite).toHaveBeenCalledTimes(1);
});

it.each(["Skip", "I don't know"])(
  "Undo of final %s before autosave cancels automatic rewriting and restores the question",
  async (action) => {
    const d = fixture(),
      adapter = new MemoryBaseCvAdapter(),
      ai = client(d);
    await open(adapter, ai, d);
    fireEvent.click(screen.getByRole("button", { name: "Improve" }));
    await screen.findByLabelText("Consolidated team reports");
    fireEvent.click(screen.getByRole("button", { name: new RegExp(action) }));
    expect(ai.rewrite).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Undo last change" }));
    await screen.findByText(/Draft saved in session/, {}, { timeout: 3000 });
    await act(async () => {});
    const persisted = (await adapter.load())!.draft;
    expect(persisted.answers).toEqual([]);
    expect(persisted.questionPlans).toHaveLength(1);
    expect(
      screen.getByRole("textbox", { name: "How did you prepare reports?" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Propose experience rewrite" }),
    ).toBeNull();
    expect(ai.rewrite).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: new RegExp(action) }));
    await screen.findByLabelText(
      "Proposal — review before acceptance",
      {},
      { timeout: 3000 },
    );
    expect(ai.rewrite).toHaveBeenCalledTimes(1);
    expect((await adapter.load())!.draft.roles).toEqual(d.roles);
  },
);

it.each(["skipped", "unknown"] as const)(
  "rechecks a queued %s batch at dispatch even when its evidence is unchanged",
  async (status) => {
    const d = fixture(),
      batch = plan(d),
      ai = client(d);
    d.questionPlans = [batch];
    d.answers = [
      {
        id: "last-answer",
        targetId: batch.targetId,
        plannedQuestionId: batch.questions[0].id,
        question: "ownership",
        questionText: batch.questions[0].text,
        text: "",
        status,
      },
    ];
    const autoRequest = {
      id: "queued",
      input: careerContext(d, batch.targetId),
      plan: batch,
    };
    function Surface({ draft, ready }: { draft: BaseDraft; ready: boolean }) {
      return (
        <LanguageContext value="en">
          <RoleRewrite
            draft={draft}
            targetId={batch.targetId}
            ready={ready}
            autoRequest={autoRequest}
            change={vi.fn()}
            request={() =>
              ai.rewrite({
                snapshotId: "synthetic",
                revision: 1,
                targetId: batch.targetId,
                operationId: "synthetic",
              })
            }
          />
        </LanguageContext>
      );
    }
    const view = render(<Surface draft={d} ready={false} />);
    const undone = clone(d);
    undone.answers = [];
    expect(careerContext(undone, batch.targetId)).toEqual(autoRequest.input);
    await act(async () => view.rerender(<Surface draft={undone} ready />));
    expect(ai.rewrite).not.toHaveBeenCalled();
    expect(
      screen.getByText(/Context changed. Review your answers/),
    ).toBeTruthy();
  },
);

it.each([
  ["en", "AI_OUTPUT_TRUNCATED", "AI stopped before finishing"],
  ["ro", "AI_OUTPUT_TRUNCATED", "Răspunsul AI s-a oprit"],
  ["en", "AI_OUTPUT_INVALID", "AI returned questions we cannot safely use"],
  ["ro", "AI_OUTPUT_INVALID", "AI a returnat întrebări"],
  ["en", "VERSION_CONFLICT", "The saved context changed"],
  ["ro", "VERSION_CONFLICT", "Contextul salvat s-a schimbat"],
  ["en", "AI_DISABLED", "AI processing is off"],
  ["ro", "AI_DISABLED", "Procesarea AI este dezactivată"],
] as const)(
  "%s questions %s preserves answers without automatic retry",
  async (locale, code, message) => {
    const d = fixture();
    d.answers = [
      {
        id: "kept",
        targetId: d.roles[0].id,
        question: "ownership",
        questionText: "Previous detail?",
        text: "Existing saved answer",
        status: "confirmed",
      },
    ];
    const before = clone(d),
      prepareQuestions = vi.fn().mockRejectedValue(new Error(code)),
      change = vi.fn();
    render(
      <LanguageContext value={locale}>
        <Enrichment
          draft={d}
          change={change}
          goEdit={() => {}}
          asOf={{ year: "2026", month: "10" }}
          prepareQuestions={prepareQuestions}
        />
      </LanguageContext>,
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: locale === "en" ? "Improve" : "Îmbunătățește",
      }),
    );
    await screen.findByText(new RegExp(message));
    expect(prepareQuestions).toHaveBeenCalledTimes(1);
    expect(change).not.toHaveBeenCalled();
    expect(d).toEqual(before);
  },
);

it.each([false, true])(
  "pending question result checks content rather than reference; changed=%s",
  async (changed) => {
    const d = fixture();
    let resolve!: (value: ReturnType<typeof plan>) => void;
    const prepareQuestions = vi.fn(
        () =>
          new Promise<ReturnType<typeof plan>>((done) => {
            resolve = done;
          }),
      ),
      change = vi.fn();
    const surface = (draft: BaseDraft) => (
      <LanguageContext value="en">
        <Enrichment
          draft={draft}
          change={change}
          goEdit={() => {}}
          asOf={{ year: "2026", month: "10" }}
          prepareQuestions={prepareQuestions}
        />
      </LanguageContext>
    );
    const view = render(surface(d));
    fireEvent.click(screen.getByRole("button", { name: "Improve" }));
    const next = clone(d);
    if (changed) next.roles[0].context.value = "Changed responsibilities";
    view.rerender(surface(next));
    await act(async () => resolve(plan(d)));
    if (changed) {
      expect(change).not.toHaveBeenCalled();
      await screen.findByText(/The saved context changed/);
    } else expect(change).toHaveBeenCalledTimes(1);
    expect(prepareQuestions).toHaveBeenCalledTimes(1);
  },
);
