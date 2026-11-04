import {
  act,
  renderHook,
  waitFor,
  render,
  screen,
  fireEvent,
} from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import { blankDraft, type BaseDraft } from "../base/model";
import type { ContentLanguageDecision } from "@resumora/contracts/editor/content-language";
import { useContentLanguage } from "./useContentLanguage";
import { ContentLanguageControl } from "./ContentLanguageControl";
import { LanguageContext } from "./ui";
beforeEach(() =>
  Object.defineProperty(crypto, "subtle", {
    configurable: true,
    value: webcrypto.subtle,
  }),
);
const prose =
  "Je dirige une équipe de spécialistes et je développe des solutions pour améliorer la qualité du service et les résultats des clients. ".repeat(
    2,
  );
const decision = (
  confidence: "high" | "medium" | "low" = "high",
): ContentLanguageDecision => ({
  locale: "fr",
  confidence,
  source: "narrative",
  policyVersion: "cv-language/1",
});
function fixture() {
  const d = blankDraft();
  d.summary.text = prose;
  return d;
}
function setup(request: any, initial = fixture()) {
  const change = vi.fn();
  const props = {
    draft: initial as BaseDraft | null,
    saved: { id: "saved", revision: 1, draft: initial },
    enabled: true,
    scope: {},
    change,
    request,
  };
  const h = renderHook((p) => useContentLanguage(p), { initialProps: props });
  return { ...h, props, change };
}
it("detects saved manual prose once and ignores interface-only rerenders", async () => {
  const h = setup(async () => decision());
  await waitFor(() => expect(h.change).toHaveBeenCalledTimes(1));
  expect(h.change.mock.calls[0][0].contentLanguage.locale).toBe("fr");
  h.rerender({ ...h.props });
  await act(async () => {});
  expect(h.change).toHaveBeenCalledTimes(1);
});
it("does not request empty or unsaved content", async () => {
  const request = vi.fn(async () => decision()),
    h = setup(request, blankDraft());
  await act(async () => {});
  expect(request).not.toHaveBeenCalled();
  h.rerender({ ...h.props, draft: fixture() });
  await act(async () => {});
  expect(request).not.toHaveBeenCalled();
});
it("discards delayed detection after changed text, correction, deletion or account", async () => {
  for (const kind of ["text", "correction", "deletion", "account"]) {
    let resolve!: (v: ContentLanguageDecision) => void;
    const request = vi.fn(
        () => new Promise<ContentLanguageDecision>((r) => (resolve = r)),
      ),
      h = setup(request);
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    const d = {
      ...h.props.draft!,
      summary: { ...h.props.draft!.summary, text: prose + " Autre texte." },
    };
    if (kind === "correction")
      d.contentLanguage = { ...decision(), source: "user-correction" };
    h.rerender({
      ...h.props,
      draft: kind === "deletion" ? null : d,
      scope: kind === "account" ? {} : h.props.scope,
    });
    await act(async () => resolve(decision()));
    expect(h.change).not.toHaveBeenCalled();
    h.unmount();
  }
});
it("keeps insufficient provisional until narrative changes, then checks again", async () => {
  const request = vi.fn(async () => ({
      ...decision("low"),
      status: "insufficient" as const,
    })),
    h = setup(request);
  await waitFor(() => expect(h.change).toHaveBeenCalledTimes(1));
  const d = h.change.mock.calls[0][0];
  h.rerender({
    ...h.props,
    draft: d,
    saved: { ...h.props.saved, draft: d, revision: 2 },
  });
  await act(async () => {});
  expect(request).toHaveBeenCalledTimes(1);
  const next = {
    ...d,
    summary: {
      ...d.summary,
      text: prose + " Une nouvelle description de mes responsabilités.",
    },
  };
  h.rerender({
    ...h.props,
    draft: next,
    saved: { ...h.props.saved, draft: next, revision: 3 },
  });
  await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
});
it("recovers an uncertain availability outcome with the same operation id", async () => {
  const request = vi
    .fn()
    .mockRejectedValueOnce(Error("AI_REQUEST_UNKNOWN"))
    .mockResolvedValue(decision());
  const h = setup(request);
  await waitFor(() => expect(h.result.current.error).toBeTruthy());
  const id = request.mock.calls[0][0].operationId;
  act(() => h.result.current.retry());
  await waitFor(() => expect(h.change).toHaveBeenCalledTimes(1));
  expect(request.mock.calls[1][0].operationId).toBe(id);
  expect(request.mock.calls[1][1]).toBe(true);
});
it.each(["low", "medium", "high"] as const)(
  "only %s confidence eligible control can correct while interface remains English",
  (confidence) => {
    const draft = { ...fixture(), contentLanguage: decision(confidence) },
      change = vi.fn();
    render(
      <LanguageContext value="en">
        <ContentLanguageControl draft={draft} change={change} />
      </LanguageContext>,
    );
    if (confidence === "high")
      expect(
        screen.queryByRole("button", { name: "Correct language" }),
      ).toBeNull();
    else {
      fireEvent.click(screen.getByRole("button", { name: "Correct language" }));
      fireEvent.change(screen.getByLabelText("Correct CV language"), {
        target: { value: "ar" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Save language" }));
      expect(change.mock.calls[0][0].contentLanguage.source).toBe(
        "user-correction",
      );
      expect(change.mock.calls[0][0].summary.text).toBe(prose);
    }
  },
);

it("allows only three explicit new attempts following confirmed terminal unavailable outcomes", async () => {
  const request = vi.fn(async () => ({
      ...decision(),
      status: "unavailable" as const,
    })),
    h = setup(request);
  for (let attempt = 0; attempt < 4; attempt++) {
    await waitFor(() => expect(request).toHaveBeenCalledTimes(attempt + 1));
    await waitFor(() => expect(h.result.current.error).toBeTruthy());
    if (attempt < 3) act(() => h.result.current.retry());
  }
  expect(
    new Set(
      request.mock.calls.map((c) => (c as unknown as [any])[0].operationId),
    ).size,
  ).toBe(4);
  expect(h.result.current.canRetry).toBe(false);
  act(() => h.result.current.retry());
  expect(request).toHaveBeenCalledTimes(4);
});
it("keeps fresh generation gated until the detected language is part of the draft", async () => {
  let resolve!: (d: ContentLanguageDecision) => void;
  const h = setup(() => new Promise((r) => (resolve = r)));
  expect(h.result.current.ready).toBe(false);
  await waitFor(() => expect(resolve).toBeTruthy());
  await act(async () => resolve(decision()));
  const d = h.change.mock.calls[0][0];
  h.rerender({ ...h.props, draft: d, saved: { ...h.props.saved, draft: d } });
  // Missing French label resources still need localization before fresh generation.
  expect(h.result.current.ready).toBe(false);
});

it("allows a low-confidence unavailable decision to be corrected without changing accepted prose", () => {
  const draft = {
      ...fixture(),
      contentLanguage: { ...decision("low"), status: "unavailable" as const },
    },
    change = vi.fn();
  render(
    <LanguageContext value="en">
      <ContentLanguageControl draft={draft} change={change} />
    </LanguageContext>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Correct language" }));
  fireEvent.change(screen.getByLabelText("Correct CV language"), {
    target: { value: "ro" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save language" }));
  expect(change.mock.calls[0][0].contentLanguage.locale).toBe("ro");
  expect(change.mock.calls[0][0].summary.text).toBe(prose);
});
it("does not automatically replay a persisted unavailable decision on reopen", async () => {
  const request = vi.fn(async () => decision()),
    d = fixture();
  d.contentLanguage = { ...decision("low"), status: "unavailable" };
  const h = setup(request, d);
  await waitFor(() =>
    expect(h.result.current.error).toBe("CONTENT_LANGUAGE_UNAVAILABLE"),
  );
  expect(request).not.toHaveBeenCalled();
  act(() => h.result.current.retry());
  await waitFor(() => expect(request).toHaveBeenCalledOnce());
});
it("recovers the same detection receipt after active to inactive to active navigation without another generation", async () => {
  let complete!: (d: ContentLanguageDecision) => void;
  const answer = { ...decision(), locale: "en" };
  const request = vi.fn((_context: any, recover = false) =>
    recover
      ? Promise.resolve(answer)
      : new Promise<ContentLanguageDecision>((resolve) => (complete = resolve)),
  );
  const h = setup(request);
  await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  const operationId = request.mock.calls[0][0].operationId;
  h.rerender({ ...h.props, enabled: false });
  await act(async () => complete(answer));
  expect(h.change).not.toHaveBeenCalled();
  expect(h.result.current.working).toBe(false);
  h.rerender({ ...h.props, enabled: true });
  await waitFor(() => expect(h.change).toHaveBeenCalledTimes(1));
  expect(request.mock.calls.map((call) => call[1])).toEqual([false, true]);
  expect(request.mock.calls[1][0].operationId).toBe(operationId);
  expect(h.result.current.working).toBe(false);
});
it("keeps unchanged substantial insufficient narrative gated until saved prose changes and detection resolves", async () => {
  const { languageNarrativeFingerprint } =
    await import("@resumora/contracts/editor/content-language");
  const d = fixture();
  d.contentLanguage = {
    ...decision("low"),
    locale: "ro",
    status: "insufficient",
    narrativeFingerprint: await languageNarrativeFingerprint(d),
  };
  const request = vi.fn(async () => ({ ...decision(), locale: "ro" })),
    h = setup(request, d);
  await waitFor(() =>
    expect(h.result.current.error).toBe("CONTENT_LANGUAGE_INSUFFICIENT"),
  );
  expect(h.result.current.ready).toBe(false);
  expect(request).not.toHaveBeenCalled();
  const next = {
    ...d,
    summary: {
      ...d.summary,
      text:
        prose +
        " Je précise ici les responsabilités personnelles et les résultats du travail.",
    },
  };
  h.rerender({
    ...h.props,
    draft: next,
    saved: { ...h.props.saved, draft: next, revision: 2 },
  });
  await waitFor(() => expect(h.change).toHaveBeenCalledTimes(1));
  const resolved = h.change.mock.calls[0][0];
  h.rerender({
    ...h.props,
    draft: resolved,
    saved: { ...h.props.saved, draft: resolved, revision: 3 },
  });
  await waitFor(() => expect(h.result.current.ready).toBe(true));
});
