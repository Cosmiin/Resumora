import { clone, type BaseDraft } from "../base/model";

export type CvTemplate = {
  id: string;
  version: string;
  versionId: string;
  name: string;
  className: string;
  entry: "stacked" | "compact";
  photoPlacement: "nameband" | "above";
  description: { ro: string; en: string };
};

// Only the five explicitly selected 2.1.0 candidates belong in the product.
// Version IDs follow the existing canonical CV ID grammar. Never retarget an
// existing version to a different design: add a new version and retain history.
export const cvTemplates: readonly CvTemplate[] = [
  {
    id: "T01",
    version: "2.1.0",
    versionId: "template_folio_2_1_0",
    name: "Folio",
    className: "template-folio",
    entry: "stacked",
    photoPlacement: "nameband",
    description: {
      ro: "Discret, cu ierarhie clară și detalii pe rânduri separate.",
      en: "Quiet hierarchy with role and employer on separate lines.",
    },
  },
  {
    id: "T02",
    version: "2.1.0",
    versionId: "template_meridian_2_1_0",
    name: "Meridian",
    className: "template-meridian",
    entry: "stacked",
    photoPlacement: "nameband",
    description: {
      ro: "Titlurile profesionale în prim-plan, cu accente ferme.",
      en: "Professional titles lead, with confident visual hierarchy.",
    },
  },
  {
    id: "T05",
    version: "2.1.0",
    versionId: "template_signal_2_1_0",
    name: "Signal",
    className: "template-signal",
    entry: "compact",
    photoPlacement: "nameband",
    description: {
      ro: "Contemporan, cu profil accentuat și experiență compactă.",
      en: "Contemporary profile emphasis and compact career headings.",
    },
  },
  {
    id: "T06",
    version: "2.1.0",
    versionId: "template_archive_2_1_0",
    name: "Archive",
    className: "template-archive",
    entry: "stacked",
    photoPlacement: "above",
    description: {
      ro: "Tradițional, cu antet centrat și tipografie serif.",
      en: "Traditional centered identity and formal serif typography.",
    },
  },
  {
    id: "T08",
    version: "2.1.0",
    versionId: "template_monograph_2_1_0",
    name: "Monograph",
    className: "template-monograph",
    entry: "stacked",
    photoPlacement: "nameband",
    description: {
      ro: "Structurat, cu titluri puternice și delimitări vizibile.",
      en: "Strong headings and clear section divisions.",
    },
  },
];

export function resolveTemplate(
  versionId: string | undefined,
): CvTemplate | undefined {
  return cvTemplates.find((template) => template.versionId === versionId);
}

export function chooseTemplate(draft: BaseDraft, versionId: string): BaseDraft {
  if (versionId && !resolveTemplate(versionId))
    throw new Error("unavailableTemplate");
  const next = clone(draft);
  if (versionId) next.presentation.templateVersionId = versionId;
  else delete next.presentation.templateVersionId;
  return next;
}
