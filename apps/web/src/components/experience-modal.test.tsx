import { StrictMode, useState } from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ProfileOverview } from "./ProfileOverview";
import { Enrichment } from "./Enrichment";
import { LanguageContext } from "./ui";
import { blankDraft, fact, newRole, type BaseDraft } from "../base/model";
import { careerContext } from "@resumora/contracts/intelligence/context";
import { currentWording } from "../base/wording";
import type {
  RoleRewrite,
  QuestionPlan,
} from "@resumora/contracts/intelligence/model";

function fixture() {
  const draft = blankDraft(),
    role = newRole();
  draft.language = "en";
  draft.name = fact("Synthetic owner");
  role.title = fact("Analyst");
  role.company = fact("Example");
  role.context = fact("Prepared weekly reports.");
  draft.roles = [role];
  return draft;
}
function harness(
  initial = fixture(),
  resumed = false,
  request?: () => Promise<RoleRewrite>,
) {
  let latest = initial;
  const role = initial.roles[0];
  const questions = vi.fn(async (): Promise<QuestionPlan> => ({
    schemaVersion: "career-question-plan/1",
    targetId: role.id,
    questions: [
      {
        id: "ownership",
        dimension: "ownership",
        text: "What did you personally do?",
        why: "Clarify ownership.",
        selectionMode: "single",
        options: [],
      },
    ],
  }));
  const proposal = (): RoleRewrite => ({
    schemaVersion: "career-role-rewrite/1",
    targetId: role.id,
    text: "Prepared weekly reports and checked source records.",
    factIds: careerContext(latest, role.id).facts.map((fact) => fact.id),
    warnings: [],
  });
  const rewrite = vi.fn(request ?? (async () => proposal()));
  function Surface() {
    const [draft, setDraft] = useState(initial),
      [target, select] = useState<string | undefined>(
        resumed ? role.id : undefined,
      );
    const change = (next: BaseDraft) => {
      latest = next;
      setDraft(next);
    };
    return (
      <LanguageContext value="en">
        <ProfileOverview
          draft={draft}
          change={change}
          editor={null}
          enrichTarget={target}
          openEnrichment={select}
          closeEnrichment={() => select(undefined)}
          enrich={(id) => (
            <Enrichment
              autoStart
              embedded
              durable
              draft={draft}
              change={change}
              goEdit={() => {}}
              asOf={{ year: "2026", month: "11" }}
              selectedTargetId={id}
              prepareQuestions={questions}
              rewriteRole={rewrite}
            />
          )}
        />
      </LanguageContext>
    );
  }
  const view = render(
    <StrictMode>
      <Surface />
    </StrictMode>,
  );
  return { ...view, latest: () => latest, questions, rewrite, proposal };
}
async function answer() {
  fireEvent.click(
    screen.getByRole("button", { name: "Improve this experience" }),
  );
  const input = await screen.findByRole("textbox", {
    name: "What did you personally do?",
  });
  fireEvent.change(input, { target: { value: "I checked source records." } });
  fireEvent.click(screen.getByRole("button", { name: "Review description" }));
}

