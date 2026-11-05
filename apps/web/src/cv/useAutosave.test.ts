import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { emptyCv, type CvContent, type CvResponse } from "@resumora/shared";
import { ApiClientError } from "../lib/api-error.ts";
import { useAutosave } from "./useAutosave.ts";

const named = (fullName: string): CvContent => ({ ...emptyCv(), basics: { ...emptyCv().basics, fullName } });
const initial: CvResponse = { content: named(""), version: 1, updatedAt: "2026-11-04T10:00:00Z" };
const saved = (version: number) => ({ version, updatedAt: "2026-11-04T10:01:00Z" });
const conflictError = (version: number) =>
  new ApiClientError(409, "version_conflict", "Saved elsewhere", {
    current: { version, updatedAt: "2026-11-04T10:02:00Z" },
  });

function setup(save: Mock<Save>, load: Mock<Load> = vi.fn<Load>()) {
  return renderHook(() => useAutosave({ initial, save, load }));
}

type Save = (content: CvContent, version: number) => Promise<{ version: number; updatedAt: string }>;
type Load = () => Promise<CvResponse>;

const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("useAutosave", () => {
  it("saves once after typing stops", async () => {
    const save = vi.fn<Save>().mockResolvedValue(saved(2));
    const { result } = setup(save);
    for (const name of ["A", "An", "Ana", "Ana ", "Ana P"]) {
      act(() => result.current.setContent(named(name)));
      await advance(200);
    }
    expect(save).not.toHaveBeenCalled();
    expect(result.current.status).toBe("dirty");
    await advance(1000);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(named("Ana P"), 1);
    expect(result.current.status).toBe("saved");
  });

  it("setContent accepts an updater that sees the latest content", async () => {
    const save = vi.fn<Save>().mockResolvedValue(saved(2));
    const { result } = setup(save);
    act(() => {
      result.current.setContent((c) => ({ ...c, basics: { ...c.basics, fullName: c.basics.fullName + "A" } }));
      result.current.setContent((c) => ({ ...c, basics: { ...c.basics, fullName: c.basics.fullName + "B" } }));
    });
    expect(result.current.content.basics.fullName).toBe("AB");
    await advance(1000);
    expect(save).toHaveBeenCalledWith(named("AB"), 1);
  });

  it("an updater that changes nothing does not start a save", async () => {
    const save = vi.fn<Save>().mockResolvedValue(saved(2));
    const { result } = setup(save);
    act(() => result.current.setContent((c) => c));
    expect(result.current.status).toBe("saved");
    await advance(2000);
    expect(save).not.toHaveBeenCalled();
  });

  it("setContent keeps the same identity across renders", () => {
    const { result, rerender } = setup(vi.fn<Save>());
    const first = result.current.setContent;
    act(() => result.current.setContent(named("x")));
    rerender();
    expect(result.current.setContent).toBe(first);
  });

  it("serializes saves", async () => {
    let finishFirst!: (v: ReturnType<typeof saved>) => void;
    const save = vi.fn<Save>()
      .mockImplementationOnce(() => new Promise((resolve) => (finishFirst = resolve)))
      .mockResolvedValue(saved(3));
    const { result } = setup(save);

    act(() => result.current.setContent(named("A")));
    await advance(1000);
    expect(save).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe("saving");

    act(() => result.current.setContent(named("B")));
    await advance(1000);
    expect(save).toHaveBeenCalledTimes(1); // never two saves in flight

    await act(async () => finishFirst(saved(2)));
    await advance(0);
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith(named("B"), 2); // uses the version the first save returned
    expect(result.current.status).toBe("saved");
  });

  it("conflict pauses autosave until the user chooses", async () => {
    const save = vi.fn<Save>().mockRejectedValueOnce(conflictError(5)).mockResolvedValue(saved(6));
    const { result } = setup(save);

    act(() => result.current.setContent(named("Mine")));
    await advance(1000);
    expect(result.current.status).toBe("conflict");
    expect(result.current.conflict?.version).toBe(5);

    act(() => result.current.setContent(named("Mine, edited")));
    await advance(5000);
    expect(save).toHaveBeenCalledTimes(1);

    await act(() => result.current.keepMine());
    expect(save).toHaveBeenLastCalledWith(named("Mine, edited"), 5);
    expect(result.current.status).toBe("saved");
    expect(result.current.conflict).toBeNull();
  });

  it("load latest replaces local content", async () => {
    const save = vi.fn<Save>().mockRejectedValueOnce(conflictError(5)).mockResolvedValue(saved(6));
    const load = vi.fn<Load>().mockResolvedValue({ content: named("From other tab"), version: 5, updatedAt: "t" });
    const { result } = setup(save, load);

    act(() => result.current.setContent(named("Mine")));
    await advance(1000);
    await act(() => result.current.loadLatest());
    expect(result.current.content.basics.fullName).toBe("From other tab");
    expect(result.current.status).toBe("saved");

    act(() => result.current.setContent(named("Next edit")));
    await advance(1000);
    expect(save).toHaveBeenLastCalledWith(named("Next edit"), 5);
  });

  it("retries after a failed save", async () => {
    const save = vi.fn<Save>()
      .mockRejectedValueOnce(new ApiClientError(0, "network", "offline"))
      .mockResolvedValue(saved(2));
    const { result } = setup(save);

    act(() => result.current.setContent(named("A")));
    await advance(1000);
    expect(result.current.status).toBe("error");
    await advance(5000);
    expect(save).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe("saved");
  });

  it("shows content the server rejects once, without retrying", async () => {
    const save = vi
      .fn<Save>()
      .mockRejectedValueOnce(new ApiClientError(413, "content_too_large", "This CV is too large to save (limit 256 KB)."))
      .mockResolvedValue(saved(2));
    const { result } = setup(save);

    act(() => result.current.setContent(named("Huge")));
    await advance(1000);
    expect(result.current.status).toBe("invalid");
    expect(result.current.problem).toBe("This CV is too large to save (limit 256 KB).");
    await advance(30_000);
    expect(save).toHaveBeenCalledTimes(1);

    act(() => result.current.setContent(named("Smaller"))); // the user fixes it
    await advance(1000);
    expect(save).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe("saved");
    expect(result.current.problem).toBeNull();
  });

  it("checks content before sending it", async () => {
    const save = vi.fn<Save>().mockResolvedValue(saved(2));
    const { result } = setup(save);
    const tooLong = { ...named("A"), basics: { ...named("A").basics, summary: "x".repeat(4001) } };

    act(() => result.current.setContent(tooLong));
    await advance(1000);
    expect(save).not.toHaveBeenCalled();
    expect(result.current.status).toBe("invalid");
    expect(result.current.problem).toContain("summary");
  });

  it("warns before unload when dirty", async () => {
    const save = vi.fn<Save>().mockResolvedValue(saved(2));
    const { result } = setup(save);
    const unload = () => {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };

    expect(unload()).toBe(false);
    act(() => result.current.setContent(named("A")));
    expect(unload()).toBe(true);
    await advance(1000);
    expect(result.current.status).toBe("saved");
    expect(unload()).toBe(false);
  });
});
