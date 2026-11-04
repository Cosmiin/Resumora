import { StrictMode, useState } from "react";
import {
  render,
  screen,
  waitFor,
  fireEvent,
  act,
} from "@testing-library/react";
import { expect, it, vi, beforeEach, afterEach } from "vitest";
import { webcrypto } from "node:crypto";
import { blankDraft, fact, clone, type BaseDraft } from "../base/model";
import { ImproveSkills } from "./ImproveSkills";
import { LanguageContext } from "./ui";
import { httpIntelligence } from "../base/intelligence";
import { encodeDraft, decodeDraft } from "@resumora/contracts/editor/transport";
import {
  getSkillInventory,
  skillReviewFingerprint,
  skillReviewIdentity,
} from "@resumora/contracts/intelligence/skills-improvement";
beforeEach(() =>
  Object.defineProperty(crypto, "subtle", {
    configurable: true,
    value: webcrypto.subtle,
  }),
);
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
function setup(initial: BaseDraft, request: any) {
  let latest = initial;
  const commit = vi.fn(async (identity: string, inventory: any) => {
    expect(identity).toBe(skillReviewIdentity(latest));
    return true;
  });
  let edit: (d: BaseDraft) => void = () => {};
  function Harness() {
    const [d, set] = useState(initial);
    latest = d;
    edit = set;
    return (
      <LanguageContext.Provider value="en">
        <ImproveSkills
          draft={d}
          change={set}
          ready={true}
          saveFailed={false}
          snapshot={{ id: "saved", revision: 1 }}
          request={request}
          commit={commit}
          undo={async () => true}
          canUndo={false}
        />
      </LanguageContext.Provider>
    );
  }
  const view = render(
    <StrictMode>
      <Harness />
    </StrictMode>,
  );
  if (!initial.skillReview)
    fireEvent.click(screen.getByRole("button", { name: "Improve skills" }));
  return {
    view,
    commit,
    latest: () => latest,
    edit: (d: BaseDraft) => act(() => edit(d)),
  };
}
it("one click flow stages a full result once under StrictMode and leaves publication to confirmed saving", async () => {
  const d = blankDraft();
  d.technicalSkills = [fact("Using SQL daily")];
  const inventory = getSkillInventory(d);
  inventory.technicalSkills[0].value = "SQL";
  const request = vi.fn(async (c: any) => ({
    schemaVersion: "skills-improvement/1",
    fingerprint: c.fingerprint,
    inventory,
    removed: [],
  }));
  const h = setup(d, request);
  await waitFor(() => expect(h.commit).toHaveBeenCalledTimes(1));
  expect(request).toHaveBeenCalledTimes(1);
  expect(h.latest().technicalSkills[0].value).toBe("Using SQL daily");
  expect(screen.getByText("Skills improved and saved.")).toBeTruthy();
});

it("discards a hung attempt at 90 seconds, allows a fresh click, and ignores its late result", async () => {
  vi.spyOn(crypto.subtle, "digest").mockResolvedValue(new ArrayBuffer(32));
  vi.useFakeTimers();
  const d = blankDraft();
  d.technicalSkills = [fact("Original SQL")];
  const calls: {
    context: any;
    resolve: (value: any) => void;
    signal?: AbortSignal;
  }[] = [];
  const request = vi.fn(
    (context: any, _recover: boolean, signal?: AbortSignal) =>
      new Promise((resolve) => calls.push({ context, resolve, signal })),
  );
  const h = setup(d, request);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(calls).toHaveLength(1);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(89998);
  });
  expect(h.latest().skillReview).toBeDefined();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(h.latest().skillReview).toBeUndefined();
  expect(h.latest().technicalSkills).toEqual(d.technicalSkills);
  expect(screen.getByRole("alert").textContent).toContain("90 seconds");
  expect(calls[0].signal?.aborted).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Improve skills" }));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(calls).toHaveLength(2);
  expect(calls[1].context.operationId).not.toBe(calls[0].context.operationId);
  await act(async () =>
    calls[0].resolve({
      schemaVersion: "skills-improvement/1",
      fingerprint: calls[0].context.fingerprint,
      inventory: getSkillInventory(d),
      removed: [],
    }),
  );
  expect(h.commit).not.toHaveBeenCalled();
  expect(h.latest().skillReview?.operationId).toBe(
    calls[1].context.operationId,
  );
  expect(
    screen.getByRole("button", { name: "Improving skills…" }),
  ).toHaveProperty("disabled", true);
});

