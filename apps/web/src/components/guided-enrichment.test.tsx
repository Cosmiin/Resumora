import { useState } from "react";
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
import { Editor } from "./Editor";
import { Enrichment } from "./Enrichment";
import { LanguageContext } from "./ui";
import { blankDraft, fact, newRole, type BaseDraft } from "../base/model";
import { currentWording } from "../base/wording";
import type {
  RoleRewrite,
  QuestionPlan,
} from "@resumora/contracts/intelligence/model";
function fixture() {
  const d = blankDraft();
  d.language = "en";
  d.name = fact("Synthetic owner");
  for (const title of ["Analyst", "Consultant"]) {
    const r = newRole();
    r.title = fact(title);
    r.company = fact("Example");
    r.context = fact("Prepared weekly reports.");
    r.bullets = [fact("Maintained SQL reports.")];
    d.roles.push(r);
  }
  return d;
}
it.each([true, false])(
  "keeps one focused question/proposal, preserves original facts, and advances only after an explicit decision (accept=%s)",
  async (accepted) => {
    const initial = fixture(),
      r = initial.roles[0];
    let latest = initial,
      resolve!: (proposal: RoleRewrite) => void;
    const questions = vi.fn(async (target: string): Promise<QuestionPlan> => ({
      schemaVersion: "career-question-plan/1",
      targetId: target,
      questions: [
        {
          id: "q",
          dimension: "ownership",
          text: "What did you personally do?",
          why: "Clarify your contribution.",
          selectionMode: "single",
          options: [],
        },
      ],
    }));
    const rewrite = vi.fn(
      () =>
        new Promise<RoleRewrite>((done) => {
          resolve = done;
        }),
    );
    function Harness() {
      const [d, set] = useState(initial),
        [target, select] = useState<string>();
      const change = (next: BaseDraft) => {
        latest = next;
        set(next);
      };
      return (
        <LanguageContext value="en">
          <ProfileOverview
            draft={d}
            editor={<Editor draft={d} issues={[]} change={change} />}
            enrichTarget={target}
            openEnrichment={select}
            closeEnrichment={() => select(undefined)}
            enrich={(id) => (
              <Enrichment
                draft={d}
                change={change}
                goEdit={() => {}}
                asOf={{ year: "2026", month: "10" }}
                selectedTargetId={id}
                embedded
                prepareQuestions={questions}
                rewriteRole={rewrite}
              />
            )}
          />
        </LanguageContext>
      );
    }
    const { container } = render(<Harness />);
    fireEvent.click(container.querySelector("#section-experience > summary")!);
    fireEvent.click(
      within(screen.getByRole("region", { name: "Analyst" })).getByRole(
        "button",
        { name: "Improve with AI" },
      ),
    );
    expect(questions).not.toHaveBeenCalled();
    expect(rewrite).not.toHaveBeenCalled();
    expect(
      container.querySelectorAll(".guided-enrichment .btn-primary"),
    ).toHaveLength(1);
    expect(
      screen.queryByRole("button", { name: "Generate role summary with AI" }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Improve" }));
    await screen.findByRole("textbox", { name: "What did you personally do?" });
    fireEvent.change(
      screen.getByRole("textbox", { name: "What did you personally do?" }),
      { target: { value: "I checked the source records." } },
    );
    expect(latest.answers[0].status).toBe("draft");
    expect(rewrite).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Confirm and create proposal" }),
    );
    await waitFor(() => expect(rewrite).toHaveBeenCalledTimes(1));
    expect(latest.answers[0].status).toBe("confirmed");
    await waitFor(() => {
      expect(
        (
          screen.getByRole("button", {
            name: "Close improvement",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(true);
      expect(
        (
          screen.getByRole("button", {
            name: "Later · next role",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(true);
    });
    await act(async () =>
      resolve({
        schemaVersion: "career-role-rewrite/1",
        targetId: r.id,
        text: "Prepared weekly reports.\n\n- Maintained SQL reports.",
        factIds: [r.context.id, r.bullets[0].id],
        warnings: [],
      }),
    );
    await screen.findByRole("button", { name: "Accept changes" });
    expect(screen.queryByRole("textbox", { name: "Edit wording" })).toBeNull();
    expect(container.querySelectorAll(".role-proposal")).toHaveLength(1);
    expect(currentWording(latest, r.id)).toBeNull();
    expect(latest.roles).toEqual(initial.roles);
    expect(
      container.querySelectorAll(".guided-enrichment .btn-primary"),
    ).toHaveLength(1);
    fireEvent.click(
      screen.getByRole("button", {
        name: accepted ? "Accept changes" : "Keep current wording",
      }),
    );
    expect(latest.roleRewriteReviews?.[0].status).toBe(
      accepted ? "accepted" : "rejected",
    );
    expect(latest.answers[0].text).toBe("I checked the source records.");
    expect(latest.roles).toEqual(initial.roles);
    fireEvent.click(screen.getByRole("button", { name: "Next role" }));
    await screen.findByRole("region", { name: "Consultant" });
    expect(questions).toHaveBeenCalledTimes(1);
    expect(rewrite).toHaveBeenCalledTimes(1);
    expect(container.querySelectorAll(".profile-role-enrichment")).toHaveLength(
      1,
    );
  },
);
