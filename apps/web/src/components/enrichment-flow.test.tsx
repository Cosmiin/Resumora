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
import { blankDraft, fact, newRole, type BaseDraft } from "../base/model";
import { careerContext } from "@resumora/contracts/intelligence/context";
import { Enrichment } from "./Enrichment";
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
  await screen.findByText(/AI questions are unavailable/);
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
