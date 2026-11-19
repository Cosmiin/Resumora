import { beforeEach, describe, expect, it } from "vitest";
import { buildRoleResult, emptyCv, fingerprint, type Experience, type ModelScore } from "@resumora/shared";
import { memoryCvRepo } from "../cv/memory-repo.ts";
import { ApiError } from "../errors.ts";
import { allSpecific, fakeModel, roleWith } from "./fake-model.ts";
import { memoryInsightsRepo } from "./memory-repo.ts";
import { proposeShape } from "./shape.ts";

const vevol = [
  "Managed Shopify and Shopify Plus stores for 5-10 client accounts across international markets.",
  "Coordinated with external developers to prioritize UX/UI updates for 5-10 client accounts.",
  "Implemented and tested new features for 5-10 client accounts in Shopify Plus via Asana.",
  "Executed ecommerce campaigns by configuring discount codes.",
  "Managed technical store operations for 5-10 client accounts in Asana.",
  "Designed visual assets in Canva to increase monthly revenue by 10–20%.",
  "Resolved 30–50 support tickets per week for the Noblesse Shopify theme.",
  "Organized the first Shopify Meetup in Eastern and Central Europe in 2025 for 50–100 attendees.",
];
const merged = "Coordinated external developers via Asana on UX/UI updates and new features for 5–10 Shopify Plus client accounts.";

let role: Experience;
let cv: ReturnType<typeof memoryCvRepo>;
let insights: ReturnType<typeof memoryInsightsRepo>;
let model: ReturnType<typeof fakeModel>;

async function save(r: Experience, change?: (b: ModelScore["bullets"][number], i: number) => void) {
  role = r;
  await cv.save({ ...emptyCv("en"), experience: [role] }, (await cv.get()).version);
  await insights.put(role.id, buildRoleResult(role, allSpecific(role, change), fingerprint(role, "en")));
}
const ids = (...n: number[]) => n.map((i) => role.bullets[i]!.id);
const run = () => proposeShape({ cv, insights, model: model.deps, userId: "user-a" }, { roleId: role.id, fingerprint: fingerprint(role, "en") });

beforeEach(async () => {
  cv = memoryCvRepo();
  insights = memoryInsightsRepo("user-a");
  await save(roleWith(vevol));
  model = fakeModel(() => ({ merges: [{ ids: ids(1, 2, 4), text: merged }] }));
});

describe("proposeShape", () => {
  it("proposes a merge that keeps every number, from the role's grades", async () => {
    expect(await run()).toEqual({ merges: [{ ids: ids(1, 2, 4), text: merged }] });
    expect(model.logged.map((l) => l.task)).toEqual(["enrich_shape"]);
    const user = (model.requests[0]!.messages as { content: string }[])[1]!.content;
    expect(user).toContain("Line average:");
    expect(user).toContain("A merged line must not be weaker than the lines it replaces.");
  });

  it("409 when the role changed since the fingerprint", async () => {
    const stale = proposeShape({ cv, insights, model: model.deps, userId: "user-a" }, { roleId: role.id, fingerprint: "old" });
    await expect(stale).rejects.toMatchObject({ status: 409, code: "not_saved" } satisfies Partial<ApiError>);
  });

  it("makes no model call for a clean role of 6 lines or fewer", async () => {
    await save(roleWith(vevol.slice(0, 5)));
    expect(await run()).toEqual({ merges: [] });
    expect(model.requests).toHaveLength(0);
  });

  it("drops a merge that loses a number", async () => {
    model = fakeModel(() => ({ merges: [{ ids: ids(1, 2), text: "Coordinated developers on updates and features for several clients." }] }));
    expect(await run()).toEqual({ merges: [] });
  });

  it("drops a merge that reuses a line from another merge, or names an unknown line", async () => {
    model = fakeModel(() => ({ merges: [
      { ids: ids(1, 2, 4), text: merged },
      { ids: [role.bullets[4]!.id, role.bullets[6]!.id], text: "Managed operations and resolved 30–50 tickets for 5-10 client accounts in Asana." },
      { ids: [role.bullets[0]!.id, "nope"], text: "Managed stores for 5-10 client accounts." },
    ] }));
    expect(await run()).toEqual({ merges: [{ ids: ids(1, 2, 4), text: merged }] });
  });

  it("drops a merge of more than six lines", async () => {
    model = fakeModel(() => ({ merges: [{ ids: ids(0, 1, 2, 3, 4, 5, 6), text: "Ran Shopify stores, campaigns and 30–50 weekly tickets for 5-10 client accounts, lifting revenue 10–20%." }] }));
    expect(await run()).toEqual({ merges: [] });
  });

  it("drops a merged line over 440 characters, and one that is just an original line", async () => {
    model = fakeModel(() => ({ merges: [
      { ids: ids(1, 2), text: `${merged} ${"x".repeat(441 - merged.length - 1)}` },
      { ids: ids(4, 5), text: vevol[4]! },
    ] }));
    expect(await run()).toEqual({ merges: [] });
  });

  it("with 6 lines or fewer, keeps only a merge of a repeated line", async () => {
    await save(roleWith(vevol.slice(0, 5)), (b, i) => { if (i === 4) Object.assign(b, { issue: "duplicate", duplicateOf: role.bullets[2]!.id }); });
    model = fakeModel(() => ({ merges: [
      { ids: ids(0, 3), text: "Managed Shopify stores and discount-code campaigns for 5-10 client accounts across international markets." },
      { ids: ids(2, 4), text: "Implemented features and ran store operations for 5-10 client accounts in Shopify Plus via Asana." },
    ] }));
    expect(await run()).toEqual({ merges: [{ ids: ids(2, 4), text: "Implemented features and ran store operations for 5-10 client accounts in Shopify Plus via Asana." }] });
  });
});
