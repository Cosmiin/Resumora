import { LanguageContext } from "../components/ui";
import { useState } from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { LanguageVersions } from "./LanguageVersions";
import { languageClient } from "./client";
import { maraReviewDraft } from "../base/fixture";
import { translationItems } from "@resumora/contracts/editor/languages";
import type {
  DocumentLanguageContext,
  LanguageProposal,
} from "@resumora/contracts/editor/language-transport";
afterEach(() => sessionStorage.clear());
async function fixture() {
  const draft = maraReviewDraft(),
    items = await translationItems(draft),
    context: DocumentLanguageContext = {
      source: {
        draft,
        items,
        locale: "ro-RO",
        accepted: true,
        pin: {
          kind: "base",
          documentId: draft.id,
          currentId: crypto.randomUUID(),
          revision: 1,
          fingerprint: "a".repeat(64),
        },
      },
      versions: [],
    };
  const id = crypto.randomUUID();
  const proposal: LanguageProposal = {
    id,
    state: "processing",
    step: 0,
    reviewRevision: 0,
    review: null,
    accepted: null,
    output: null,
    request: {
      source: context.source!.pin,
      sourceLocale: "ro-RO",
      targetLocale: "en-GB",
      targetRevision: 0,
      targetDocumentId: null,
      variantId: "lang_" + "b".repeat(64),
      sectionIds: [],
      glossary: [],
    },
  };
  return { context, proposal };
}
it.each([
  {},
  { versions: [null], source: null },
  {
    versions: [],
    source: {
      draft: "malformed",
      items: [],
      pin: {},
      locale: "ro-RO",
      accepted: true,
    },
  },
])(
  "rejects malformed successful language-context data without using it",
  async (value) => {
    await expect(
      languageClient(async () => Response.json(value)).context(),
    ).rejects.toThrow("languageUnavailable");
  },
);
it("a checkpoint/context refresh does not cancel the explicit translation it prepares", async () => {
  const f = await fixture(),
    calls: { path: string; aborted?: boolean }[] = [];
  f.context.source!.accepted = false;
  const transport = vi.fn(async (path: string, init?: RequestInit) => {
    calls.push({ path, aborted: init?.signal?.aborted });
    if (path.split("?")[0] === "/v1/document-languages")
      return Response.json(f.context);
    if (path === "/v1/document-languages/proposals")
      return Response.json(f.proposal);
    return Response.json(f.proposal);
  });
  function Surface() {
    const [revision, setRevision] = useState("initial");
    return (
      <LanguageVersions
        transport={transport}
        currentLocale="ro-RO"
        ready
        revisionKey={revision}
        ensureReady={async () => {
          f.context.source!.accepted = true;
          f.context.source!.pin.currentId = crypto.randomUUID();
          setRevision("checkpoint");
        }}
        open={() => {}}
      />
    );
  }
  render(<Surface />);
  await waitFor(() => expect(transport).toHaveBeenCalled());
  fireEvent.change(screen.getByRole("combobox"), {
    target: { value: "en-GB" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Tradu CV-ul" }));
  await screen.findByRole("button", { name: "Reia traducerea salvată" });
  expect(
    calls.find((c) => c.path === "/v1/document-languages/proposals"),
  ).toMatchObject({ aborted: false });
  expect(
    transport.mock.calls.filter(
      ([path, init]) =>
        path === "/v1/document-languages/proposals" && init?.method === "POST",
    ),
  ).toHaveLength(1);
});
it("refresh recovers the owned translation receipt with reads and never starts a replacement generation", async () => {
  const f = await fixture();
  sessionStorage.setItem(
    `resumora:translation:profile:${f.context.source!.pin.currentId}:ro-RO`,
    f.proposal.id,
  );
  const transport = vi.fn(async (path: string) =>
    Response.json(
      path.split("?")[0] === "/v1/document-languages" ? f.context : f.proposal,
    ),
  );
  render(
    <LanguageVersions
      transport={transport}
      currentLocale="ro-RO"
      ready
      revisionKey="same"
      open={() => {}}
    />,
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "Reia traducerea salvată" }),
  );
  await waitFor(() =>
    expect(
      transport.mock.calls.filter(([path]) => path.includes("/proposals/")),
    ).toHaveLength(2),
  );
  expect(
    transport.mock.calls.some(
      ([path]) => path === "/v1/document-languages/proposals",
    ),
  ).toBe(false);
  expect(Object.values(sessionStorage)).toEqual([f.proposal.id]);
});
it("offers multilingual explicit translation targets including French and Arabic", async () => {
  const f = await fixture();
  render(
    <LanguageContext value="en">
      <LanguageVersions
        transport={async () => Response.json(f.context)}
        currentLocale="ro-RO"
        ready
        revisionKey="test"
        open={() => {}}
      />
    </LanguageContext>,
  );
  expect(
    screen.getByRole("option", { name: /French|français|Français/i }),
  ).toBeTruthy();
  expect(screen.getByRole("option", { name: /Arabic|العربية/i })).toBeTruthy();
});
