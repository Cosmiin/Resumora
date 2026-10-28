import { useState } from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  render,
  screen,
  waitFor,
  cleanup,
  fireEvent,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Enrichment } from "./Enrichment";
import { RoleRewrite } from "./RoleRewrite";
import { App } from "../App";
import { LanguageContext } from "./ui";
import {
  blankDraft,
  newRole,
  newOptionalEntry,
  fact,
  clone,
  editFact,
  type BaseDraft,
} from "../base/model";
import { MemoryBaseCvAdapter } from "../base/adapter";
import { maraReviewDraft } from "../base/fixture";
import { validateDraft } from "../base/validation";
import { saveAnswer } from "../base/enrichment";
import { encodeDraft, decodeDraft } from "@resumora/contracts/editor/transport";
import { careerContext } from "@resumora/contracts/intelligence/context";
import { acceptWording, currentWording } from "../base/wording";
import type { QuestionPlan } from "@resumora/contracts/intelligence/model";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.location.hash = "";
});
function base() {
  const d = blankDraft(),
    r = newRole();
  r.context = fact("Prepare weekly Excel reports.");
  r.title = fact("Operations coordinator");
  r.company = fact("Synthetic company");
  d.roles.push(r);
  return d;
}
describe("CV import and career intelligence integration", () => {
  it("persists choice-only/multi/text-only exact Q&A without automatic contribution, resumes completed plan and retains context after copy removal", async () => {
    vi.stubGlobal("fetch", () => {
      throw new Error("NETWORK_DENIED");
    });
    const user = userEvent.setup();
    let latest = base();
    const target = latest.roles[0].id;
    const plan: QuestionPlan = {
      schemaVersion: "career-question-plan/1",
      goal: "Historical saved goal",
      targetId: target,
      questions: [
        {
          id: "q1",
          dimension: "ownership",
          text: "Which activities did you do?",
          why: "Individual work is missing",
          selectionMode: "multiple",
          options: [
            { id: "merge", label: "Consolidated reports" },
            { id: "review", label: "Reviewed reports" },
          ],
        },
        {
          id: "q2",
          dimension: "impact",
          text: "Who used the report?",
          why: "Audience is missing",
          selectionMode: "single",
          options: [
            { id: "team", label: "Team meeting" },
            { id: "manager", label: "Management" },
          ],
        },
      ],
    };
    const prepareQuestions = vi.fn(async () => plan);
    function Harness({ initial }: { initial: BaseDraft }) {
      const [d, setD] = useState(initial);
      latest = d;
      return (
        <LanguageContext.Provider value="en">
          <Enrichment
            draft={d}
            change={setD}
            goEdit={() => {}}
            asOf={{ year: "2026", month: "10" }}
            prepareQuestions={prepareQuestions}
          />
        </LanguageContext.Provider>
      );
    }
    const view = render(<Harness initial={latest} />);
    await user.click(
      screen.getByRole("button", { name: "Prepare AI questions" }),
    );
    expect(prepareQuestions).toHaveBeenCalledWith(target);
    expect(screen.queryByLabelText("Question goal")).toBeNull();
    await user.click(await screen.findByLabelText("Consolidated reports"));
    await user.click(screen.getByLabelText("Reviewed reports"));
    await user.click(screen.getByRole("button", { name: /Save and next/ }));
    expect(latest.answers[0].selectedOptionIds).toEqual(["merge", "review"]);
    expect(latest.answers[0].text).toBe("");
    expect(latest.roles[0].bullets).toEqual([]);
    await user.click(await screen.findByLabelText("Team meeting"));
    await user.click(screen.getByRole("button", { name: "Clear choices" }));
    await user.type(
      screen.getByLabelText("Who used the report?"),
      "The operations team.",
    );
    await user.click(screen.getByRole("button", { name: /Save and next/ }));
    expect(latest.answers[1].selectedOptionIds).toEqual([]);
    expect(latest.answers[1].text).toBe("The operations team.");
    expect(latest.roles[0].bullets).toHaveLength(0);
    expect(
      screen.getByText("Questions completed. Your context is retained."),
    ).toBeTruthy();
    const persisted = decodeDraft(encodeDraft(latest));
    expect(persisted.questionPlans?.[0].goal).toBe("Historical saved goal");
    view.unmount();
    render(<Harness initial={persisted} />);
    await screen.findByText("Questions completed. Your context is retained.");
    await user.click(screen.getAllByRole("button", { name: "Add to CV" })[0]);
    expect(latest.roles[0].bullets[0].value).toBe("The operations team.");
    await user.click(screen.getByRole("button", { name: "Remove from CV" }));
    expect(latest.roles[0].bullets).toHaveLength(0);
    expect(latest.answers).toHaveLength(2);
    expect(
      latest.sources.find((s) => s.id === latest.answers[0].sourceId)?.text,
    ).toBe("Consolidated reports\nReviewed reports");
    await user.click(screen.getByText("All saved questions and answers"));
    const buttons = screen.getAllByRole("button", { name: "Edit answer" });
    await user.click(buttons.at(-1)!);
    expect(screen.getByLabelText("Which activities did you do?")).toBeTruthy();
  });
  it("whole-role pending rewrite uses saved context; unsupported edited metrics cannot accept, valid acceptance changes only wording, stale source suppresses it", async () => {
    const user = userEvent.setup();
    let latest = base();
    const target = latest.roles[0].id;
    latest = saveAnswer(
      latest,
      {
        id: "answer1",
        targetId: target,
        question: "ownership",
        questionText: "What did you do?",
        text: "I consolidated three files.",
        status: "draft",
      },
      latest.roles[0].context.id,
    );
    const original = JSON.stringify({
      roles: latest.roles,
      answers: latest.answers,
    });
    const context = careerContext(latest, target);
    function Harness() {
      const [d, setD] = useState(latest);
      latest = d;
      return (
        <LanguageContext.Provider value="en">
          <button
            onClick={() => {
              const next = clone(d);
              next.roles[0].context = editFact(
                next.roles[0].context,
                "New source wording.",
              );
              setD(next);
            }}
          >
            Change source
          </button>
          <RoleRewrite
            draft={d}
            targetId={target}
            change={setD}
            request={async () => ({
              schemaVersion: "career-role-rewrite/1",
              targetId: target,
              text: "I prepared the weekly Excel reports and consolidated the files.",
              factIds: context.facts.map((f) => f.id),
              warnings: [],
            })}
            accept={(draft, id, text, sources) =>
              acceptWording(draft, id, { text, sources })
            }
          />
        </LanguageContext.Provider>
      );
    }
    render(<Harness />);
    await user.click(
      screen.getByRole("button", { name: "Propose experience rewrite" }),
    );
    const input = await screen.findByLabelText(
      "Proposal — review before acceptance",
    );
    expect(latest.presentation.approvedWording).toBeUndefined();
    expect(latest.roleRewriteReviews?.[0].status).toBe("pending");
    fireEvent.change(input, { target: { value: "Reduced time by 99%." } });
    await user.click(screen.getByRole("button", { name: "Accept rewrite" }));
    expect(latest.presentation.approvedWording).toBeUndefined();
    fireEvent.change(input, {
      target: {
        value: "I prepared weekly Excel reports and consolidated the files.",
      },
    });
    await user.click(screen.getByRole("button", { name: "Accept rewrite" }));
    expect(currentWording(latest, target)).toBe(
      "I prepared weekly Excel reports and consolidated the files.",
    );
    expect(
      JSON.stringify({ roles: latest.roles, answers: latest.answers }),
    ).toBe(original);
    expect(
      decodeDraft(encodeDraft(latest)).roleRewriteReviews?.[0].status,
    ).toBe("accepted");
    await user.click(screen.getByRole("button", { name: "Change source" }));
    expect(currentWording(latest, target)).toBeNull();
    expect(latest.answers[0].text).toBe("I consolidated three files.");
  });
  it("one Confirm and save reviewed CV click persists selected confirmation and checkpoint without a second completion action", async () => {
    const user = userEvent.setup(),
      initial = maraReviewDraft();
    initial.name.status = "extracted_unconfirmed";
    initial.name.sourceClaimId = "name";
    initial.importReview = {
      id: crypto.randomUUID(),
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
            value: initial.name.value,
            page: 1,
            quote: initial.name.value,
            confidence: "high",
          },
        ],
        warnings: [],
        omittedPages: [],
      },
      confirmedIds: [],
    };
    const defaults = blankDraft();
    initial.contacts.push(
      {
        ...defaults.contacts.find((c) => c.kind === "phone")!,
        value: fact("+40 700 000 000"),
      },
      {
        ...defaults.contacts.find((c) => c.platform === "linkedin")!,
        value: fact("https://linkedin.com/in/synthetic-candidate"),
      },
    );
    const language = newOptionalEntry();
    language.title = fact("Română");
    language.proficiency = fact("Native");
    initial.optionalSections.push({
      id: "languages",
      kind: "languages",
      label: "",
      entries: [language],
    });
    expect(validateDraft(initial)).toEqual([]);
    const adapter = new MemoryBaseCvAdapter();
    await adapter.save({
      draft: initial,
      expectedRevision: 0,
      mode: "autosave",
      requestId: crypto.randomUUID(),
    });
    const save = vi.spyOn(adapter, "save");
    window.location.hash = "base";
    render(<App adapter={adapter} />);
    await user.click(
      await screen.findByRole("button", {
        name: "Selectează informațiile fără avertismente",
      }),
    );
    await user.click(
      screen.getByRole("button", {
        name: "Confirmă și salvează CV-ul verificat",
      }),
    );
    await waitFor(() =>
      expect(
        save.mock.calls.filter(([v]) => v.mode === "checkpoint"),
      ).toHaveLength(1),
    );
    const saved = await adapter.load();
    expect(saved?.draft.name.status).toBe("user_confirmed");
    expect(saved?.draft.importReview?.confirmedIds).toEqual(["name"]);
  });
});
