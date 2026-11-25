import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("./supabase.ts", () => ({ supabase: { auth } }));

import { watchRedMessages } from "./report-error.ts";

let fetchMock: ReturnType<typeof vi.fn>;
let stop: () => void;

beforeEach(() => {
  auth.getSession.mockResolvedValue({ data: { session: { access_token: "t" } }, error: null });
  fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetchMock);
  stop = watchRedMessages(document.body);
});
afterEach(() => {
  stop();
  document.body.innerHTML = "";
});

const sent = () => fetchMock.mock.calls.map(([, init]) => JSON.parse((init as RequestInit).body as string) as { kind: string; message: string });

describe("watchRedMessages", () => {
  it("records each red message as it appears, but not a field's own check or a plain notice", async () => {
    document.body.innerHTML = `<div><p role="alert" class="ui-notice ui-notice--bad">Some changes could not be prepared.</p></div>`;
    const more = document.createElement("div");
    more.innerHTML = `<span role="alert" class="ui-field-error">Too long</span><p role="alert" class="ui-notice">Still working…</p><p role="alert">Couldn't load your CV.</p>`;
    document.body.append(more);
    await vi.waitFor(() => expect(sent()).toHaveLength(2));
    expect(sent().map((b) => [b.kind, b.message])).toEqual([
      ["message", "Some changes could not be prepared."],
      ["message", "Couldn't load your CV."],
    ]);
  });

  it("sends nothing when signed out", async () => {
    auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    document.body.innerHTML = `<p role="alert">Couldn't load your CV.</p>`;
    await new Promise((r) => setTimeout(r, 0));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
