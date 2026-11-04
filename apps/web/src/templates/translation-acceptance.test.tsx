import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { blankDraft, fact, newRole } from "../base/model";
import { decodeDraft, encodeDraft } from "@resumora/contracts/editor/transport";
import {
  documentLabelKeys,
  documentLabels,
} from "@resumora/contracts/editor/document-labels";
import { translationItems } from "@resumora/contracts/editor/languages";
import { languageWorkflow } from "../../../api/src/languages/workflow";
import { intelligenceOperations } from "../../../api/src/intelligence/operations";
import { documentLocaleKey } from "../base/routes";
import { DocumentPreview } from "../components/DocumentContent";
import { renderPrintHtml } from "../export/render";

// The in-memory gateway retains only the saved current representation, like a reopened account.
function harness(targetLocale = "fr-CA", long = false) {
  const draft = blankDraft();
  draft.language = "en";
  draft.documentLocale = "en-GB";
  draft.summary.text = "Experienced engineering leader.";
  const role = newRole();
  role.title = fact("Director");
  role.company = fact("Organisation");
  role.context = fact("Led engineering teams.");
  draft.roles = [role];
  if (long)
    draft.technicalSkills = Array.from({ length: 120 }, (_, i) =>
      fact(`Technology ${i}`),
    );
  let source: any = {
    id: "source",
    documentId: "source-document",
    revision: 1,
    fingerprint: "a".repeat(64),
    reason: "save",
    payload: encodeDraft(draft),
  };
  let target: any = null,
    proposal: any = null,
    calls = 0,
    localizationRequests = 0,
    writes = 0;
  const labels = Object.fromEntries(
    documentLabelKeys.map((k) => [k, `${targetLocale}:${k}`]),
  );
  labels.experience =
    targetLocale === "ar" ? "الخبرة المهنية" : "Expérience professionnelle";
  const inputs: any[] = [];
  const db: any = {
    languageContext: async () => ({
      source,
      versions: [],
    }),
    loadBaseLanguage: async () => target,
    languageCommand: async (action: string, id: string, input: any) => {
      if (action === "get") return structuredClone(proposal);
      if (action === "start") {
        proposal = {
          id,
          request: input,
          state: "pending",
          step: 0,
          output: null,
          reviewRevision: 0,
          review: null,
        };
        return structuredClone(proposal);
      }
      if (action === "work") {
        if (proposal.state !== "pending") return { created: false, proposal };
        proposal.state = "processing";
        return { created: true, proposal };
      }
      if (action === "settle") {
        proposal.state = input.error
          ? "failed"
          : input.complete
            ? "ready"
            : "pending";
        proposal.output = input.output;
        proposal.step++;
        return structuredClone(proposal);
      }
      if (action === "review") {
        proposal.review = input.review;
        proposal.reviewRevision++;
        return structuredClone(proposal);
      }
      throw Error(action);
    },
    acceptLanguage: async (input: any) => {
      writes++;
      target = {
        id: "target",
        documentId: "target-document",
        revision: (target?.revision ?? 0) + 1,
        payload: input.payload,
      };
      proposal.state = "accepted";
      proposal.accepted = {
        kind: "base",
        id: target.id,
        revision: target.revision,
      };
      return proposal.accepted;
    },
  };
  const operations = intelligenceOperations(async (task) => {
    calls++;
    inputs.push(task.input);
    const input = task.input as any;
    const needsLabels = (task.schema.required as string[]).includes(
      "documentLabels",
    );
    if (needsLabels) localizationRequests++;
    const raw = {
      schemaVersion: "cv-translation/1",
      sourceLocale: input.sourceLocale,
      targetLocale: input.targetLocale,
      completion: "complete",
      items: input.items.map((i: any) => ({
        id: i.id,
        fieldId: i.fieldId,
        text: i.text,
        factIds: i.factIds,
        evidenceIds: i.evidenceIds,
      })),
      warnings: [],
      ambiguousTerms: [],
      suggestedGlossary: [],
      ...(needsLabels ? { documentLabels: labels } : {}),
    };
    // Configured runner contract: return its validated result, then validate again at the operation boundary.
    return task.validateOutput!(raw);
  });
  const flow = languageWorkflow(db, operations, "owner", "secret");
  const request: any = {
    source: {
      kind: "base",
      documentId: draft.id,
      currentId: source.id,
      revision: 1,
      fingerprint: source.fingerprint,
    },
    sourceLocale: "en-GB",
    targetLocale,
    targetRevision: 0,
    targetDocumentId: null,
    variantId: "lang_" + "b".repeat(64),
    sectionIds: [],
    glossary: [],
  };
  async function translate() {
    await flow.start("proposal", request);
    do {
      await flow.advance("proposal");
    } while (proposal.state === "pending");
    expect(proposal.state).toBe("ready");
    const { input } = await flow.inputFor(request);
    await flow.review("proposal", 0, {
      values: proposal.output.items.map((i: any) => ({
        id: i.id,
        text: i.text,
      })),
      confirmed: [...new Set(input.items.map((i) => i.sectionId))],
    });
    await flow.accept("proposal", "save", 1);
  }
  return {
    flow,
    request,
    draft,
    translate,
    inputs,
    labels,
    get target() {
      return target;
    },
    get calls() {
      return calls;
    },
    get localizationRequests() {
      return localizationRequests;
    },
    get writes() {
      return writes;
    },
    removeBase() {
      db.languageContext = async () => ({ source: null, versions: [] });
    },
  };
}

it.each(["fr-CA", "ar"])(
  "accepted %s translation reopens and exports with its exact persisted labels",
  async (locale) => {
    const h = harness(locale);
    await h.translate();
    const paid = h.calls;
    const reopened = decodeDraft(h.target.payload);
    expect(reopened.contentLanguage?.locale).toBe(locale);
    expect(documentLabels(reopened)).toEqual(h.labels);
    const preview = renderToStaticMarkup(
      <DocumentPreview
        draft={reopened}
        documentOnly
        asOf={{ year: "2026", month: "1" }}
      />,
    );
    const print = renderPrintHtml(reopened, ".document{color:black}");
    for (const html of [preview, print]) {
      expect(html).toContain(h.labels.experience);
      expect(html).toContain(`lang="${locale}"`);
      expect(html).not.toContain('role="status"');
    }
    await h.flow.accept("proposal", "save", 1);
    expect(h.calls).toBe(paid);
    expect(h.writes).toBe(1);
    // Scoped refresh reuses exact target resources, without another localization request.
    h.request.targetRevision = h.target.revision;
    h.request.sectionIds = [(await translationItems(h.draft))[0].sectionId];
    await h.translate();
    expect(h.localizationRequests).toBe(1);
    expect(h.inputs.at(-1).targetLabels).toEqual(h.labels);
    expect(documentLabels(decodeDraft(h.target.payload))).toEqual(h.labels);
  },
);
it("localizes only the first P09 batch and keeps the same catalog through a long CV acceptance", async () => {
  const h = harness("zh-Hant", true);
  await h.translate();
  expect(h.calls).toBeGreaterThan(1);
  expect(h.localizationRequests).toBe(1);
  expect(
    h.inputs
      .slice(1)
      .every(
        (i) => JSON.stringify(i.targetLabels) === JSON.stringify(h.labels),
      ),
  ).toBe(true);
  expect(documentLabels(decodeDraft(h.target.payload))).toEqual(h.labels);
});
