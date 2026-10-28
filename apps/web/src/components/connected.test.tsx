import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { it, expect, vi } from "vitest";
import { JobsScreen } from "./JobsScreen";
import { AiSuggestions } from "./AiSuggestions";
import { blankDraft, newRole, fact } from "../base/model";
import { encodeDraft, decodeDraft } from "@resumora/contracts/editor/transport";
import { cvRoute } from "../../../api/src/cv/routes";
import { currentWording } from "../base/wording";
import { LanguageContext } from "./ui";
it("paste saves raw draft first, then reviews details without changing source", async () => {
  const calls: { path: string; body: any }[] = [];
  const job = {
    id: crypto.randomUUID(),
    versionId: null,
    state: "draft",
    snapshotId: crypto.randomUUID(),
    snapshotRevision: 1,
    intake: { text: "Required SQL." },
    requirements: [],
  };
  const transport = vi.fn(async (path: string, init?: RequestInit) => {
    if (init?.body) {
      const body = JSON.parse(String(init.body));
      calls.push({ path, body });
      return Response.json({
        ...job,
        ...(path.endsWith("review")
          ? {
              state: "reviewed",
              intake: {
                ...job.intake,
                title: body.title,
                company: body.company,
              },
            }
          : {}),
      });
    }
    return Response.json([]);
  });
  render(
    <LanguageContext value="en">
      <JobsScreen
        transport={transport}
        snapshot={{ id: job.snapshotId, revision: 1 }}
        ready
      />
    </LanguageContext>,
  );
  fireEvent.change(screen.getByLabelText("Advert text"), {
    target: { value: job.intake.text },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save job draft" }));
  await screen.findByLabelText("Title");
  expect(calls[0].body.intake).toEqual({ text: job.intake.text });
  fireEvent.change(screen.getByLabelText("Title"), {
    target: { value: "Synthetic role" },
  });
  fireEvent.change(screen.getByLabelText("Company"), {
    target: { value: "Synthetic company" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Confirm details" }));
  await waitFor(() => expect(calls).toHaveLength(2));
  expect(calls[1].path).toMatch(/review$/);
  expect(calls[1].body).not.toHaveProperty("text");
});
it("proposal changes presentation only after acceptance; answers and career facts survive version serialization", async () => {
  const draft = blankDraft();
  const role = newRole();
  role.context = fact("Maintained reports.");
  draft.roles.push(role);
  draft.answers.push({
    id: "answer",
    targetId: role.id,
    question: "tools",
    questionText: "Tools?",
    text: "SQL",
    status: "confirmed",
    sourceId: "answer-source",
  });
  const proposal = {
    status: "proposal",
    targetId: role.id,
    text: "Maintained reports.",
    sources: [
      {
        id: role.context.id,
        text: role.context.value,
        sourceId: role.context.sourceId,
      },
    ],
  };
  const change = vi.fn();
  const transport = vi.fn(async () => Response.json({ proposal }));
  const view = render(
    <LanguageContext value="en">
      <AiSuggestions
        draft={draft}
        targetId={role.id}
        snapshot={{ id: crypto.randomUUID(), revision: 1 }}
        ready
        transport={transport}
        change={change}
      />
    </LanguageContext>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Suggest wording" }));
  const accept = await screen.findByRole("button", { name: "Accept wording" });
  expect(change).not.toHaveBeenCalled();
  fireEvent.click(accept);
  const next = change.mock.calls[0][0];
  expect(next.answers).toEqual(draft.answers);
  expect(next.roles).toEqual(draft.roles);
  expect(currentWording(next, role.id)).toBe(proposal.text);
  const request = new Request("https://resumora.invalid/v1/base-cv/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      requestId: crypto.randomUUID(),
      expectedRevision: 0,
      mode: "autosave",
      draft: next,
    }),
  });
  const persisted = await cvRoute(request, {
    saveDraft: async (input: { payload: ReturnType<typeof encodeDraft> }) => ({
      id: crypto.randomUUID(),
      revision: 1,
      parentId: null,
      reason: "autosave",
      createdAt: new Date().toISOString(),
      payload: input.payload,
    }),
  } as any);
  const saved = await persisted.json();
  expect(saved.draft.presentation.approvedWording).toEqual(
    next.presentation.approvedWording,
  );
  expect(decodeDraft(encodeDraft(saved.draft)).answers).toEqual(draft.answers);
  next.roles[0].context.value = "Changed source";
  expect(currentWording(next, role.id)).toBeNull();
  view.unmount();
});
it("disabled response retains manual context and presents an honest state", async () => {
  const draft = blankDraft(),
    role = newRole();
  draft.roles.push(role);
  const change = vi.fn();
  render(
    <LanguageContext value="en">
      <AiSuggestions
        draft={draft}
        targetId={role.id}
        snapshot={{ id: crypto.randomUUID(), revision: 1 }}
        ready
        transport={async () =>
          Response.json(
            { error: { code: "enhancementDisabled" } },
            { status: 503 },
          )
        }
        change={change}
      />
    </LanguageContext>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Suggest wording" }));
  await screen.findByText(
    "AI suggestions are switched off. You can continue manually.",
  );
  expect(change).not.toHaveBeenCalled();
});
