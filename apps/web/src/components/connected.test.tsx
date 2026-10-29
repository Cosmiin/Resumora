import {
  projectJobEditor,
  jobEditorFacts,
  type JobEditorPayload,
} from "@resumora/contracts/jobs/documents";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from "@testing-library/react";
import { it, expect, vi } from "vitest";
import { JobsScreen } from "./JobsScreen";
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
it.each(["none", "capture", "review"])(
  "%s retry preserves unrelated intake while reviewing a saved capture",
  async (failure) => {
    const calls: { path: string; body: any }[] = [];
    let failed = false;
    const job = {
      id: crypto.randomUUID(),
      versionId: null,
      state: "draft",
      snapshotId: crypto.randomUUID(),
      snapshotRevision: 1,
      intake: { text: "Required SQL.", sourceUrl: "https://example.invalid/a" },
      requirements: [],
    };
    const transport = vi.fn(async (path: string, init?: RequestInit) => {
      if (init?.body) {
        const body = JSON.parse(String(init.body));
        calls.push({ path, body });
        if (
          !failed &&
          (failure === "capture"
            ? path === "/v1/jobs"
            : failure === "review" && path.endsWith("review"))
        ) {
          failed = true;
          throw new TypeError("Synthetic connection failure");
        }
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
    fireEvent.change(screen.getByLabelText("Source URL (optional)"), {
      target: { value: job.intake.sourceUrl },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save job draft" }));
    if (failure === "capture") {
      fireEvent.click(
        await screen.findByRole("button", { name: "Retry same request" }),
      );
    }
    await screen.findByLabelText("Title");
    expect(calls[0].body.intake).toEqual(job.intake);
    await waitFor(() =>
      expect(
        (screen.getByLabelText("Advert text") as HTMLTextAreaElement).value,
      ).toBe(""),
    );
    expect(
      (screen.getByLabelText("Source URL (optional)") as HTMLInputElement)
        .value,
    ).toBe("");
    fireEvent.change(screen.getByLabelText("Advert text"), {
      target: { value: "Unsubmitted advert B" },
    });
    fireEvent.change(screen.getByLabelText("Source URL (optional)"), {
      target: { value: "https://example.invalid/b" },
    });
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Synthetic role" },
    });
    fireEvent.change(screen.getByLabelText("Company"), {
      target: { value: "Synthetic company" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm details" }));
    if (failure === "review") {
      fireEvent.click(
        await screen.findByRole("button", { name: "Retry same request" }),
      );
    }
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Confirm details" }),
      ).toBeNull(),
    );
    expect(calls).toHaveLength(failure === "none" ? 2 : 3);
    expect(calls.at(-1)!.path).toMatch(/review$/);
    expect(calls.at(-1)!.body).not.toHaveProperty("text");
    if (failure !== "none") {
      const repeated = calls.filter((c) =>
        failure === "capture"
          ? c.path === "/v1/jobs"
          : c.path.endsWith("review"),
      );
      expect(repeated[0]).toEqual(repeated[1]);
    }
    expect(
      (screen.getByLabelText("Advert text") as HTMLTextAreaElement).value,
    ).toBe("Unsubmitted advert B");
    expect(
      (screen.getByLabelText("Source URL (optional)") as HTMLInputElement)
        .value,
    ).toBe("https://example.invalid/b");
  },
);
it("opens complete saved detail from compact job list metadata", async () => {
  const job = {
    id: crypto.randomUUID(),
    state: "draft",
    versionId: null,
    createdAt: "2026-10-28T00:00:00Z",
    snapshotRevision: 1,
    snapshotId: crypto.randomUUID(),
    intake: {
      text: "a".repeat(200000),
      title: "Full saved title",
      sourceUrl: "https://example.invalid/job",
    },
    requirements: [{ text: "aaa", priority: "required" }],
  };
  const transport = vi.fn(async (path: string) =>
    Response.json(
      path === "/v1/jobs"
        ? [
            {
              id: job.id,
              state: job.state,
              createdAt: job.createdAt,
              title: "Saved title",
            },
          ]
        : job,
    ),
  );
  const view = render(
    <LanguageContext value="en">
      <JobsScreen transport={transport} snapshot={null} ready />
    </LanguageContext>,
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "Saved title · Draft" }),
  );
  await screen.findByDisplayValue(job.intake.title);
  expect(view.container.querySelector("pre")!.textContent).toBe(
    job.intake.text,
  );
  expect(screen.getByText(job.intake.sourceUrl)).toBeTruthy();
  expect(
    screen.getByText("Required", { selector: "strong" }).parentElement!
      .textContent,
  ).toContain(": aaa");
  expect(transport).toHaveBeenCalledWith("/v1/jobs/" + job.id);
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

it("renders accepted job wording through existing preview while Base facts and answers stay independent", () => {
  const base = blankDraft();
  base.language = "en";
  const role = newRole();
  role.title.value = "Engineer";
  role.company.value = "Original employer";
  role.context.value = "Maintained PLC systems";
  base.roles.push(role);
  base.answers.push({
    id: "context-answer",
    targetId: role.id,
    question: "impact",
    questionText: "Exact question?",
    text: "Exact answer",
    status: "confirmed",
    sourceId: "local_manual",
  });
  const source = encodeDraft(base);
  const payload: JobEditorPayload = {
    schemaVersion: "resumora-job-editor/1",
    acceptance: "accepted",
    source: { snapshotId: crypto.randomUUID(), revision: 1 },
    job: {
      id: crypto.randomUUID(),
      versionId: null,
      fingerprint: "a".repeat(64),
    },
    selectedFacts: jobEditorFacts(base).map((row) => row.ref),
    selectedAnswerIds: ["context-answer"],
    wording: [
      {
        targetId: role.id,
        text: "Accepted job-specific description.",
        origin: "ai_generated",
        acceptance: "accepted",
        valueIds: [role.context.id],
        answerIds: ["context-answer"],
      },
    ],
    presentation: { templateVersionId: "unknown-future-template" },
    localAdditions: [],
  };
  const jobDraft = projectJobEditor(source, payload);
  expect(currentWording(jobDraft, role.id)).toBe(
    "Accepted job-specific description.",
  );
  render(
    <LanguageContext value="en">
      <DocumentPreview draft={jobDraft} asOf={{ year: "2026", month: "10" }} />
    </LanguageContext>,
  );
  expect(screen.getByText("Accepted job-specific description.")).toBeTruthy();
  expect(screen.getByText("Original employer")).toBeTruthy();
  expect(jobDraft.roles[0].context).toEqual(base.roles[0].context);
  expect(jobDraft.answers).toEqual(base.answers);
  expect(source).toEqual(encodeDraft(base));
  expect(base.presentation.approvedWording).toBeUndefined();
});
