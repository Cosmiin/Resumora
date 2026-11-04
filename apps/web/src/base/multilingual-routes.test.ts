import { expect, it } from "vitest";
import { workspaceLocation } from "./routes";
import { HttpJobCvAdapter } from "./job-adapter";
import { blankDraft } from "./model";
it.each(["fr-CA", "ar", "zh-Hant", "en-US"])(
  "preserves full %s representation route",
  (locale) => {
    expect(workspaceLocation(`#/profile/cv/${locale}`).locale).toBe(locale);
    expect(
      workspaceLocation(
        `#/jobs/12345678-1234-4234-8234-123456789012/cv/${locale}`,
      ).locale,
    ).toBe(locale);
  },
);
it("a new retained job projection keeps its requested full language", async () => {
  const draft = blankDraft();
  draft.language = "fr-CA";
  draft.documentLocale = "fr-CA";
  const adapter = new HttpJobCvAdapter(
    async (path) =>
      Response.json(
        path.endsWith("/context")
          ? { source: { snapshotId: "source" }, draft }
          : null,
      ),
    "job",
    "ar",
  );
  await adapter.load();
  expect(adapter.initialDraft().documentLocale).toBe("ar");
});
it("keeps explicit script direction instead of assuming every locale shares its primary language direction", async () => {
  const { contentDirection } = await import("../languages/direction");
  expect(contentDirection("az-Arab")).toBe("rtl");
  expect(contentDirection("ar-Latn")).toBe("ltr");
});