it("uses the saved deadline after remount and releases an unavailable result without another generation", async () => {
  const d = blankDraft();
  d.skillReview = {
    operationId: "saved-request",
    snapshotId: "saved",
    revision: 1,
    fingerprint: await skillReviewFingerprint(d),
    expiresAt: Date.now() + 10000,
  };
  d.skillReview = decodeDraft(encodeDraft(d)).skillReview;
  vi.useFakeTimers();
  const request = vi.fn(async () => {
    throw Error("AI_RESULT_UNAVAILABLE");
  });
  const h = setup(d, request);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10000);
  });
  expect(h.latest().skillReview).toBeUndefined();
  expect(h.commit).not.toHaveBeenCalled();
  expect(request).toHaveBeenCalledTimes(1);
});
it("unlocks after 90 seconds even when preparing the request has not completed", async () => {
  vi.spyOn(crypto.subtle, "digest").mockImplementation(
    () => new Promise(() => {}),
  );
  vi.useFakeTimers();
  const request = vi.fn();
  const h = setup(blankDraft(), request);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(90000);
  });
  expect(screen.getByRole("button", { name: "Improve skills" })).toHaveProperty(
    "disabled",
    false,
  );
  expect(h.latest().skillReview).toBeUndefined();
  expect(request).not.toHaveBeenCalled();
});
it("releases the Profile activity lock if the view closes during preparation", async () => {
  vi.spyOn(crypto.subtle, "digest").mockImplementation(
    () => new Promise(() => {}),
  );
  const activity = vi.fn();
  const view = render(
    <ImproveSkills
      draft={blankDraft()}
      change={vi.fn()}
      ready={true}
      saveFailed={false}
      snapshot={{ id: "saved", revision: 1 }}
      request={vi.fn()}
      commit={async () => false}
      undo={async () => false}
      canUndo={false}
      onActivityChange={activity}
    />,
  );
  fireEvent.click(
    screen.getByRole("button", {
      name: /Îmbunătățește competențele|Improve skills/,
    }),
  );
  expect(activity).toHaveBeenLastCalledWith(true);
  view.unmount();
  expect(activity).toHaveBeenLastCalledWith(false);
});

it("bounds initial click intent preparation under StrictMode", async () => {
  vi.spyOn(crypto.subtle, "digest").mockImplementation(
    () => new Promise(() => {}),
  );
  vi.useFakeTimers();
  const activity = vi.fn();
  render(
    <StrictMode>
      <ImproveSkills
        draft={blankDraft()}
        change={vi.fn()}
        ready={true}
        saveFailed={false}
        snapshot={{ id: "saved", revision: 1 }}
        request={vi.fn()}
        commit={async () => false}
        undo={async () => false}
        canUndo={false}
        startRequested={true}
        onActivityChange={activity}
      />
    </StrictMode>,
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(90000);
  });
  expect(activity).toHaveBeenLastCalledWith(false);
});

