import { useState } from "react";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { expect, it, vi } from "vitest";
import {
  careerBlocks,
  replaceRoleIntroduction,
} from "@resumora/contracts/editor/content";
import { careerContext } from "@resumora/contracts/intelligence/context";
import { validateRoleSummary } from "@resumora/contracts/intelligence/model";
import { decodeDraft, encodeDraft } from "@resumora/contracts/editor/transport";
import { selfContainedDocumentDraft } from "@resumora/contracts/editor/document";
import { blankDraft, newRole, fact, type BaseDraft } from "../base/model";
import { acceptWording, currentWording } from "../base/wording";
import { contributionMarkup, patchFact } from "../base/editing";
import { DocumentPreview } from "./DocumentPreview";
import { renderPrintHtml } from "../export/render";
import { cvTemplates } from "../templates/registry";
import { Enrichment } from "./Enrichment";
import { ProfileOverview } from "./ProfileOverview";
import { Editor } from "./Editor";
import { LanguageContext } from "./ui";
function fixture() {
  const d = blankDraft();
  d.language = "en";
  d.name = fact("Synthetic Owner");
  const r = newRole();
  r.title = fact("Analyst");
  r.company = fact("Synthetic Company");
  r.context = fact("Prepared weekly reports.");
  r.bullets = [
    fact("Maintained SQL reports."),
    fact("Worked with colleagues."),
  ];
  d.roles = [r];
  return d;
}
const asOf = { year: "2026", month: "10" };
it("parses real lists and paragraphs without treating HTML or hyphens inside words as markup", () => {
  expect(
    careerBlocks(
      "Role overview.\n\n- Maintained reports.\n- Worked with colleagues.\n\nAdditional context.",
    ),
  ).toEqual([
    { kind: "paragraph", text: "Role overview." },
    {
      kind: "unordered",
      items: ["Maintained reports.", "Worked with colleagues."],
    },
    { kind: "paragraph", text: "Additional context." },
  ]);
  expect(
    careerBlocks(
      "Self-driven analyst.\n\n1. First contribution\n2. Second contribution",
    )[1],
  ).toEqual({
    kind: "ordered",
    items: ["First contribution", "Second contribution"],
  });
  expect(careerBlocks("<script>bad()</script>")[0]).toEqual({
    kind: "paragraph",
    text: "<script>bad()</script>",
  });
  expect(
    replaceRoleIntroduction("Old intro.\n\n- Keep contribution.", "New intro."),
  ).toBe("New intro.\n\n- Keep contribution.");
  expect(
    replaceRoleIntroduction("- Keep contribution.", "New intro."),
  ).toContain("- Keep contribution.");
});
it.each([undefined, ...cvTemplates.map((t) => t.versionId)])(
  "renders AI list structure in %s preview, accepted independent job CV and print",
  (version) => {
    let d = fixture();
    if (version) d.presentation.templateVersionId = version;
    const r = d.roles[0],
      context = careerContext(d, r.id);
    d = acceptWording(d, r.id, {
      text: "Prepared weekly reports.\n\n- Maintained SQL reports.\n- Worked with colleagues.",
      sources: context.facts,
      scope: "experience",
      origin: "ai_generated",
    });
    for (const draft of [d, selfContainedDocumentDraft(d)]) {
      const { container, unmount } = render(
        <DocumentPreview draft={draft} asOf={asOf} documentOnly />,
      );
      expect(
        container.querySelectorAll(".document-role-wording ul > li"),
      ).toHaveLength(2);
      expect(
        container.querySelector(".document-role-wording p")?.textContent,
      ).toBe("Prepared weekly reports.");
      expect(container.querySelectorAll("p ul")).toHaveLength(0);
      const html = renderPrintHtml(
        draft,
        "body { color: black; }",
        undefined,
        asOf,
      );
      expect(html).toContain("<li>Maintained SQL reports.</li>");
      unmount();
    }
  },
);
it("starts contribution editing with the same bullets as preview and retains intentional ordered lists during live edits", () => {
  const initial = fixture(),
    r = initial.roles[0];
  expect(contributionMarkup(initial, r.id)).toContain("<ul>");
  initial.presentation.contributionHtml = {
    [r.id]: `<ol><li data-contribution="${r.bullets[0].fieldId}">Maintained SQL reports.</li><li data-contribution="${r.bullets[1].fieldId}">Worked with colleagues.</li></ol>`,
  };
  let saved: BaseDraft = initial;
  function Harness() {
    const [d, set] = useState(initial);
    return (
      <LanguageContext value="en">
        <DocumentPreview
          draft={d}
          asOf={asOf}
          onTextEdit={(id, text) => {
            const f = d.roles[0].bullets.find((f) => f.fieldId === id)!;
            saved = patchFact(d, f, text);
            set(saved);
          }}
        />
      </LanguageContext>
    );
  }
  const { container } = render(<Harness />);
  expect(
    container.querySelectorAll(".document-contributions ol > li"),
  ).toHaveLength(2);
  const input = within(
    container.querySelector(".document-contributions")!,
  ).getAllByRole("textbox")[0];
  input.textContent = "Updated SQL reports.";
  fireEvent.input(input);
  expect(saved.roles[0].bullets[0].value).toBe("Updated SQL reports.");
  expect(saved.presentation.contributionHtml?.[r.id]).toContain("<ol>");
});
it("requests role summary separately, persists the proposal, and changes no contributions before or after acceptance", async () => {
  const d = fixture(),
    r = d.roles[0];
  const rewrite = vi.fn(async () => ({
    schemaVersion: "career-role-rewrite/1" as const,
    targetId: r.id,
    text: "Prepared reports with SQL and colleagues.",
    factIds: r.bullets.map((f) => f.id),
    warnings: [],
  }));
  let saved = d;
  function Harness() {
    const [draft, change] = useState(d);
    return (
      <LanguageContext value="en">
        <Enrichment
          draft={draft}
          change={(next) => {
            saved = next;
            change(next);
          }}
          goEdit={() => {}}
          asOf={asOf}
          rewriteRole={rewrite}
          selectedTargetId={r.id}
          embedded
        />
      </LanguageContext>
    );
  }
  render(<Harness />);
  fireEvent.click(
    screen.getByText("Generate from existing information", {
      selector: "summary",
    }),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Short role introduction only" }),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Generate role summary with AI" }),
  );
  await screen.findByRole("button", { name: "Accept changes" });
  expect(rewrite).toHaveBeenCalledWith(r.id, "summary");
  expect(currentWording(saved, r.id)).toBeNull();
  expect(saved.roles[0].bullets).toEqual(r.bullets);
  expect(decodeDraft(encodeDraft(saved)).roleRewriteReviews?.[0].purpose).toBe(
    "summary",
  );
  fireEvent.click(screen.getByRole("button", { name: "Accept changes" }));
  expect(currentWording(saved, r.id)).toBe(
    "Prepared reports with SQL and colleagues.",
  );
  expect(saved.roles[0].bullets).toEqual(r.bullets);
  expect(saved.roles[0].context).toEqual(r.context);
});
it("rejects an overlong or list-shaped summary instead of silently truncating it", () => {
  const d = fixture(),
    r = d.roles[0],
    input = careerContext(d, r.id),
    p = {
      schemaVersion: "career-role-rewrite/1",
      targetId: r.id,
      text: "x".repeat(1201),
      factIds: [r.context.id],
      warnings: [],
    };
  expect(() => validateRoleSummary(p, r.id, input.facts)).toThrow();
  expect(() =>
    validateRoleSummary({ ...p, text: "- A contribution" }, r.id, input.facts),
  ).toThrow();
});
it("reviews one role at a time, distinguishes leaving a role from accepting it, without accepting skipped wording", () => {
  const d = fixture(),
    r = newRole();
  r.title = fact("Second role");
  d.roles.push(r);
  function Harness() {
    const [target, set] = useState<string>();
    return (
      <LanguageContext value="en">
        <ProfileOverview
          draft={d}
          editor={<Editor draft={d} issues={[]} change={() => {}} />}
          openEnrichment={set}
          closeEnrichment={() => set(undefined)}
          enrichTarget={target}
          enrich={(id) => <p data-testid={id}>Role questions</p>}
        />
      </LanguageContext>
    );
  }
  const { container } = render(<Harness />);
  fireEvent.click(container.querySelector("#section-experience > summary")!);
  const journey = screen.getByRole("region", {
    name: "Role-by-role improvement",
  });
  fireEvent.click(within(journey).getByRole("button", { name: "Start" }));
  expect(screen.getByTestId(d.roles[0].id)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Later · next role" }));
  expect(screen.queryByTestId(d.roles[0].id)).toBeNull();
  expect(screen.getByTestId(r.id)).toBeTruthy();
  expect(
    within(journey).getByText("0 improved · 1 left for later · 1 to review"),
  ).toBeTruthy();
});
it("accepts a short summary over approved whole-role wording while preserving its contribution list and original facts", async () => {
  let initial = fixture();
  const role = initial.roles[0],
    input = careerContext(initial, role.id);
  initial = acceptWording(initial, role.id, {
    text: "Old approved introduction.\n\n- Maintained SQL reports.\n- Worked with colleagues.",
    scope: "experience",
    origin: "ai_generated",
    sources: input.facts,
  });
  let saved = initial;
  const rewrite = vi.fn(async () => ({
    schemaVersion: "career-role-rewrite/1" as const,
    targetId: role.id,
    text: "Prepared weekly SQL reports.",
    factIds: [role.context.id, role.bullets[0].id],
    warnings: [],
  }));
  function Harness() {
    const [d, change] = useState(initial);
    return (
      <LanguageContext value="en">
        <Enrichment
          draft={d}
          change={(next) => {
            saved = next;
            change(next);
          }}
          goEdit={() => {}}
          asOf={asOf}
          rewriteRole={rewrite}
          selectedTargetId={role.id}
          embedded
        />
      </LanguageContext>
    );
  }
  render(<Harness />);
  fireEvent.click(
    screen.getByText("Generate from existing information", {
      selector: "summary",
    }),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Short role introduction only" }),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Generate role summary with AI" }),
  );
  await screen.findByRole("button", { name: "Accept changes" });
  fireEvent.click(screen.getByRole("button", { name: "Accept changes" }));
  expect(currentWording(saved, role.id)).toBe(
    "Prepared weekly SQL reports.\n\n- Maintained SQL reports.\n- Worked with colleagues.",
  );
  expect(saved.roles).toEqual(initial.roles);
  expect(saved.sources).toEqual(initial.sources);
  expect(decodeDraft(encodeDraft(saved))).toBeTruthy();
});
it("keeps unknown summary and full-rewrite request identities separate and recovers a summary without a paid retry", async () => {
  const { httpIntelligence } = await import("../base/intelligence");
  const d = fixture(),
    r = d.roles[0],
    p = {
      schemaVersion: "career-role-rewrite/1",
      targetId: r.id,
      text: "Prepared weekly reports.",
      factIds: [r.context.id],
      warnings: [],
    };
  const id = crypto.randomUUID(),
    ctx = {
      snapshotId: crypto.randomUUID(),
      revision: 1,
      targetId: r.id,
      operationId: id,
      purpose: "summary" as const,
    };
  let calls = 0;
  const transport = vi.fn(async (path: string, init?: RequestInit) => {
    if (init?.method === "POST") {
      calls++;
      if (JSON.parse(String(init.body)).purpose === "summary")
        throw Error("lost response");
      return Response.json(p);
    }
    return Response.json({
      kind: "rewrite",
      state: "ready",
      input: {
        ...ctx,
        purpose: "summary",
        contentLocale: "en",
        languagePolicyVersion: "cv-language/1",
      },
      result: p,
    });
  });
  const client = httpIntelligence(transport);
  await expect(client.rewrite(ctx)).rejects.toThrow();
  await client.rewrite({
    ...ctx,
    operationId: crypto.randomUUID(),
    purpose: undefined,
  });
  expect(calls).toBe(2);
  await expect(
    httpIntelligence(transport).rewrite({
      ...ctx,
      operationId: crypto.randomUUID(),
    }),
  ).resolves.toEqual(p);
  expect(calls).toBe(2);
});
