import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fact } from "@resumora/contracts/editor/model";
import { decodeDraft } from "@resumora/contracts/editor/transport";
import {
  translationItems,
  materializeTranslation,
  staleTranslationComponents,
  componentFingerprint,
} from "@resumora/contracts/editor/languages";
const payload = JSON.parse(
  await readFile(
    new URL(
      "../../../packages/contracts/fixtures/cv-import.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const source = () => {
  const d = decodeDraft(payload);
  d.presentation.order = [...new Set(["identity", ...d.presentation.order])];
  d.presentation.hidden = d.presentation.hidden.filter(
    (id) => id !== "identity",
  );
  d.titles[0].value = "Automation Engineer";
  d.contacts.push({
    id: "synthetic-contact",
    kind: "email",
    visible: true,
    value: fact("synthetic@example.test"),
  });
  return d;
};
async function request(draft = source()) {
  return {
    contentType: "cv",
    sourceLocale: "ro-RO",
    targetLocale: "en-GB",
    sourceDocumentId: "source",
    sourceVersionId: "current-source",
    sourceRevision: 1,
    items: await translationItems(draft),
    glossaryVersion: "1",
    approvedGlossary: [],
    translationPreferences: { regionalTerminology: "" },
  };
}
const result = (input) => ({
  schemaVersion: "cv-translation/1",
  sourceLocale: input.sourceLocale,
  targetLocale: input.targetLocale,
  completion: "complete",
  items: input.items.map((i) => ({
    id: i.id,
    fieldId: i.fieldId,
    text: "Translated: " + i.text,
    factIds: i.factIds,
    evidenceIds: i.evidenceIds,
  })),
  warnings: [],
  ambiguousTerms: [],
  suggestedGlossary: [],
});
test("professional context excludes contact/photo/raw sources and exact career answers", async () => {
  const d = source();
  d.name.value = "PRIVATE_CANDIDATE";
  d.contacts[0].value.value = "private-contact@example.test";
  d.sources.push({
    id: "private-source",
    kind: "document",
    label: "private",
    text: "PRIVATE_RAW_DOCUMENT",
  });
  d.answers.push({
    id: "private-answer",
    targetId: d.roles[0].id,
    question: "context",
    status: "confirmed",
    text: "PRIVATE_ANSWER",
    questionText: "PRIVATE_QUESTION",
  });
  const items = await translationItems(d);
  const data = JSON.stringify(items);
  for (const secret of [
    "PRIVATE_CANDIDATE",
    "private-contact@example.test",
    "PRIVATE_RAW_DOCUMENT",
    "PRIVATE_ANSWER",
    "PRIVATE_QUESTION",
  ])
    assert.ok(!data.includes(secret));
  assert.ok(
    items.every((i) => i.id === i.fieldId && i.sourceFingerprint.length === 64),
  );
});
test("materialization changes language wording with stable handles, preserving facts/names/dates/evidence and original source", async () => {
  const d = source(),
    before = structuredClone(d),
    input = await request(d);
  const target = await materializeTranslation(d, input, result(input));
  assert.deepEqual(d, before);
  assert.equal(target.language, "en");
  assert.deepEqual(target.name, d.name);
  assert.deepEqual(target.contacts, d.contacts);
  assert.deepEqual(target.sources, d.sources);
  assert.deepEqual(target.answers, d.answers);
  for (let i = 0; i < d.roles.length; i++) {
    assert.deepEqual(target.roles[i].company, d.roles[i].company);
    assert.deepEqual(target.roles[i].start, d.roles[i].start);
    assert.deepEqual(target.roles[i].end, d.roles[i].end);
    assert.equal(target.roles[i].title.fieldId, d.roles[i].title.fieldId);
  }
});
test("changed-source detection marks only affected stable components and does not mutate accepted target wording", async () => {
  const d = source(),
    input = await request(d),
    lineage = {
      schemaVersion: "cv-language/1",
      documentLocale: "en-GB",
      sourceLocale: "ro-RO",
      source: {
        kind: "base",
        documentId: "source",
        currentId: "source-current",
        revision: 1,
        fingerprint: "a".repeat(64),
      },
      glossaryVersion: "1",
      components: input.items.map(({ text, protectedTerms, ...i }) => i),
    };
  assert.deepEqual(await staleTranslationComponents(lineage, d), []);
  const changed = structuredClone(d);
  changed.titles[0].value += " changed";
  assert.deepEqual(await staleTranslationComponents(lineage, changed), [
    changed.titles[0].fieldId,
  ]);
  await assert.rejects(
    materializeTranslation(changed, input, result(input)),
    /STALE_SOURCE/,
  );
});
test("wrong source-field association and tampered input text fail even with copied fingerprints", async () => {
  const input = await request();
  const output = result(input);
  input.items[0].text = "Forged 999";
  await assert.rejects(
    materializeTranslation(source(), input, output),
    /STALE_SOURCE/,
  );
});
test("hashing unchanged professional text is stable across interface/template/photo changes", async () => {
  const d = source(),
    before = await translationItems(d);
  d.presentation.templateVersionId = "template_signal_2_1_0";
  d.presentation.photo = {
    assetId: "11111111-1111-4111-8111-111111111111",
    visible: false,
    shape: "square",
    crop: { version: 1, centerX: 0.5, centerY: 0.5, zoom: 1 },
  };
  assert.deepEqual(await translationItems(d), before);
  assert.equal(
    await componentFingerprint(before),
    await componentFingerprint(await translationItems(d)),
  );
});
