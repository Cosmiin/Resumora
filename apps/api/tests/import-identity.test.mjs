import test from "node:test";
import assert from "node:assert/strict";
import { validateExtraction } from "../../../packages/contracts/src/intelligence/model.ts";
import {
  importedDraft,
  confirmImported,
  importedFact,
  pendingImportedCandidates,
  editImportedNamePart,
} from "../../../packages/contracts/src/editor/import.ts";
import {
  encodeDraft,
  decodeDraft,
} from "../../../packages/contracts/src/editor/transport.ts";
import { intelligenceOperations } from "../src/intelligence/operations.ts";
const page = { number: 1, warnings: [] };
function extraction(rows) {
  return {
    schemaVersion: "cv-extraction/1",
    candidates: rows.map(
      ([path, value, quote = value, confidence = "low"], i) => ({
        id: "c" + i,
        path,
        value,
        quote,
        confidence,
        page: 1,
      }),
    ),
    warnings: [],
    omittedPages: [],
  };
}
function review(extracted) {
  return {
    id: "synthetic-import",
    sourceHash: "a".repeat(64),
    format: "pdf",
    parserVersion: "synthetic/1",
    pages: 1,
    admission: { kind: "cv", reason: "CV", pages: [1] },
    extraction: validateExtraction(extracted, [page]),
    confirmedIds: [],
  };
}
for (const [locale, first, last, quote] of [
  ["en", "Eleanor Mary", "Hart-Smith", "Eleanor Mary Hart-Smith"],
  ["ro", "Ana-Maria", "Șerban Ionescu", "Șerban Ionescu, Ana-Maria"],
])
  test(`source-grounded ${locale} names populate actual parts without token-order assumptions and survive review/reopen`, () => {
    const r = review(
      extraction([
        ["name", quote],
        ["nameParts.last", last, quote],
        ["nameParts.first", first, quote],
      ]),
    );
    const d = importedDraft(r);
    assert.deepEqual(d.nameParts, { first, last });
    assert.equal(d.name.value, `${first} ${last}`);
    assert.equal(d.name.status, "extracted_unconfirmed");
    assert.equal(
      importedFact(d, r.extraction.candidates[0]),
      undefined,
      "redundant combined candidate stays history, not another confirmation",
    );
    assert.ok(d.sources.some((s) => s.text === quote));
    const ids = r.extraction.candidates
      .filter((c) => c.path.startsWith("nameParts."))
      .map((c) => c.id);
    const half = confirmImported(d, [ids[0]]);
    assert.equal(half.name.status, "extracted_unconfirmed");
    const accepted = confirmImported(half, [ids[1]]);
    assert.equal(accepted.name.status, "user_confirmed");
    assert.deepEqual(decodeDraft(encodeDraft(accepted)).nameParts, {
      first,
      last,
    });
    assert.equal(pendingImportedCandidates(accepted).length, 0);
    assert.deepEqual(d.importReview.confirmedIds, []);
  });
test("high-confidence explicit names stay extracted automatically accepted, never falsely user-confirmed", () => {
  const r = review(
    extraction([
      ["nameParts.first", "Ana", "Prenume: Ana", "high"],
      ["nameParts.last", "Popescu", "Nume de familie: Popescu", "high"],
    ]),
  );
  const d = importedDraft(r);
  assert.deepEqual(d.nameParts, { first: "Ana", last: "Popescu" });
  assert.equal(d.name.acceptance, "automatic");
  assert.equal(d.name.status, "extracted_unconfirmed");
  assert.deepEqual(d.importReview.confirmedIds, []);
  assert.equal(pendingImportedCandidates(d).length, 0);
});
test("full-name-only, ambiguous order and missing parts are preserved without fabricated split", () => {
  for (const full of ["Alex Kim", "ȘERBAN IONESCU ANA-MARIA", "Madonna"]) {
    const d = importedDraft(review(extraction([["name", full]])));
    assert.equal(d.name.value, full);
    assert.equal(d.nameParts, undefined);
    assert.equal(decodeDraft(encodeDraft(d)).name.value, full);
  }
  const d = importedDraft(
    review(
      extraction([
        ["name", "Ana Șerban"],
        ["nameParts.first", "Ana", "Prenume: Ana"],
      ]),
    ),
  );
  assert.deepEqual(d.nameParts, { first: "Ana", last: "" });
  assert.equal(d.name.value, "Ana Șerban");
});
test("review edits preserve the other manual name part, source lineage and original extraction through confirmation", () => {
  const r = review(
    extraction([
      ["nameParts.first", "Ana", "Prenume: Ana"],
      ["nameParts.last", "Popescu", "Nume de familie: Popescu"],
    ]),
  );
  let d = editImportedNamePart(importedDraft(r), "first", "Ana Maria");
  d = editImportedNamePart(d, "last", "Popescu-Dumitru");
  const changed = confirmImported(d, ["c0", "c1"]);
  assert.deepEqual(changed.nameParts, {
    first: "Ana Maria",
    last: "Popescu-Dumitru",
  });
  assert.equal(changed.name.value, "Ana Maria Popescu-Dumitru");
  assert.equal(changed.name.status, "user_authored");
  assert.equal(changed.importReview.extraction.candidates[0].value, "Ana");
  assert.ok(
    changed.name.sourceLineage.some((ref) => ref.sourceClaimId === "c1"),
  );
  assert.deepEqual(
    decodeDraft(encodeDraft(changed)).nameParts,
    changed.nameParts,
  );
});
test("empty or unsupported name values reject extraction without mutating saved manual identity", () => {
  const d = importedDraft(
    review(
      extraction([
        ["nameParts.first", "Ana"],
        ["nameParts.last", "Popescu"],
      ]),
    ),
  );
  const before = structuredClone(d);
  for (const value of ["", "Not present"])
    assert.throws(() =>
      review(extraction([["nameParts.first", value, "Ana Popescu"]])),
    );
  assert.deepEqual(d, before);
});
test("actual extraction operation validates separately identified names and maps a synthetic Romanian CV", async () => {
  const e = extraction([
    ["nameParts.first", "Ana-Maria", "Prenume: Ana-Maria"],
    ["nameParts.last", "Șerban Ionescu", "Nume de familie: Șerban Ionescu"],
  ]);
  const stages = [];
  const ops = intelligenceOperations(async (request) => {
    stages.push(request.stage);
    const output =
      request.stage === "admit" ? { kind: "cv", reason: "CV", pages: [1] } : e;
    request.validateOutput(output);
    return output;
  });
  const result = await ops.extract({
    operationId: crypto.randomUUID(),
    userId: crypto.randomUUID(),
    document: {
      schemaVersion: "document-pages/1",
      format: "pdf",
      sha256: "a".repeat(64),
      parserVersion: "synthetic",
      pages: [page],
      fileBase64: "c3ludGhldGlj",
    },
  });
  const d = importedDraft({ ...review(e), ...result });
  assert.deepEqual(stages, ["admit", "extract"]);
  assert.deepEqual(d.nameParts, { first: "Ana-Maria", last: "Șerban Ionescu" });
});
