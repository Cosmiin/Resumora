import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from "@testing-library/react";
import { it, expect, vi } from "vitest";
import { AiSuggestions } from "./AiSuggestions";
import {
  blankDraft,
  newRole,
  newOptionalEntry,
  fact,
  type Fact,
} from "../base/model";
import { DocumentPreview } from "./DocumentPreview";
import { encodeDraft, decodeDraft } from "@resumora/contracts/editor/transport";
import { cvRoute } from "../../../api/src/cv/routes";
import { acceptWording, currentWording } from "../base/wording";
import { LanguageContext } from "./ui";
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

it.each([
  "role",
  "projects",
  "certifications",
  "volunteering",
  "custom",
] as const)(
  "%s accepted wording respects slots and citations in editable and saved previews",
  (kind) => {
    let draft = blankDraft();
    draft.language = "en";
    const bullet = fact("I used SQL.");
    const entry = newOptionalEntry(),
      role = newRole();
    const output: Fact<string> = kind === "role" ? role.context : entry.details;
    output.value = "Original source context.";
    let target: string, section: string;
    if (kind === "role") {
      role.bullets = [bullet];
      draft.roles.push(role);
      target = role.id;
      section = "experience";
    } else {
      entry.bullets = [bullet];
      section = "optional-test";
      draft.optionalSections.push({
        id: section,
        kind,
        label: "Extra",
        entries: [entry],
      });
      draft.presentation.order.push(section);
      target = entry.id;
    }
    const source = {
      id: bullet.id,
      text: bullet.value,
      sourceId: bullet.sourceId,
    };
    draft = acceptWording(draft, target, {
      text: "Used SQL.",
      sources: [source],
    });
    const edit = vi.fn(),
      navigate = vi.fn();
    const preview = (editable: boolean) => (
      <LanguageContext value="en">
        <DocumentPreview
          draft={draft}
          asOf={{ year: "2026", month: "10" }}
          {...(editable ? { onTextEdit: edit, onEdit: navigate } : {})}
        />
      </LanguageContext>
    );
    const view = render(preview(true));
    fireEvent.click(screen.getByText("Used SQL."));
    expect(navigate).toHaveBeenCalledWith(output.fieldId);
    const originals = screen
      .getByText("Edit original text")
      .closest("details")!;
    originals.open = true;
    const editor = within(originals).getByRole("textbox", {
      name: "Preview text",
    });
    expect(editor.textContent).toBe(output.value);
    editor.textContent = "Revised original.";
    fireEvent.input(editor);
    expect(edit).toHaveBeenCalledWith(output.fieldId, "Revised original.");
    view.rerender(preview(false));
    expect(screen.getByText("Used SQL.")).toBeTruthy();
    for (const hidden of [
      output.fieldId,
      bullet.fieldId,
      ...(kind === "role" ? [`${target}-contributions`] : []),
    ]) {
      draft.presentation.hiddenFields = [hidden];
      for (const editable of [true, false]) {
        view.rerender(preview(editable));
        expect(screen.queryByText("Used SQL.")).toBeNull();
      }
      expect(currentWording(draft, target)).toBeNull();
    }
    draft.presentation.hiddenFields = [draft.name.fieldId];
    view.rerender(preview(true));
    expect(screen.getByText("Used SQL.")).toBeTruthy();
    draft.answers.push({
      id: "linked-answer",
      targetId: target,
      question: "tools",
      questionText: "Tools?",
      text: bullet.value,
      sourceId: bullet.sourceId,
      status: "confirmed",
      cvFieldId: bullet.fieldId,
    });
    draft.presentation.approvedWording![target].sources = [
      { ...source, id: "linked-answer" },
    ];
    for (const hidden of [
      bullet.fieldId,
      ...(kind === "role" ? [`${target}-contributions`] : []),
    ]) {
      draft.presentation.hiddenFields = [hidden];
      view.rerender(preview(true));
      expect(screen.queryByText("Used SQL.")).toBeNull();
    }
    draft.presentation.hiddenFields = [];
    draft.presentation.hidden.push(section);
    view.rerender(preview(true));
    expect(screen.queryByText("Used SQL.")).toBeNull();
    expect(currentWording(draft, target)).toBeNull();
    draft.presentation.hidden = [];
    draft.presentation.approvedWording![target].sources = [source];
    const changed =
      kind === "role"
        ? draft.roles[0].context
        : draft.optionalSections.at(-1)!.entries[0].details;
    draft.presentation.approvedWording![target] = {
      text: "Accepted context.",
      sources: [
        { id: changed.id, text: changed.value, sourceId: changed.sourceId },
      ],
    };
    changed.value = "Revised original.";
    view.rerender(preview(true));
    expect(screen.queryByText("Accepted context.")).toBeNull();
    expect(
      screen
        .getAllByRole("textbox")
        .some((e) => e.textContent === changed.value),
    ).toBe(true);
  },
);
