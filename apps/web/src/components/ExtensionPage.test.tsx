import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ExtensionConnection, ExtensionPage, storeLink } from "./ExtensionPage";
afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
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