it.each([true, false])(
  "requires an explicit decision in one modal, retaining source facts (accept=%s)",
  async (accepted) => {
    const initial = fixture(),
      view = harness(initial);
    expect(screen.queryByRole("dialog")).toBeNull();
    await answer();
    const apply = await screen.findByRole("button", {
      name: "Use this description",
    });
    const dialog = screen.getByRole("dialog", {
      name: "Improve this experience",
    });
    expect(document.querySelectorAll("dialog.experience-modal")).toHaveLength(
      1,
    );
    expect(document.querySelector(".profile-document-assistant")).toBeNull();
    expect(
      within(dialog).queryByText("Current wording and evidence"),
    ).toBeNull();
    expect(
      within(dialog).getByText("View current wording").parentElement,
    ).not.toHaveProperty("open", true);
    expect(view.questions).toHaveBeenCalledTimes(1);
    expect(view.rewrite).toHaveBeenCalledTimes(1);
    expect(view.latest().answers[0].status).toBe("confirmed");
    expect(currentWording(view.latest(), initial.roles[0].id)).toBeNull();
    if (accepted) fireEvent.click(apply);
    else {
      fireEvent.click(
        within(dialog).getByText("More options", { selector: "summary" }),
      );
      fireEvent.click(
        within(dialog).getByRole("button", { name: "Keep current wording" }),
      );
    }
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(view.latest().roles).toEqual(initial.roles);
    expect(view.latest().roleRewriteReviews?.[0].status).toBe(
      accepted ? "accepted" : "rejected",
    );
    expect(!!currentWording(view.latest(), initial.roles[0].id)).toBe(accepted);
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: "Improve this experience" }),
      ),
    );
  },
);

it("retains a draft answer on Escape, restores focus and resumes without another question request", async () => {
  const view = harness();
  fireEvent.click(
    screen.getByRole("button", { name: "Improve this experience" }),
  );
  const input = await screen.findByRole("textbox", {
    name: "What did you personally do?",
  });
  fireEvent.change(input, { target: { value: "Unfinished personal details" } });
  fireEvent(
    screen.getByRole("dialog"),
    new Event("cancel", { bubbles: true, cancelable: true }),
  );
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(document.body.style.overflow).toBe("");
  expect(view.latest().answers[0].status).toBe("draft");
  fireEvent.click(
    screen.getByRole("button", { name: "Improve this experience" }),
  );
  expect(
    await screen.findByRole("textbox", { name: "What did you personally do?" }),
  ).toHaveProperty("value", "Unfinished personal details");
  expect(view.questions).toHaveBeenCalledTimes(1);
  expect(view.rewrite).not.toHaveBeenCalled();
});

it("resumes a stored proposal after remount without starting another AI operation", async () => {
  const first = harness();
  await answer();
  await screen.findByRole("button", { name: "Use this description" });
  const saved = first.latest();
  first.unmount();
  const resumed = harness(saved, true);
  await screen.findByRole("button", { name: "Use this description" });
  expect(resumed.questions).not.toHaveBeenCalled();
  expect(resumed.rewrite).not.toHaveBeenCalled();
  expect(currentWording(resumed.latest(), saved.roles[0].id)).toBeNull();
});

it("keeps an in-flight proposal mounted when Escape is pressed", async () => {
  let resolve!: (value: RoleRewrite) => void;
  const view = harness(
    fixture(),
    false,
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  await answer();
  await waitFor(() => expect(view.rewrite).toHaveBeenCalledTimes(1));
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Close improvement" }),
    ).toHaveProperty("disabled", true),
  );
  fireEvent(
    screen.getByRole("dialog"),
    new Event("cancel", { bubbles: true, cancelable: true }),
  );
  expect(screen.getByRole("dialog")).toBeTruthy();
  await act(async () => resolve(view.proposal()));
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Use this description" }),
    ).toHaveProperty("disabled", false),
  );
});

it("blocks a stale proposal after editing an answer without silently generating another", async () => {
  const view = harness();
  await answer();
  await screen.findByRole("button", { name: "Use this description" });
  fireEvent.click(screen.getByRole("button", { name: "Back to details" }));
  fireEvent.click(await screen.findByRole("button", { name: "Edit answer" }));
  const input = screen.getByRole("textbox", {
    name: "What did you personally do?",
  });
  fireEvent.change(input, {
    target: { value: "I also checked monthly records." },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save answer" }));
  const apply = await screen.findByRole("button", {
    name: "Use this description",
  });
  expect(apply).toHaveProperty("disabled", true);
  expect(view.rewrite).toHaveBeenCalledTimes(1);
  expect(screen.getByText(/Your details changed/)).toBeTruthy();
});