it("discards an expired restored request before attempting recovery", async () => {
  const d = blankDraft();
  d.skillReview = {
    operationId: "expired",
    snapshotId: "saved",
    revision: 1,
    fingerprint: await skillReviewFingerprint(d),
    expiresAt: Date.now() - 1,
  };
  const request = vi.fn();
  const h = setup(d, request);
  await waitFor(() => expect(h.latest().skillReview).toBeUndefined());
  expect(request).not.toHaveBeenCalled();
});
it("recovers an unexpired receipt under StrictMode using the real abort-aware transport", async () => {
  const d = blankDraft();
  d.skillReview = {
    operationId: "recover",
    snapshotId: "saved",
    revision: 1,
    fingerprint: await skillReviewFingerprint(d),
    expiresAt: Date.now() + 90000,
  };
  const result = {
    schemaVersion: "skills-improvement/1",
    fingerprint: d.skillReview.fingerprint,
    inventory: getSkillInventory(d),
    removed: [],
  };
  const transport = vi.fn(async () =>
    Response.json({
      kind: "rewrite",
      input: { ...d.skillReview, targetId: d.id, skillsImprovement: true },
      state: "ready",
      result,
    }),
  );
  const h = setup(d, httpIntelligence(transport).improveSkills);
  await waitFor(() => expect(h.commit).toHaveBeenCalledTimes(1));
  expect(transport).toHaveBeenCalledTimes(1);
});
it("keeps edits and skips an outdated result without an automatic second request", async () => {
  const d = blankDraft();
  d.technicalSkills = [fact("SQL")];
  let finish!: (v: any) => void;
  let context: any;
  const request = vi.fn((c: any) => {
    context = c;
    return new Promise((r) => (finish = r));
  });
  const h = setup(d, request);
  await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  const changed = clone(h.latest());
  changed.technicalSkills[0].value = "My SQL edit";
  h.edit(changed);
  await act(async () =>
    finish({
      schemaVersion: "skills-improvement/1",
      fingerprint: context.fingerprint,
      inventory: getSkillInventory(d),
      removed: [],
    }),
  );
  await waitFor(() =>
    expect(screen.getByRole("alert").textContent).toContain("outdated result"),
  );
  expect(h.commit).not.toHaveBeenCalled();
  expect(h.latest().technicalSkills[0].value).toBe("My SQL edit");
  expect(h.latest().skillReview).toBeUndefined();
  expect(request).toHaveBeenCalledTimes(1);
});
it("a persisted request recovers read-only; uncertain failures retain identity for checking again", async () => {
  const d = blankDraft();
  d.skillReview = {
    operationId: "existing",
    snapshotId: "saved",
    revision: 1,
    expiresAt: Date.now() + 90000,
    fingerprint: await skillReviewFingerprint(d),
  };
  const request = vi.fn(async (_context: unknown, _recover?: boolean) => {
    throw Error("AI_REQUEST_UNKNOWN");
  });
  const h = setup(d, request);
  await waitFor(() => expect(screen.getByText("Check result")).toBeTruthy());
  expect(request.mock.calls[0][1]).toBe(true);
  expect(h.latest().skillReview?.operationId).toBe("existing");
  fireEvent.click(screen.getByText("Check result"));
  await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
  expect(request.mock.calls[1][1]).toBe(true);
  expect(h.commit).not.toHaveBeenCalled();
});
it("lets the user discard a confirmed missing request and start a fresh improvement", async () => {
  const d = blankDraft();
  d.technicalSkills = [fact("SQL")];
  d.skillReview = {
    operationId: "old",
    snapshotId: "saved",
    revision: 1,
    expiresAt: Date.now() + 90000,
    fingerprint: await skillReviewFingerprint(d),
  };
  const request = vi.fn(async () => {
    throw Error("MISSING");
  });
  const h = setup(d, request);
  fireEvent.click(
    await screen.findByRole("button", { name: "Discard request" }),
  );
  expect(h.latest().skillReview).toBeUndefined();
  expect(request).toHaveBeenCalledTimes(1);
  expect(
    screen.getByRole("button", { name: "Improve skills" }),
  ).not.toHaveProperty("disabled", true);
});
it("failed or invalid output never changes the inventory", async () => {
  const d = blankDraft();
  d.technicalSkills = [fact("SQL")];
  const h = setup(d, async () => ({ schemaVersion: "broken" }));
  await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
  expect(h.commit).not.toHaveBeenCalled();
  expect(h.latest().technicalSkills).toEqual(d.technicalSkills);
  expect(h.latest().skillReview).toBeUndefined();
});
it("waits for the pending reference to be saved before recovery can resume a missing request", async () => {
  const d = blankDraft();
  d.skillReview = {
    operationId: "unsaved-reference",
    snapshotId: "saved",
    revision: 1,
    expiresAt: Date.now() + 90000,
    fingerprint: await skillReviewFingerprint(d),
  };
  const request = vi.fn(async () => {
    throw Error("AI_REQUEST_UNKNOWN");
  });
  const props = {
    draft: d,
    change: () => {},
    saveFailed: false,
    snapshot: { id: "saved", revision: 1 },
    request,
    commit: async () => false,
    undo: async () => false,
    canUndo: false,
  };
  const view = render(<ImproveSkills {...props} ready={false} />);
  await act(async () => {
    await Promise.resolve();
  });
  expect(request).not.toHaveBeenCalled();
  view.rerender(<ImproveSkills {...props} ready={true} />);
  await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
});
it("retries saving the initial review request without starting inference before it is saved", async () => {
  const retrySave = vi.fn(),
    request = vi.fn();
  // An already persisted reference normally recovers. Simulate the first click
  // instead, with a save failure after the component has prepared its reference.
  function Surface() {
    const [draft, set] = useState(blankDraft());
    const [failed, failure] = useState(false);
    return (
      <ImproveSkills
        draft={draft}
        change={(next) => {
          set(next);
          failure(true);
        }}
        ready={!failed}
        saveFailed={failed}
        retrySaveAutomatically={failed}
        snapshot={{ id: "saved", revision: 1 }}
        request={request}
        commit={async () => false}
        undo={async () => false}
        canUndo={false}
        retrySave={retrySave}
      />
    );
  }
  const digest = vi
    .spyOn(crypto.subtle, "digest")
    .mockResolvedValue(new ArrayBuffer(32));
  vi.useFakeTimers();
  try {
    render(<Surface />);
    fireEvent.click(
      screen.getByRole("button", {
        name: /Îmbunătățește competențele|Improve skills/,
      }),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(750);
    });
    expect(retrySave).toHaveBeenCalledTimes(1);
    expect(request).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(retrySave).toHaveBeenCalledTimes(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(retrySave).toHaveBeenCalledTimes(2);
  } finally {
    digest.mockRestore();
    vi.useRealTimers();
  }
});

