import { expect, it } from "vitest";
import { DocumentController } from "./document-controller";
import { MemoryBaseCvAdapter } from "../base/adapter";
import { maraReviewDraft } from "../base/fixture";
async function fixture() {
  const adapter = new MemoryBaseCvAdapter(),
    draft = maraReviewDraft(),
    base = await adapter.save({
      draft,
      expectedRevision: 0,
      requestId: crypto.randomUUID(),
      mode: "autosave",
    }),
    saved = await adapter.save({
      draft,
      expectedRevision: 1,
      requestId: crypto.randomUUID(),
      mode: "autosave",
    }),
    controller = new DocumentController();
  controller.head.current = base;
  controller.latest.current = base.draft;
  return { controller, base, saved };
}
it("applies an integration only to its unchanged acknowledged parent, and accepts exact replay", async () => {
  const f = await fixture();
  f.controller.acceptIntegration(f.saved);
  expect(f.controller.head.current?.id).toBe(f.saved.id);
  f.controller.acceptIntegration(f.saved);
  expect(f.controller.latest.current).toEqual(f.saved.draft);
});
it.each(["removed", "newer", "unsent"] as const)(
  "a late integration response cannot restore a %s profile",
  async (kind) => {
    const f = await fixture();
    if (kind === "removed") {
      f.controller.head.current = null;
      f.controller.latest.current = null;
    } else if (kind === "newer")
      f.controller.head.current = { ...f.base, id: crypto.randomUUID() };
    else f.controller.unsaved = true;
    const before = f.controller.head.current;
    expect(() => f.controller.acceptIntegration(f.saved)).toThrow(
      "staleIntegration",
    );
    expect(f.controller.head.current).toBe(before);
    if (kind === "removed") expect(f.controller.latest.current).toBeNull();
  },
);


it("blocks integrations while skills are being improved", async () => {
  const {controller, saved, base} = await fixture();
  controller.setSkillsImproving(true);
  expect(controller.profileChangesBlocked()).toBe(true);
  expect(() => controller.acceptIntegration(saved)).toThrow("staleIntegration");
  expect(controller.latest.current).toEqual(base.draft);
  controller.setSkillsImproving(false);
  controller.acceptIntegration(saved);
  expect(controller.latest.current).toEqual(saved.draft);
});
