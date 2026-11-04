import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ExtensionConnection, ExtensionPage, storeLink } from "./ExtensionPage";
afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
  vi.unstubAllGlobals();
});
describe("extension distribution and authorization", () => {
  it("offers an actual developer download and truthful unpublished Store state", () => {
    render(<ExtensionPage storeUrl="" />);
    expect(
      screen
        .getByRole("link", { name: /Download developer ZIP/ })
        .getAttribute("href"),
    ).toBe("/downloads/resumora-extension.zip");
    expect(
      screen.getByText(/Store installation is not published/),
    ).toBeTruthy();
    expect(
      screen.queryByRole("link", { name: /Install from Chrome Web Store/ }),
    ).toBeNull();
    expect(screen.getByText(/live site compatibility unverified/)).toBeTruthy();
  });
  it("only accepts a real-shaped public Chrome Store listing URL", () => {
    for (const bad of [
      "https://example.invalid/detail/" + "a".repeat(32),
      "javascript:alert(1)",
      "https://chromewebstore.google.com@evil.invalid/detail/" + "a".repeat(32),
      "https://chromewebstore.google.com/detail/pending",
      "https://chromewebstore.google.com/detail/" +
        "a".repeat(32) +
        "?token=secret",
    ])
      expect(storeLink(bad)).toBeNull();
    const url =
      "https://chromewebstore.google.com/detail/resumora/" + "a".repeat(32);
    render(<ExtensionPage storeUrl={url} />);
    expect(
      screen
        .getByRole("link", { name: /Install from Chrome Web Store/ })
        .getAttribute("href"),
    ).toBe(url);
  });
  it("invalid or duplicate pairing arguments cannot authorize", () => {
    window.history.replaceState(
      null,
      "",
      "/extension/connect?extensionId=bad&state=one&state=two",
    );
    const transport = vi.fn();
    render(
      <ExtensionConnection
        account={{ id: "a", email: "account@example.invalid" }}
        transport={transport}
      />,
    );
    expect(screen.getByRole("alert").textContent).toContain("Invalid pairing");
    expect(screen.queryByRole("button", { name: /Allow capture/ })).toBeNull();
    expect(transport).not.toHaveBeenCalled();
  });
  const pairing = {
    extensionId: "a".repeat(32),
    deviceId: "11111111-1111-4111-8111-111111111111",
    challenge: "A".repeat(43),
    state: "B".repeat(43),
  };
  function openPairing() {
    window.history.replaceState(
      null,
      "",
      "/extension/connect?" + new URLSearchParams(pairing),
    );
  }
  it("connects an already signed-in account once after the installed extension verifies the click", async () => {
    openPairing();
    const sendMessage = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal("chrome", { runtime: { sendMessage } });
    let finish!: (response: Response) => void;
    const transport = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    render(
      <StrictMode>
        <ExtensionConnection
          account={{ id: "a", email: "account@example.invalid" }}
          transport={transport}
        />
      </StrictMode>,
    );
    await waitFor(() => expect(transport).toHaveBeenCalledTimes(1));
    expect(sendMessage).toHaveBeenCalledWith(pairing.extensionId, {
      type: "verify-connection",
      ...pairing,
    });
    expect(transport).toHaveBeenCalledWith("/v1/extension/authorize", {
      method: "POST",
      body: JSON.stringify(pairing),
    });
    expect(screen.getByRole("status").textContent).toContain("Connecting");
    expect(
      screen.queryByText(/jobs:capture|permission|device|Allow capture-only/),
    ).toBeNull();
    finish(
      Response.json(
        { error: { code: "CAPTURE_UNAVAILABLE" } },
        { status: 503 },
      ),
    );
    expect((await screen.findByRole("alert")).textContent).toContain(
      "temporarily unavailable",
    );
    expect(screen.getByRole("button", { name: /Try again/ })).toBeTruthy();
  });
  it("never connects a forged or expired link without a matching extension request", async () => {
    openPairing();
    vi.stubGlobal("chrome", {
      runtime: { sendMessage: vi.fn(async () => ({ ok: false })) },
    });
    const transport = vi.fn();
    render(
      <ExtensionConnection
        account={{ id: "a", email: "account@example.invalid" }}
        transport={transport}
      />,
    );
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Connect account",
    );
    expect(transport).not.toHaveBeenCalled();
  });
  it("does not authorize after the user leaves while extension verification is pending", async () => {
    openPairing();
    let verify!: (proof: { ok: boolean }) => void;
    vi.stubGlobal("chrome", {
      runtime: {
        sendMessage: () =>
          new Promise((resolve) => {
            verify = resolve;
          }),
      },
    });
    const transport = vi.fn(async () => Response.json({}, { status: 503 }));
    const view = render(
      <ExtensionConnection
        account={{ id: "a", email: "a@example.invalid" }}
        transport={transport}
      />,
    );
    view.unmount();
    await act(async () => {
      verify({ ok: true });
    });
    expect(transport).not.toHaveBeenCalled();
  });
  it("a replacement account cannot dispatch the previous account's delayed connection", async () => {
    openPairing();
    let verify!: (proof: { ok: boolean }) => void;
    const sendMessage = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            verify = resolve;
          }),
      )
      .mockResolvedValue({ ok: true });
    vi.stubGlobal("chrome", { runtime: { sendMessage } });
    const oldTransport = vi.fn(async () => Response.json({}, { status: 503 }));
    const nextTransport = vi.fn(async () => Response.json({}, { status: 503 }));
    const view = render(
      <ExtensionConnection
        account={{ id: "a", email: "a@example.invalid" }}
        transport={oldTransport}
      />,
    );
    view.rerender(
      <ExtensionConnection
        account={{ id: "b", email: "b@example.invalid" }}
        transport={nextTransport}
      />,
    );
    await waitFor(() => expect(nextTransport).toHaveBeenCalledTimes(1));
    await act(async () => {
      verify({ ok: true });
    });
    expect(oldTransport).not.toHaveBeenCalled();
  });
  it("rejects a server callback for another destination or connection", async () => {
    for (const redirect of [
      "https://evil.invalid/capture",
      `https://${pairing.extensionId}.chromiumapp.org/capture?state=wrong&code=${"c".repeat(64)}`,
    ]) {
      openPairing();
      vi.stubGlobal("chrome", {
        runtime: { sendMessage: vi.fn(async () => ({ ok: true })) },
      });
      const view = render(
        <ExtensionConnection
          account={{ id: "a", email: "a@example.invalid" }}
          transport={async () => Response.json({ redirect })}
        />,
      );
      expect((await screen.findByRole("alert")).textContent).toContain(
        "verify the connection",
      );
      view.unmount();
    }
  });
  it("gives an update instruction when an older extension cannot verify the connection", async () => {
    openPairing();
    const transport = vi.fn();
    render(
      <ExtensionConnection
        account={{ id: "a", email: "account@example.invalid" }}
        transport={transport}
      />,
    );
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Update the extension",
    );
    expect(transport).not.toHaveBeenCalled();
  });
  it("revocation uses the account-fenced existing transport with no supplied user authority", async () => {
    window.history.replaceState(null, "", "/extension/manage");
    const transport = vi.fn(async () => Response.json({ revoked: true }));
    render(
      <ExtensionConnection
        account={{ id: "a", email: "account@example.invalid" }}
        transport={transport}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /Revoke all/ }));
    expect(transport).toHaveBeenCalledWith("/v1/extension/revoke", {
      method: "POST",
      body: "{}",
    });
    expect((await screen.findByRole("status")).textContent).toContain(
      "All capture connections revoked",
    );
  });
});
