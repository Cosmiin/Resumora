import { maraReviewDraft } from "../../apps/web/src/base/fixture";
import {
  clone,
  fact,
  newOptionalEntry,
  allFacts,
} from "../../apps/web/src/base/model";
import {
  chooseTemplate,
  cvTemplates,
} from "../../apps/web/src/templates/registry";
export { cvTemplates };
export function exportFixture(
  template: number,
  language: "ro" | "en",
  long: boolean,
  photo: boolean,
) {
  const draft = chooseTemplate(
    maraReviewDraft(),
    cvTemplates[template].versionId,
  );
  draft.language = language;
  draft.name.value = "Mara Șerban Țăndărică";
  draft.summary.text =
    language === "ro"
      ? "Am automatizat raportarea săptămânală a tichetelor de suport."
      : "Automated weekly support-ticket reporting.";
  draft.summary.approval = "approved";
  draft.roles[0].context.value =
    language === "ro"
      ? "Am scris instrucțiuni pentru colegi despre rularea și verificarea raportului."
      : "Wrote instructions for colleagues on running and checking the report.";
  draft.contacts.push({
    id: "synthetic_phone",
    kind: "phone",
    visible: true,
    value: fact("+40 700 000 000"),
  });
  draft.contacts.push({
    id: "synthetic_linkedin",
    kind: "social",
    platform: "linkedin",
    visible: true,
    value: fact("https://www.linkedin.com/in/resumora-synthetic-example"),
  });
  const languageEntry = newOptionalEntry();
  languageEntry.title = fact("Romanian");
  languageEntry.proficiency = fact("Native");
  let languages = draft.optionalSections.find((s) => s.kind === "languages");
  if (!languages) {
    languages = { id: "languages", kind: "languages", label: "", entries: [] };
    draft.optionalSections.push(languages);
    draft.presentation.order.push("languages");
  }
  languages.entries.push(languageEntry);
  draft.contacts[0].value.value =
    "mara.serban.synthetic.long.email@example.test";
  draft.contacts.push({
    id: "synthetic_web",
    kind: "social",
    platform: "website",
    visible: true,
    value: fact(
      "https://example.test/a-very-long-path/synthetic-profile-automation-engineer",
    ),
  });
  draft.presentation.photo = {
    assetId: "11111111-1111-4111-8111-111111111111",
    visible: photo,
    shape: "circle",
    crop: { version: 1, centerX: 0.5, centerY: 0.5, zoom: 1.5 },
  };
  const project = newOptionalEntry();
  project.title = fact("Synthetic custom project");
  project.details = fact(
    "SQL, Power Automate, Python, PostgreSQL, Supabase, REST API — 37 tickets, 12%.",
  );
  draft.optionalSections.push({
    id: "synthetic_project",
    kind: "custom",
    label: "Selected projects",
    entries: [project],
  });
  draft.presentation.order.push("synthetic_project");
  if (long)
    for (let i = 0; i < 5; i++) {
      const role = clone(draft.roles[0]);
      role.id += `_${i}`;
      role.title.value = `Synthetic role ${i + 1}`;
      role.context.value = (role.context.value + " ").repeat(10);
      for (const value of [
        ...Object.values(role).filter(
          (v) => typeof v === "object" && v && "fieldId" in v,
        ),
        ...role.bullets,
      ]) {
        value.id += `_${i}`;
        value.fieldId += `_${i}`;
      }
      draft.roles.push(role);
    }
  allFacts(draft).forEach((f) => (f.status = "user_authored"));
  return draft;
}
