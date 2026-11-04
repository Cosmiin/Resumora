import { render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { overviewFields } from "@resumora/contracts/jobs/workflow";
import { JobWorkflowPanel } from "./JobWorkflow";
import { LanguageContext } from "./ui";

const sourceUrl =
  "https://www.bestjobs.eu/loc-de-munca/it-project-manager-mid-level-1";
const requirement =
  "Minimum 3 ani experiență într-un rol de Project Manager IT";
const job = {
  id: crypto.randomUUID(),
  state: "draft",
  versionId: null,
  createdAt: "2026-11-03T00:00:00Z",
  snapshotId: null,
  snapshotRevision: null,
  intake: { text: requirement, sourceUrl },
  requirements: [],
};
function show(extracted: unknown) {
  const transport = vi.fn(async (_path: string, _init?: RequestInit) =>
    Response.json({
      revision: 1,
      extracted,
      reviewed: null,
      operations: [],
      duplicates: [],
      sourceParentId: null,
      sourceText: requirement,
      aiEnabled: true,
    }),
  );
  render(
    <LanguageContext value="en">
      <JobWorkflowPanel
        job={job as any}
        transport={transport}
        ready
        panel="details"
      />
    </LanguageContext>,
  );
  return transport;
}
it("shows captured text while extraction is pending without expanding a hidden source", async () => {
  show(null);
  const source = await screen.findByText("Original advert and source");
  expect(source.closest("details")?.open).toBe(true);
  expect(
    screen.getByRole("link", { name: "Open source" }).getAttribute("href"),
  ).toBe(sourceUrl);
});
it("shows extracted employer and requirements without saving a manual review", async () => {
  const transport = show({
    schemaVersion: "vacancy-extraction/3",
    sourceLocale: "ro",
    overview: {
      ...Object.fromEntries(overviewFields.map((k) => [k, null])),
      title: { value: "IT Project Manager (Mid-Level)", evidence: [] },
      company: { value: "OTTO BROKER DE ASIGURARE", evidence: [] },
    },
    requirements: [
      {
        id: "requirement",
        text: requirement,
        categories: ["experience"],
        priority: "required",
        emphasis: "central",
        operator: "and",
        components: [{ id: "component", text: requirement }],
        evidence: [],
        eligibility: false,
        origin: "extracted",
      },
    ],
    issues: [],
    completeness: "complete",
  });
  const description = await screen.findByRole("region", {
    name: "Job description",
  });
  expect(
    within(description).getByText("OTTO BROKER DE ASIGURARE"),
  ).toBeTruthy();
  expect(within(description).getByText(requirement)).toBeTruthy();
  expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(
    "IT Project Manager (Mid-Level)",
  );
  expect(transport.mock.calls.every((call) => call.length === 1)).toBe(true);
});
