import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { RoleRewrite } from "./RoleRewrite";
import { AutoTextarea } from "./AutoTextarea";
import { LanguageContext } from "./ui";
import { blankDraft, newRole, fact, clone } from "../base/model";
import {
  httpIntelligence,
  IntelligenceRequestError,
} from "../base/intelligence";
import { createRef } from "react";
const operationId = "11111111-1111-4111-8111-111111111111";
function fixture() {
  const d = blankDraft(),
    r = newRole();
  r.context = fact("Prepared weekly reports.");
  d.roles = [r];
  d.answers = [
    {
      id: "answer",
      targetId: r.id,
      question: "ownership",
      questionText: "What did you do?",
      text: "Checked records",
      status: "confirmed",
    },
  ];
  return d;
}
const proposal = (d: ReturnType<typeof fixture>) => ({
  schemaVersion: "career-role-rewrite/1" as const,
  targetId: d.roles[0].id,
  text: "Prepared weekly reports.",
  factIds: [d.roles[0].context.id],
  warnings: [],
});
afterEach(() => {
  vi.restoreAllMocks();
  sessionStorage.clear();
});
it("native textarea fits supplied, typed, reopened and width-reflowed content, preserves ref and keyboard", () => {
  let height = 180;
  vi.spyOn(
    HTMLTextAreaElement.prototype,
    "scrollHeight",
    "get",
  ).mockImplementation(() => height);
  const ref = createRef<HTMLTextAreaElement>(),
    key = vi.fn();
  const surface = (value: string) => (
    <label>
      Proposal
      <AutoTextarea
        ref={ref}
        value={value}
        onChange={() => {}}
        onKeyDown={key}
      />
    </label>
  );
  const view = render(surface("Existing long proposal"));
  const input = screen.getByRole("textbox");
  expect(ref.current).toBe(input);
  expect(input.style.height).toBe("180px");
  expect(input.style.resize).toBe("none");
  height = 320;
  view.rerender(surface("A longer edited proposal"));
  expect(input.style.height).toBe("320px");
  height = 480;
  act(() => window.dispatchEvent(new Event("resize")));
  expect(input.style.height).toBe("480px");
  fireEvent.keyDown(input, { key: "Enter", ctrlKey: true });
  expect(key).toHaveBeenCalledTimes(1);
  view.unmount();
  height = 240;
  render(surface("Reopened proposal"));
  expect(ref.current!.style.height).toBe("240px");
});
it.each([false, true])(
  "rewrite pending result preserves content guard rather than object identity; changed=%s",
  async (changed) => {
    const d = fixture(),
      change = vi.fn();
    let resolve!: (p: ReturnType<typeof proposal>) => void;
    const request = vi.fn(
      () =>
        new Promise<ReturnType<typeof proposal>>((r) => {
          resolve = r;
        }),
    );
    const surface = (draft: typeof d) => (
      <LanguageContext value="en">
        <RoleRewrite
          draft={draft}
          targetId={d.roles[0].id}
          request={request}
          change={change}
        />
      </LanguageContext>
    );
    const view = render(surface(d));
    fireEvent.click(
      screen.getByRole("button", { name: "Propose experience rewrite" }),
    );
    const next = clone(d);
    if (changed) next.answers[0].text = "Different evidence";
    view.rerender(surface(next));
    await act(async () => resolve(proposal(d)));
    expect(request).toHaveBeenCalledTimes(1);
    expect(change).toHaveBeenCalledTimes(changed ? 0 : 1);
    if (changed) await screen.findByText(/Context changed or is not saved/);
  },
);
it.each([
  ["en", "AI_OUTPUT_TRUNCATED", "AI stopped before finishing", false],
  ["ro", "AI_OUTPUT_TRUNCATED", "AI s-a oprit înainte", false],
  ["en", "AI_OUTPUT_INVALID", "did not pass structure or evidence", false],
  ["ro", "STALE_INPUT", "Contextul s-a schimbat", false],
  ["en", "AI_DISABLED", "AI processing is off", false],
  ["ro", "AI_UNCONFIGURED", "Procesarea AI este dezactivată", false],
  ["en", "AI_TIMEOUT_UNKNOWN", "request timed out", true],
  ["ro", "AI_REQUEST_UNKNOWN", "Nu putem confirma rezultatul", true],
] as const)(
  "%s rewrite %s explains outcome, preserves old text/answers, and fences unknown",
  async (locale, code, message, uncertain) => {
    const d = fixture();
    d.roleRewriteReviews = [
      {
        id: "prior",
        input: {
          targetId: d.roles[0].id,
          locale: d.language,
          facts: [
            {
              id: d.roles[0].context.id,
              text: d.roles[0].context.value,
              sourceId: d.roles[0].context.sourceId,
            },
          ],
        },
        proposal: proposal(d),
        status: "pending",
      },
    ];
    const before = clone(d),
      change = vi.fn(),
      request = vi
        .fn()
        .mockRejectedValue(new IntelligenceRequestError(code, operationId));
    render(
      <LanguageContext value={locale}>
        <RoleRewrite
          draft={d}
          targetId={d.roles[0].id}
          request={request}
          change={change}
        />
      </LanguageContext>,
    );
    fireEvent.click(
      screen.getByRole("button", {
        name:
          locale === "en"
            ? "Propose experience rewrite"
            : "Propune rescrierea experienței",
      }),
    );
    await screen.findByText(new RegExp(message));
    expect(request).toHaveBeenCalledTimes(1);
    expect(change).not.toHaveBeenCalled();
    expect(d).toEqual(before);
    expect(screen.getByRole<HTMLTextAreaElement>("textbox").value).toBe(
      before.roleRewriteReviews![0].proposal.text,
    );
    expect(screen.getByText(operationId)).toBeTruthy();
    const retry = screen.getByRole<HTMLButtonElement>("button", {
      name: uncertain
        ? locale === "en"
          ? "Check earlier request"
          : "Verifică cererea anterioară"
        : locale === "en"
          ? "Retry rewrite"
          : "Reîncearcă rescrierea",
    });
    expect(retry.disabled).toBe(false);
    fireEvent.click(retry);
    await act(async () => {});
    expect(request).toHaveBeenCalledTimes(2);
  },
);
it("unknown network outcome retains request identity across client recreation and never dispatches a duplicate", async () => {
  const transport = vi.fn().mockRejectedValue(new Error("lost response"));
  const context = {
    snapshotId: operationId,
    revision: 1,
    targetId: "role",
    operationId,
  };
  await expect(
    httpIntelligence(transport).rewrite(context),
  ).rejects.toMatchObject({ code: "AI_REQUEST_UNKNOWN", operationId });
  await expect(
    httpIntelligence(transport).rewrite({
      ...context,
      operationId: crypto.randomUUID(),
    }),
  ).rejects.toMatchObject({ code: "AI_REQUEST_UNKNOWN", operationId });
  expect(
    transport.mock.calls.filter(([, init]) => init.method === "POST"),
  ).toHaveLength(1);
  expect(transport.mock.calls.at(-1)?.[0]).toBe(
    `/v1/intelligence/operations/${operationId}`,
  );
  const stored = Object.keys(sessionStorage).map((k) =>
    sessionStorage.getItem(k),
  );
  expect(stored).toEqual([operationId]);
});
it("known truncated outcome permits one new explicit request without automatic calls", async () => {
  const transport = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json(
        { error: { code: "AI_OUTPUT_TRUNCATED" } },
        { status: 502 },
      ),
    )
    .mockResolvedValueOnce(Response.json(proposal(fixture())));
  const client = httpIntelligence(transport),
    context = {
      snapshotId: operationId,
      revision: 1,
      targetId: "role",
      operationId,
    };
  await expect(client.rewrite(context)).rejects.toMatchObject({
    code: "AI_OUTPUT_TRUNCATED",
    operationId,
  });
  expect(transport).toHaveBeenCalledTimes(1);
  await client.rewrite({ ...context, operationId: crypto.randomUUID() });
  expect(transport).toHaveBeenCalledTimes(2);
  expect(sessionStorage.length).toBe(0);
});

it("a recovered definite failure permits a new explicit rewrite while unknown recovery uses reads", async () => {
  const d = fixture(),
    transport = vi
      .fn()
      .mockRejectedValueOnce(Error("Lost failure response"))
      .mockResolvedValueOnce(
        Response.json({
          id: operationId,
          kind: "rewrite",
          state: "failed",
          input: {},
          result: null,
        }),
      )
      .mockResolvedValueOnce(Response.json(proposal(d))),
    context = {
      snapshotId: operationId,
      revision: 1,
      targetId: d.roles[0].id,
      operationId,
    };
  const client = httpIntelligence(transport);
  await expect(client.rewrite(context)).rejects.toMatchObject({
    code: "AI_REQUEST_UNKNOWN",
  });
  await expect(
    client.rewrite({ ...context, operationId: crypto.randomUUID() }),
  ).rejects.toMatchObject({ code: "AI_OUTPUT_INVALID" });
  expect(transport.mock.calls[1][1].method).toBe("GET");
  await client.rewrite({ ...context, operationId: crypto.randomUUID() });
  expect(
    transport.mock.calls.filter(([, init]) => init.method === "POST"),
  ).toHaveLength(2);
});