it("keeps uncertain requests locked and does not offer discard or undo while the provider may still be working", async () => {
  const d = blankDraft();
  d.skillReview = {
    operationId: "pending",
    snapshotId: "saved",
    revision: 1,
    expiresAt: Date.now() + 90000,
    fingerprint: await skillReviewFingerprint(d),
  };
  const activity = vi.fn(),
    undo = vi.fn();
  render(
    <LanguageContext.Provider value="en">
      <ImproveSkills
        draft={d}
        change={() => {}}
        ready={true}
        saveFailed={false}
        snapshot={{ id: "saved", revision: 1 }}
        request={async () => {
          throw Error("AI_REQUEST_UNKNOWN");
        }}
        commit={async () => false}
        undo={undo}
        canUndo={true}
        onActivityChange={activity}
      />
    </LanguageContext.Provider>,
  );
  await screen.findByRole("button", { name: "Check result" });
  expect(screen.queryByRole("button", { name: "Discard request" })).toBeNull();
  const button = screen.getByRole("button", { name: "Undo improvement" });
  expect(button).toHaveProperty("disabled", true);
  fireEvent.click(button);
  expect(undo).not.toHaveBeenCalled();
  expect(activity).toHaveBeenLastCalledWith(true);
});

it("releases a definitively rejected receipt save without starting inference", async () => {
  const activity = vi.fn(),
    request = vi.fn();
  let latest = blankDraft();
  function Harness() {
    const [draft, setDraft] = useState(latest);
    const [failed, setFailed] = useState(false);
    latest = draft;
    return (
      <ImproveSkills
        draft={draft}
        change={(next) => {
          setDraft(next);
          setFailed(true);
        }}
        ready={!failed}
        saveFailed={failed}
        snapshot={{ id: "saved", revision: 1 }}
        request={request}
        commit={async () => false}
        undo={async () => false}
        canUndo={false}
        onActivityChange={activity}
      />
    );
  }
  render(<Harness />);
  fireEvent.click(
    screen.getByRole("button", {
      name: /Îmbunătățește competențele|Improve skills/,
    }),
  );
  await waitFor(() => expect(activity).toHaveBeenLastCalledWith(false));
  expect(latest.skillReview).toBeUndefined();
  expect(request).not.toHaveBeenCalled();
});

it("does not lock out prerequisite language setup before the flow is ready", async () => {
  const activity = vi.fn();
  render(
    <ImproveSkills
      draft={blankDraft()}
      change={() => {}}
      ready={false}
      saveFailed={false}
      snapshot={{ id: "saved", revision: 1 }}
      request={vi.fn()}
      commit={async () => false}
      undo={async () => false}
      canUndo={false}
      onActivityChange={activity}
    />,
  );
  await waitFor(() => expect(activity).toHaveBeenLastCalledWith(false));
});

it("opening or refreshing the skills screen does not prepare a new request", async () => {
  const change = vi.fn(),
    request = vi.fn(),
    activity = vi.fn();
  const props = {
    draft: blankDraft(),
    ready: true,
    saveFailed: false,
    snapshot: { id: "saved", revision: 1 },
    change,
    request,
    commit: async () => false,
    undo: async () => false,
    canUndo: false,
    onActivityChange: activity,
  };
  let view = render(<ImproveSkills {...props} />);
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));
  });
  expect(change).not.toHaveBeenCalled();
  expect(request).not.toHaveBeenCalled();
  expect(activity).toHaveBeenLastCalledWith(false);
  view.unmount();
  view = render(<ImproveSkills {...props} />);
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));
  });
  expect(change).not.toHaveBeenCalled();
  expect(request).not.toHaveBeenCalled();
});
